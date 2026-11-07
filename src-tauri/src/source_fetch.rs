use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use md5::{Digest, Md5};
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::header::{ACCEPT, CONTENT_TYPE, COOKIE, REFERER, RETRY_AFTER};
use reqwest::redirect::Policy;
use reqwest::{Client, RequestBuilder, Response, Url};
use tauri::ipc::Channel;
use tokio::sync::Semaphore;
use tokio::task::{AbortHandle, JoinSet};

use crate::recovered::{self, RecoveredSet};
use crate::site::Site;

/// Cap on one recovered file. e621's own upload limit is 100 MB, and recovered files go to disk
/// (the cache in `recovered.rs`), not over IPC, so there's no reason to stop short of it.
const MAX_MEDIA_BYTES: usize = 100 * 1024 * 1024;
/// Cap on how much of an HTML page is read while looking for its image (the tags live in `<head>`).
const MAX_HTML_BYTES: usize = 2 * 1024 * 1024;
/// Whole-request limits: pages and JSON lookups are small; media can be a 100 MB video. A stalled
/// transfer is caught sooner by the client's `read_timeout` (idle time between reads).
const PAGE_TIMEOUT: Duration = Duration::from_secs(20);
const MEDIA_TIMEOUT: Duration = Duration::from_secs(120);
const READ_IDLE_TIMEOUT: Duration = Duration::from_secs(20);
/// Wall-clock budgets for the two phases, so a post with many dead sources can't spin for minutes.
/// Whatever was found when a budget runs out is kept.
const LIVE_BUDGET: Duration = Duration::from_secs(120);
const ARCHIVE_BUDGET: Duration = Duration::from_secs(120);
/// Sources on different hosts are tried in parallel, this many hosts at a time; sources on the
/// same host always run one after another, so no single site sees a burst from us.
const PARALLEL_HOSTS: usize = 3;
/// How many Wayback captures of one URL get tried (spread from the oldest to the newest).
const WAYBACK_CAPTURES_PER_TARGET: usize = 4;
/// How many files from one source (a tweet, a multi-page work) get downloaded and compared.
const MAX_CANDIDATES_PER_SOURCE: usize = 12;

/// Dev-build-only trace of the recovery steps (visible in the `tauri dev` terminal).
fn trace(msg: impl AsRef<str>) {
    if cfg!(debug_assertions) {
        eprintln!("[recover] {}", msg.as_ref());
    }
}

/// One recovered file, kept in the post's cache folder (see `recovered.rs`).
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct RecoveredImage {
    /// File name inside the post's cache folder (`<md5>.<ext>`).
    pub file: String,
    /// Absolute path of that file, for the webview's asset protocol. Filled in on load.
    #[serde(default)]
    pub path: String,
    pub md5: String,
    /// The source URL (from the post's `sources`) that this file was recovered through.
    pub source_url: String,
    /// The URL the bytes were actually fetched from (differs from `source_url` when it was an
    /// `og:image` found on a page, a site lookup's result, or an upgraded thumbnail URL).
    pub image_url: String,
    /// The file's real type, from its leading bytes (not whatever the server claimed).
    pub mime: String,
    #[serde(default)]
    pub is_video: bool,
    pub size_bytes: usize,
    /// True when the file came from a Wayback Machine capture rather than the live site.
    pub via_archive: bool,
    /// How closely this matches the deleted post's own file (see `Grade`), judged against the
    /// md5/size/dimensions/format e621 keeps for the post.
    pub grade: Grade,
    pub md5_match: bool,
    /// Pixel dimensions of the recovered file (0 for videos - not parsed), and the original's
    /// (0 when e621 didn't report them).
    pub width: i64,
    pub height: i64,
    pub expected_width: i64,
    pub expected_height: i64,
    pub expected_size: i64,
    /// Human-readable differences from the original ("png instead of jpg", "smaller file", ...).
    pub notes: Vec<String>,
    /// Ranking key, best highest: grade, then format match, then byte-size closeness.
    #[serde(default)]
    pub score: i64,
}

/// What e621 still knows about a deleted post's file (everything but its URLs).
#[derive(serde::Deserialize, Default, Clone)]
pub struct Expected {
    #[serde(default)]
    pub md5: Option<String>,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub width: i64,
    #[serde(default)]
    pub height: i64,
    #[serde(default)]
    pub ext: String,
}

impl Expected {
    fn is_video(&self) -> bool {
        matches!(normalize_ext(&self.ext).as_str(), "webm" | "mp4")
    }
}

/// How close a recovered file is to the original, best first.
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Grade {
    /// Different shape from the original (cropped, a different image of the set, a placeholder,
    /// or a still image of a video post).
    Mismatch,
    /// Same picture at another resolution (a preview, or a larger re-host) - or a video that
    /// isn't byte-identical (its resolution isn't checked).
    Rescaled,
    /// Same pixel dimensions, but not the same bytes (re-encoded or metadata-stripped).
    SameDimensions,
    /// Byte-identical to the original (md5 matches).
    Exact,
}

/// One status line for the viewer's loading state. `stage` is a stable key; `message` is display text.
#[derive(serde::Serialize, Clone)]
pub struct RecoverProgress {
    pub stage: &'static str,
    pub message: String,
}

fn progress(ch: &Channel<RecoverProgress>, stage: &'static str, message: impl Into<String>) {
    let message = message.into();
    trace(format!("[{stage}] {message}"));
    let _ = ch.send(RecoverProgress { stage, message });
}

fn host_of(url: &Url) -> String {
    url.host_str().unwrap_or("unknown host").trim_start_matches("www.").to_string()
}

/// "jpeg" -> "jpg", etc., lowercased; empty stays empty.
fn normalize_ext(ext: &str) -> String {
    let e = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    if e == "jpeg" { "jpg".into() } else { e }
}

fn ext_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/avif" => "avif",
        "video/webm" => "webm",
        "video/mp4" => "mp4",
        _ => "",
    }
}

/// The file's real type from its leading bytes. Servers mislabel files all the time (an
/// `application/octet-stream` image, an HTML error page served as `image/png`), so this - not the
/// `Content-Type` - decides what a download is. `None` for anything the viewer can't show.
fn sniff_mime(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else if b.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        Some("video/webm")
    } else if b.len() >= 12 && &b[4..8] == b"ftyp" {
        match &b[8..12] {
            b"avif" | b"avis" => Some("image/avif"),
            // HEIF/HEIC stills - WebView2 can't display them.
            b"heic" | b"heix" | b"heim" | b"heis" | b"mif1" | b"msf1" => None,
            _ => Some("video/mp4"),
        }
    } else {
        None
    }
}

fn md5_hex(bytes: &[u8]) -> String {
    Md5::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// Compares fetched bytes with what e621 kept about the post. `None` when the bytes aren't a file
/// the viewer can show at all. `file`/`path` are left empty for the caller to fill in once stored.
fn score_candidate(
    expected: &Expected,
    source: &str,
    bytes: &[u8],
    image_url: &Url,
    via_archive: bool,
) -> Option<RecoveredImage> {
    let mime = sniff_mime(bytes)?;
    let is_video = mime.starts_with("video/");
    let (w, h) = if is_video {
        (0, 0)
    } else {
        let dims = imagesize::blob_size(bytes).ok()?;
        (dims.width as i64, dims.height as i64)
    };
    let mut notes = Vec::new();

    let got_md5 = md5_hex(bytes);
    let md5_match = expected.md5.as_deref().is_some_and(|m| m.trim().eq_ignore_ascii_case(&got_md5));

    let want_ext = normalize_ext(&expected.ext);
    let got_ext = ext_for_mime(mime);
    let ext_match = want_ext.is_empty() || want_ext == got_ext;
    if !ext_match {
        notes.push(format!("{got_ext} instead of {want_ext}"));
    }

    let have_dims = expected.width > 0 && expected.height > 0;
    let same_dims = have_dims && w == expected.width && h == expected.height;
    let size_ratio = if expected.size > 0 { bytes.len() as f64 / expected.size as f64 } else { 1.0 };

    let grade = if md5_match {
        Grade::Exact
    } else if expected.is_video() && !is_video {
        notes.push("a still image of a video post".into());
        Grade::Mismatch
    } else if is_video {
        notes.push("video - resolution not checked".into());
        Grade::Rescaled
    } else if same_dims || !have_dims {
        Grade::SameDimensions
    } else {
        let aspect_off = ((w as f64 / h as f64) / (expected.width as f64 / expected.height as f64) - 1.0).abs();
        if aspect_off <= 0.015 { Grade::Rescaled } else { Grade::Mismatch }
    };

    if !md5_match {
        if have_dims && !is_video && !same_dims {
            notes.push(format!("{w}x{h} instead of {}x{}", expected.width, expected.height));
        }
        if expected.size > 0 && (size_ratio < 0.9 || size_ratio > 1.1) {
            notes.push(if size_ratio < 1.0 { "smaller file than the original".into() } else { "larger file than the original".into() });
        }
    }
    if grade == Grade::Mismatch && !is_video && !expected.is_video() {
        notes.push("shape differs from the original".into());
    }

    // Closeness of the byte size, 0..=100 (100 = same size). Only a tiebreaker within a grade.
    let closeness = if expected.size > 0 {
        let r = size_ratio.max(1e-6);
        (100.0 * r.min(1.0 / r)).round() as i64
    } else {
        0
    };
    let score = (grade as i64) * 1000 + if ext_match { 100 } else { 0 } + closeness;

    Some(RecoveredImage {
        file: String::new(),
        path: String::new(),
        md5: got_md5,
        source_url: source.to_string(),
        image_url: image_url.to_string(),
        mime: mime.to_string(),
        is_video,
        size_bytes: bytes.len(),
        via_archive,
        grade,
        md5_match,
        width: w,
        height: h,
        expected_width: expected.width,
        expected_height: expected.height,
        expected_size: expected.size,
        notes,
        score,
    })
}

fn grade_label(grade: Grade) -> &'static str {
    match grade {
        Grade::Exact => "exact match",
        Grade::SameDimensions => "same dimensions, different file",
        Grade::Rescaled => "different resolution",
        Grade::Mismatch => "doesn't match the original",
    }
}

/// Reads a response body, failing once it exceeds `limit` bytes.
pub(crate) async fn read_capped(mut response: Response, limit: usize) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| {
        trace(format!("  body read failed after {} bytes: {e}", out.len()));
        e.to_string()
    })? {
        out.extend_from_slice(&chunk);
        if out.len() > limit {
            return Err("response too large".into());
        }
    }
    Ok(out)
}

/// Some image hosts reject hotlinks by Referer; presenting the host's own origin is what a
/// visitor to that site would send. (Pixiv's image CDN wants the main site, not its own origin.)
/// This is not a browser User-Agent impersonation.
fn referer_for(url: &Url) -> String {
    match url.host_str() {
        Some(h) if h.ends_with("pximg.net") => "https://www.pixiv.net/".to_string(),
        _ => format!("{}/", url.origin().ascii_serialization()),
    }
}

/// The saved login cookie for `url`, if it's a page on a site the user has signed in to. Only the
/// site's main pages qualify (not its image CDN subdomains, which don't need the session).
///
/// Also Weasyl's age click-through: its "I am at least 18 - View anyway" button only sets
/// `ro=<submission id>` (a 15-minute cookie, `/js/rating-override-*.js`) and reloads, so a
/// submission page is requested with that same cookie (checked live, 2026-11).
fn session_cookie_for(url: &Url) -> Option<String> {
    match url.host_str()? {
        "www.furaffinity.net" | "furaffinity.net" => crate::credentials::source_cookie("furaffinity.net"),
        "www.weasyl.com" | "weasyl.com" => weasyl_submission_id(url).map(|id| format!("ro={id}")),
        _ => None,
    }
}

/// The submission id in a Weasyl URL (`/~user/submissions/<id>/...`, `/submission/<id>`, `/view/<id>`).
fn weasyl_submission_id(url: &Url) -> Option<String> {
    let seg = path_segments(url);
    seg.iter()
        .position(|s| matches!(*s, "submissions" | "submission" | "view"))
        .and_then(|i| seg.get(i + 1))
        .and_then(|s| leading_id(s))
        .map(str::to_string)
}

/// SSRF guard: source URLs are user-edited post data, so they must never reach loopback, LAN,
/// link-local (cloud metadata) or other non-public addresses. Enforced in three places: literal-IP
/// hosts in `get()`, every redirect hop (`redirect_policy`), and every DNS answer (`PublicOnlyResolver`,
/// which also covers redirects and rebinding since reqwest resolves through it per connection).
fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_multicast()
                || o[0] == 0
                || o[0] >= 240
                || (o[0] == 100 && (o[1] & 0xc0) == 64) // 100.64/10 carrier-grade NAT
                || (o[0] == 198 && (o[1] & 0xfe) == 18)) // 198.18/15 benchmarking
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(v4));
            }
            let first = v6.segments()[0];
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (first & 0xfe00) == 0xfc00 // fc00::/7 unique local
                || (first & 0xffc0) == 0xfe80 // fe80::/10 link-local
                || (first & 0xffc0) == 0xfec0) // fec0::/10 site-local (deprecated)
        }
    }
}

/// Rejects URLs that aren't http(s), or whose host is a literal non-public IP or `localhost`.
/// Hostnames are otherwise left to `PublicOnlyResolver`.
fn check_url(url: &Url) -> Result<(), String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err(format!("blocked non-web URL scheme: {}", url.scheme()));
    }
    let host = url.host_str().unwrap_or("");
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    let blocked = match bare.parse::<IpAddr>() {
        Ok(ip) => !is_public_ip(ip),
        Err(_) => {
            let d = host.trim_end_matches('.').to_ascii_lowercase();
            d.is_empty() || d == "localhost" || d.ends_with(".localhost")
        }
    };
    if blocked {
        return Err(format!("blocked non-public address: {}", url.host_str().unwrap_or("")));
    }
    Ok(())
}

fn redirect_policy() -> Policy {
    Policy::custom(|attempt| {
        if attempt.previous().len() >= 10 {
            attempt.error("too many redirects")
        } else if let Err(e) = check_url(attempt.url()) {
            attempt.error(e)
        } else {
            attempt.follow()
        }
    })
}

struct PublicOnlyResolver;

impl Resolve for PublicOnlyResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let host = name.as_str().to_string();
            let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0)).await?.collect();
            let public: Vec<SocketAddr> = addrs.into_iter().filter(|a| is_public_ip(a.ip())).collect();
            if public.is_empty() {
                return Err(format!("{host} resolves only to non-public addresses").into());
            }
            Ok(Box::new(public.into_iter()) as Addrs)
        })
    }
}

/// An HTTP client for third-party hosts with the same SSRF guards source recovery uses (public
/// addresses only, checked per redirect hop and per DNS answer). Also used by the uploader to
/// fetch a direct-URL upload locally for its duplicate checks.
pub(crate) fn public_client(timeout: Duration, purpose: &str) -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(timeout)
        .redirect(redirect_policy())
        .dns_resolver(Arc::new(PublicOnlyResolver))
        .user_agent(format!("MonosodiumDesktop/{} ({purpose})", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}


/// `Retry-After` in seconds (the HTTP-date form is rare here and just gets the default), clamped
/// to 1-5s so one slow host can't stall a whole recovery.
fn retry_after(response: &Response) -> Duration {
    let secs = response
        .headers()
        .get(RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(2);
    Duration::from_secs(secs.clamp(1, 5))
}

/// Sends `req`, retrying once after a rate-limit/overload answer (429/502/503/504) or a timeout.
/// Everything here is a GET, so the retry is always safe.
async fn send_retry(req: RequestBuilder) -> Result<Response, reqwest::Error> {
    let again = req.try_clone();
    let first = req.send().await;
    let wait = match &first {
        Ok(r) if matches!(r.status().as_u16(), 429 | 502 | 503 | 504) => Some(retry_after(r)),
        Err(e) if e.is_timeout() => Some(Duration::from_secs(1)),
        _ => None,
    };
    match (wait, again) {
        (Some(wait), Some(again)) => {
            trace(format!("  transient failure, retrying in {wait:?}"));
            tokio::time::sleep(wait).await;
            again.send().await
        }
        _ => first,
    }
}

/// GET with the client's own timeout (the uploader's pre-fetch uses this).
pub(crate) async fn get(client: &Client, url: &Url) -> Result<Response, String> {
    get_timed(client, url, None, ACCEPT_ANY).await
}

/// For a URL that may be a page or a file.
const ACCEPT_ANY: &str = "image/*,video/*,text/html;q=0.8,*/*;q=0.5";
/// For a URL that should be a file. Tumblr's media CDN answers a request that accepts HTML with
/// an HTML viewer page instead of the image (checked live, 2026-11), so file fetches never ask for it.
const ACCEPT_MEDIA: &str = "image/*,video/*,*/*;q=0.5";

/// Per-host politeness shared by every recovery (a bulk run is many recoveries back to back):
/// about one request a second to any one site (burst 2). The Internet Archive throttles and
/// temporarily blocks busy clients, so all of archive.org shares one slower allowance.
fn host_limiter() -> &'static governor::DefaultKeyedRateLimiter<String> {
    static LIMITER: OnceLock<governor::DefaultKeyedRateLimiter<String>> = OnceLock::new();
    LIMITER.get_or_init(|| {
        governor::RateLimiter::keyed(
            governor::Quota::per_second(std::num::NonZeroU32::new(1).unwrap()).allow_burst(std::num::NonZeroU32::new(2).unwrap()),
        )
    })
}

fn archive_limiter() -> &'static governor::DefaultDirectRateLimiter {
    static LIMITER: OnceLock<governor::DefaultDirectRateLimiter> = OnceLock::new();
    LIMITER.get_or_init(|| {
        let quota = governor::Quota::with_period(Duration::from_millis(1500)).expect("non-zero period");
        governor::RateLimiter::direct(quota.allow_burst(std::num::NonZeroU32::new(2).unwrap()))
    })
}

fn is_archive_host(url: &Url) -> bool {
    url.host_str().is_some_and(|h| h == "archive.org" || h.ends_with(".archive.org"))
}

/// Waits for this host's turn (see `host_limiter`).
async fn throttle(url: &Url) {
    if is_archive_host(url) {
        archive_limiter().until_ready().await;
    } else if let Some(host) = url.host_str() {
        host_limiter().until_key_ready(&host.trim_start_matches("www.").to_string()).await;
    }
}

/// How long the Wayback steps stand down after archive.org answers 429.
const WAYBACK_PAUSE: Duration = Duration::from_secs(300);

fn wayback_pause() -> &'static Mutex<Option<std::time::Instant>> {
    static PAUSE: OnceLock<Mutex<Option<std::time::Instant>>> = OnceLock::new();
    PAUSE.get_or_init(Default::default)
}

/// Notes a 429 from archive.org, so the rest of a bulk run skips the Wayback Machine for a few
/// minutes instead of each post hammering it and failing.
fn note_status(url: &Url, status: reqwest::StatusCode) {
    if status.as_u16() == 429 && is_archive_host(url) {
        *lock(wayback_pause()) = Some(std::time::Instant::now() + WAYBACK_PAUSE);
    }
}

fn wayback_paused() -> bool {
    lock(wayback_pause()).is_some_and(|until| std::time::Instant::now() < until)
}

async fn get_timed(client: &Client, url: &Url, timeout: Option<Duration>, accept: &str) -> Result<Response, String> {
    check_url(url)?;
    throttle(url).await;
    let referer = referer_for(url);
    let started = std::time::Instant::now();
    trace(format!("GET {url}"));
    let mut request = client
        .get(url.clone())
        .header(REFERER, referer)
        .header(ACCEPT, accept);
    if let Some(t) = timeout {
        request = request.timeout(t);
    }
    // A saved site session (Settings > Source logins) goes only to that site's own pages. reqwest
    // drops a manually-set Cookie header on a cross-origin redirect, so it can't follow one away.
    if let Some(cookie) = session_cookie_for(url) {
        request = request.header(COOKIE, cookie);
    }
    let response = send_retry(request).await.map_err(|e| {
        trace(format!("  request failed after {:?}: {e}", started.elapsed()));
        if e.is_timeout() { "timed out".to_string() } else { e.to_string() }
    })?;
    note_status(url, response.status());
    trace(format!(
        "  {} after {:?} ({})",
        response.status(),
        started.elapsed(),
        response.headers().get(CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("no content-type")
    ));
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    Ok(response)
}

fn content_type(response: &Response) -> String {
    response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

/// HTML entity decoding for attribute values: the named entities that show up in URLs plus every
/// numeric form (`&#47;`, `&#x2F;`). `&amp;` is handled in the same pass, so `&amp;lt;` stays `&lt;`.
fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let tail = &rest[pos..];
        let decoded = tail.find(';').filter(|&end| end <= 10).and_then(|end| {
            let entity = &tail[1..end];
            let ch = match entity {
                "amp" => Some('&'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "lt" => Some('<'),
                "gt" => Some('>'),
                _ => {
                    let num = entity.strip_prefix('#')?;
                    let code = match num.strip_prefix(['x', 'X']) {
                        Some(hex) => u32::from_str_radix(hex, 16).ok()?,
                        None => num.parse::<u32>().ok()?,
                    };
                    char::from_u32(code)
                }
            }?;
            Some((ch, end + 1))
        });
        match decoded {
            Some((ch, len)) => {
                out.push(ch);
                rest = &tail[len..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Value of `name="..."` (or single-quoted) inside one tag's text, case-insensitive on the name.
fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(pos) = lower[from..].find(name) {
        let start = from + pos;
        let before_ok = lower[..start].chars().next_back().is_some_and(|c| c.is_whitespace());
        let rest = lower[start + name.len()..].trim_start();
        if before_ok && rest.starts_with('=') {
            let eq = start + name.len() + (lower[start + name.len()..].len() - rest.len()) + 1;
            let value = tag[eq..].trim_start();
            let quote = value.chars().next()?;
            if quote == '"' || quote == '\'' {
                let inner = &value[1..];
                let end = inner.find(quote)?;
                return Some(decode_entities(&inner[..end]));
            }
            let end = value.find(|c: char| c.is_whitespace() || c == '>').unwrap_or(value.len());
            return Some(decode_entities(&value[..end]));
        }
        from = start + name.len();
    }
    None
}

/// Every `<tag ...>` opening tag's text in `html`, in order.
fn tags<'a>(html: &'a str, name: &str) -> Vec<&'a str> {
    let lower = html.to_ascii_lowercase();
    let open = format!("<{name}");
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(pos) = lower[from..].find(&open) {
        let start = from + pos;
        let end = lower[start..].find('>').map_or(lower.len(), |e| start + e);
        out.push(&html[start..end]);
        from = end.max(start + open.len());
    }
    out
}

/// First `og:image` / `twitter:image` URL declared in the page's `<meta>` tags, resolved against
/// the page URL. `og:image` wins over the Twitter-card tag when both exist.
fn find_meta_image(html: &str, base: &Url) -> Option<Url> {
    let mut og = None;
    let mut twitter = None;
    for tag in tags(html, "meta") {
        let key = attr(tag, "property").or_else(|| attr(tag, "name")).map(|k| k.to_ascii_lowercase());
        let Some(content) = attr(tag, "content").filter(|c| !c.trim().is_empty()) else { continue };
        match key.as_deref() {
            Some("og:image") | Some("og:image:url") | Some("og:image:secure_url") if og.is_none() => {
                og = Some(content)
            }
            Some("twitter:image") | Some("twitter:image:src") if twitter.is_none() => {
                twitter = Some(content)
            }
            _ => {}
        }
        if og.is_some() {
            break;
        }
    }
    base.join(og.or(twitter)?.trim()).ok()
}

/// Downloads one file and checks it really is an image/video the viewer can show. Returns the
/// sniffed type with the bytes.
async fn fetch_media(client: &Client, url: &Url) -> Result<Vec<u8>, String> {
    let response = get_timed(client, url, Some(MEDIA_TIMEOUT), ACCEPT_MEDIA).await?;
    let ct = content_type(&response);
    if ct.starts_with("text/") || ct.contains("json") || ct.contains("xml") {
        return Err(format!("not an image ({ct})"));
    }
    let bytes = read_capped(response, MAX_MEDIA_BYTES).await?;
    if sniff_mime(&bytes).is_none() {
        return Err(format!("not a usable image or video ({})", if ct.is_empty() { "unknown type" } else { &ct }));
    }
    Ok(bytes)
}

/// GET for a lookup API (small JSON/XML answer). Errors never include the URL: the query may
/// carry an API key (Settings > Source logins), and these messages reach the UI.
async fn get_lookup(
    client: &Client,
    url: &str,
    query: &[(&str, &str)],
    headers: &[(&str, &str)],
) -> Result<Response, String> {
    let parsed = Url::parse(url).map_err(|e| e.to_string())?;
    check_url(&parsed)?;
    throttle(&parsed).await;
    let mut req = client.get(url).query(query).timeout(PAGE_TIMEOUT);
    for (name, value) in headers {
        req = req.header(*name, *value);
    }
    let response = send_retry(req)
        .await
        .map_err(|e| if e.is_timeout() { "timed out".to_string() } else { e.without_url().to_string() })?;
    note_status(&parsed, response.status());
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    Ok(response)
}

async fn get_json(
    client: &Client,
    url: &str,
    query: &[(&str, &str)],
    referer: Option<&str>,
) -> Result<serde_json::Value, String> {
    let headers: Vec<(&str, &str)> = referer.map(|r| ("referer", r)).into_iter().collect();
    get_json_with(client, url, query, &headers).await
}

async fn get_json_with(
    client: &Client,
    url: &str,
    query: &[(&str, &str)],
    headers: &[(&str, &str)],
) -> Result<serde_json::Value, String> {
    let response = get_lookup(client, url, query, headers).await?;
    response.json().await.map_err(|e| e.without_url().to_string())
}

/// A lookup's raw body (XML, or JSON that may legitimately be empty).
async fn get_text(client: &Client, url: &str, query: &[(&str, &str)]) -> Result<String, String> {
    let response = get_lookup(client, url, query, &[]).await?;
    Ok(String::from_utf8_lossy(&read_capped(response, MAX_HTML_BYTES).await?).into_owned())
}


fn twitter_token(id: &str) -> String {
    // Mirrors the web embed's token: (id / 1e15 * pi) in base 36, zeros and the point removed.
    // The endpoint doesn't appear to validate it strictly, but sending a plausible one is cheap.
    let n = id.parse::<f64>().unwrap_or(0.0) / 1e15 * std::f64::consts::PI;
    let digit = |d: u32| char::from_digit(d, 36).unwrap_or('0');
    let mut int = n.trunc() as u64;
    let mut out = String::new();
    if int == 0 {
        out.push('0');
    }
    while int > 0 {
        out.insert(0, digit((int % 36) as u32));
        int /= 36;
    }
    let mut frac = n.fract();
    for _ in 0..11 {
        frac *= 36.0;
        out.push(digit(frac.trunc() as u32));
        frac = frac.fract();
    }
    out.retain(|c| c != '0');
    out
}

fn path_segments(url: &Url) -> Vec<&str> {
    url.path_segments().map(|s| s.filter(|p| !p.is_empty()).collect()).unwrap_or_default()
}

fn dedupe_urls(urls: Vec<Url>) -> Vec<Url> {
    let mut seen = HashSet::new();
    urls.into_iter().filter(|u| seen.insert(u.as_str().to_string())).collect()
}

/// One media item of a tweet: a photo's `pbs.twimg.com/media/<id>.<ext>` (no query), or a video's
/// best mp4 (X re-encodes uploads, so a video is never byte-exact, but it's the same footage).
#[derive(Debug, PartialEq)]
enum TweetMedia {
    Photo(String),
    Video(Url),
}

fn tweet_photo(url: &str) -> TweetMedia {
    TweetMedia::Photo(url.split('?').next().unwrap_or(url).to_string())
}

/// X's own embed ("syndication") answer.
fn syndication_media(json: &serde_json::Value) -> Vec<TweetMedia> {
    let mut items = Vec::new();
    for m in json.get("mediaDetails").and_then(|m| m.as_array()).into_iter().flatten() {
        let kind = m.get("type").and_then(|t| t.as_str()).unwrap_or("photo");
        if kind == "video" || kind == "animated_gif" {
            let best = m
                .pointer("/video_info/variants")
                .and_then(|v| v.as_array())
                .into_iter()
                .flatten()
                .filter(|v| v.get("content_type").and_then(|c| c.as_str()) == Some("video/mp4"))
                .max_by_key(|v| v.get("bitrate").and_then(|b| b.as_i64()).unwrap_or(0))
                .and_then(|v| Url::parse(v.get("url")?.as_str()?).ok());
            items.extend(best.map(TweetMedia::Video));
        } else if let Some(media) = m.get("media_url_https").and_then(|u| u.as_str()) {
            items.push(tweet_photo(media));
        }
    }
    if items.is_empty() {
        let photos = json.get("photos").and_then(|p| p.as_array()).into_iter().flatten();
        items.extend(photos.filter_map(|p| p.get("url")?.as_str()).map(tweet_photo));
    }
    items
}

/// FxTwitter (`api.fxtwitter.com`, `{tweet: {media: {all: [{type, url}]}}}`) or vxTwitter
/// (`api.vxtwitter.com`, `{media_extended: [{type, url}]}`).
fn mirror_media(json: &serde_json::Value) -> Vec<TweetMedia> {
    let list = json
        .pointer("/tweet/media/all")
        .or_else(|| json.get("media_extended"))
        .and_then(|m| m.as_array())
        .into_iter()
        .flatten();
    list.filter_map(|m| {
        let url = m.get("url")?.as_str()?;
        match m.get("type").and_then(|t| t.as_str()).unwrap_or("photo") {
            "video" | "gif" | "animated_gif" => Url::parse(url).ok().map(TweetMedia::Video),
            _ => Some(tweet_photo(url)),
        }
    })
    .collect()
}

/// X/Twitter. First X's own public embed endpoint; it answers an age-restricted ("sensitive")
/// tweet with a `TweetTombstone` to anyone logged out (checked live, 2026-11), so then the
/// FxTwitter and vxTwitter embed-fixer APIs, which do return its media. All three only ever hand
/// back `pbs.twimg.com`/`video.twimg.com` URLs; the files are fetched from X's CDN as usual.
async fn resolve_twitter(client: &Client, url: &Url, expected: &Expected) -> Result<Vec<Url>, String> {
    let seg = path_segments(url);
    let at = seg.iter().position(|p| *p == "status").ok_or("not a tweet URL")?;
    let id = seg.get(at + 1).filter(|i| i.chars().all(|c| c.is_ascii_digit())).ok_or("no tweet id")?;
    let user = at.checked_sub(1).and_then(|i| seg.get(i)).filter(|u| !u.is_empty() && **u != "i").copied().unwrap_or("i");
    let photo_index = match (seg.get(at + 2), seg.get(at + 3)) {
        (Some(&"photo"), Some(n)) => n.parse::<usize>().unwrap_or(1).saturating_sub(1),
        _ => 0,
    };

    let mut problems = Vec::new();
    let mut media = Vec::new();
    match get_json(client, "https://cdn.syndication.twimg.com/tweet-result", &[("id", id), ("token", &twitter_token(id))], None).await {
        Ok(json) if json.get("__typename").and_then(|t| t.as_str()) == Some("TweetTombstone") => {
            problems.push("X hides this tweet from logged-out viewers (age-restricted, or removed)".to_string())
        }
        Ok(json) => {
            media = syndication_media(&json);
            if media.is_empty() {
                problems.push("X's embed shows no media".to_string());
            }
        }
        Err(e) => problems.push(format!("X embed lookup failed ({e})")),
    }
    for (name, api) in [("FxTwitter", "https://api.fxtwitter.com"), ("vxTwitter", "https://api.vxtwitter.com")] {
        if !media.is_empty() {
            break;
        }
        match get_json(client, &format!("{api}/{user}/status/{id}"), &[], None).await {
            Ok(json) => {
                media = mirror_media(&json);
                if media.is_empty() {
                    problems.push(format!("{name}: no media"));
                }
            }
            Err(e) => problems.push(format!("{name}: {e}")),
        }
    }
    if media.is_empty() {
        return Err(format!("tweet media not found ({})", problems.join("; ")));
    }

    // Each item becomes its list of URLs to try. `name=orig` asks pbs.twimg.com for the
    // original-resolution file; when the original's format differs from the post's, also ask for
    // that format explicitly (the embed often reports `.png` for what was uploaded as a jpg).
    let want = normalize_ext(&expected.ext);
    let mut items: Vec<Vec<Url>> = media
        .into_iter()
        .map(|m| match m {
            TweetMedia::Video(u) => vec![u],
            TweetMedia::Photo(photo) => {
                let mut out: Vec<Url> = Url::parse(&format!("{photo}?name=orig")).into_iter().collect();
                let (stem, ext) = photo.rsplit_once('.').unwrap_or((&photo, ""));
                if !want.is_empty() && !expected.is_video() && normalize_ext(ext) != want {
                    out.extend(Url::parse(&format!("{stem}?format={want}&name=orig")));
                }
                out
            }
        })
        .filter(|i| !i.is_empty())
        .collect();
    if items.is_empty() {
        return Err("tweet media not found".into());
    }
    // The item the URL points at goes first, then the tweet's others (the deleted post may be any
    // of them; grading picks the one that matches).
    let first = photo_index.min(items.len() - 1);
    let first_item = items.remove(first);
    Ok(first_item.into_iter().chain(items.into_iter().flatten()).collect())
}

fn collect_fullsize<'a>(v: &'a serde_json::Value, out: &mut Vec<&'a str>) {
    match v {
        serde_json::Value::Object(map) => {
            for (k, child) in map {
                match (k.as_str(), child.as_str()) {
                    ("fullsize", Some(u)) => out.push(u),
                    _ => collect_fullsize(child, out),
                }
            }
        }
        serde_json::Value::Array(a) => a.iter().for_each(|c| collect_fullsize(c, out)),
        _ => {}
    }
}

/// `cdn.bsky.app/img/<preset>/plain/<did>/<cid>@<fmt>` -> (did, cid).
fn parse_bsky_cdn(url: &Url) -> Option<(String, String)> {
    if url.host_str()? != "cdn.bsky.app" {
        return None;
    }
    match path_segments(url).as_slice() {
        ["img", _, "plain", did, cid, ..] if did.starts_with("did:") => {
            let cid = cid.split('@').next()?;
            (!cid.is_empty()).then(|| (did.to_string(), cid.to_string()))
        }
        _ => None,
    }
}

/// The PDS (the author's own data server) a Bluesky DID lives on, from its DID document.
async fn bsky_pds(client: &Client, did: &str) -> Option<String> {
    let doc_url = if did.starts_with("did:plc:") {
        format!("https://plc.directory/{did}")
    } else if let Some(host) = did.strip_prefix("did:web:") {
        format!("https://{host}/.well-known/did.json")
    } else {
        return None;
    };
    let json = get_json(client, &doc_url, &[], None).await.ok()?;
    json.get("service")?
        .as_array()?
        .iter()
        .find(|s| s.get("id").and_then(|v| v.as_str()).is_some_and(|id| id.ends_with("#atproto_pds")))?
        .get("serviceEndpoint")?
        .as_str()
        .map(|s| s.trim_end_matches('/').to_string())
}

/// For each Bluesky CDN image URL: the original upload straight from the author's PDS
/// (`com.atproto.sync.getBlob` - the CDN's `feed_fullsize` is always a re-encoded JPEG, so only
/// the blob can be byte-exact), then the CDN full-size copy as a fallback. Other URLs pass through.
async fn bsky_originals(client: &Client, urls: Vec<Url>) -> Vec<Url> {
    let mut pds_for: HashMap<String, Option<String>> = HashMap::new();
    let mut out = Vec::new();
    for u in urls {
        let Some((did, cid)) = parse_bsky_cdn(&u) else {
            out.push(u);
            continue;
        };
        if !pds_for.contains_key(&did) {
            let pds = bsky_pds(client, &did).await;
            pds_for.insert(did.clone(), pds);
        }
        if let Some(Some(pds)) = pds_for.get(&did) {
            if let Ok(blob) =
                Url::parse_with_params(&format!("{pds}/xrpc/com.atproto.sync.getBlob"), &[("did", &did), ("cid", &cid)])
            {
                out.push(blob);
            }
        }
        if let Ok(full) = Url::parse(&format!("https://cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@jpeg")) {
            out.push(full);
        }
    }
    dedupe_urls(out)
}

/// Bluesky via the public AppView API (`bsky.app/profile/<actor>/post/<rkey>`).
async fn resolve_bluesky(client: &Client, url: &Url) -> Result<Vec<Url>, String> {
    let seg = path_segments(url);
    let (actor, rkey) = match seg.as_slice() {
        ["profile", actor, "post", rkey, ..] => (*actor, *rkey),
        _ => return Err("not a Bluesky post URL".into()),
    };
    let uri = format!("at://{actor}/app.bsky.feed.post/{rkey}");
    let json = get_json(
        client,
        "https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread",
        &[("uri", &uri), ("depth", "0")],
        None,
    )
    .await
    .map_err(|e| format!("post lookup failed ({e})"))?;
    let mut found = Vec::new();
    if let Some(embed) = json.pointer("/thread/post/embed") {
        collect_fullsize(embed, &mut found);
    }
    if found.is_empty() {
        return Err("post has no images".into());
    }
    let urls = found.iter().filter_map(|u| Url::parse(u).ok()).collect();
    Ok(bsky_originals(client, urls).await)
}

/// Pixiv: the public per-illustration pages endpoint (works for non-R18 works without a login).
async fn resolve_pixiv(client: &Client, url: &Url) -> Result<Vec<Url>, String> {
    let seg = path_segments(url);
    let at = seg.iter().position(|p| *p == "artworks").ok_or("not a Pixiv artwork URL")?;
    let id = seg.get(at + 1).filter(|i| i.chars().all(|c| c.is_ascii_digit())).ok_or("no artwork id")?;
    let json = get_json(
        client,
        &format!("https://www.pixiv.net/ajax/illust/{id}/pages"),
        &[],
        Some("https://www.pixiv.net/"),
    )
    .await
    .map_err(|e| format!("artwork lookup failed ({e}; R18 works need a login)"))?;
    // Every page of the work: a multi-page work's deleted post may be any of them.
    let pages: Vec<Url> = json
        .get("body")
        .and_then(|b| b.as_array())
        .map(|a| a.iter().filter_map(|p| Url::parse(p.pointer("/urls/original")?.as_str()?).ok()).collect())
        .unwrap_or_default();
    if pages.is_empty() {
        return Err("artwork has no pages".into());
    }
    Ok(pages)
}

/// DeviantArt via its oEmbed endpoint.
async fn resolve_deviantart(client: &Client, url: &Url) -> Result<Vec<Url>, String> {
    let json = get_json(client, "https://backend.deviantart.com/oembed", &[("url", url.as_str())], None)
        .await
        .map_err(|e| format!("oEmbed lookup failed ({e})"))?;
    let photo = (json.get("type").and_then(|t| t.as_str()) == Some("photo"))
        .then(|| json.get("url").and_then(|u| u.as_str()))
        .flatten();
    let chosen = photo
        .or_else(|| json.get("thumbnail_url").and_then(|u| u.as_str()))
        .ok_or("oEmbed returned no image")?;
    Url::parse(chosen).map(|u| vec![u]).map_err(|e| e.to_string())
}

/// Marks a resolver failure that is final: the page is login-gated, so scraping it generically
/// would only turn up the site's own logo/placeholder. `find_images` stops at these.
const LOGIN_REQUIRED: &str = "login required";

/// HentaiVox reader pages (`/view/<gallery>/<page>`) declare no meta image at all; the page image
/// is the one `<img class="js-main-img">`.
fn parse_hentaivox(html: &str, base: &Url) -> Result<Vec<Url>, String> {
    let main = tags(html, "img")
        .into_iter()
        .find(|t| attr(t, "class").is_some_and(|c| c.split_whitespace().any(|c| c == "js-main-img")))
        .ok_or("no reader image on the page")?;
    let src = attr(main, "src").ok_or("main image has no src")?;
    base.join(src.trim()).map(|u| vec![u]).map_err(|e| e.to_string())
}

/// Fur Affinity submission pages (`/view/<id>`). Logged-out visitors get a "System Message" page
/// for Mature/Adult work - whose `og:image` is just the FA logo - so that case is reported rather
/// than scraped. On a public submission the full-size file is the `submissionImg`'s
/// `data-fullview-src` (the `og:image` is only a 600px thumbnail).
fn parse_furaffinity(html: &str, base: &Url) -> Result<Vec<Url>, String> {
    if let Some(img) = tags(html, "img").into_iter().find(|t| attr(t, "id").as_deref() == Some("submissionImg")) {
        let src = attr(img, "data-fullview-src")
            .or_else(|| attr(img, "src"))
            .ok_or("submission image has no src")?;
        return base.join(src.trim()).map(|u| vec![u]).map_err(|e| e.to_string());
    }
    if html.to_ascii_lowercase().contains("not in our database") {
        return Err("deleted from Fur Affinity (\"not in our database\")".into());
    }
    if html.to_ascii_lowercase().contains("you must log in") {
        if session_cookie_for(base).is_some() {
            return Err(format!(
                "{LOGIN_REQUIRED}: your saved Fur Affinity sign-in has expired (FA answered as logged out) - sign in again under Settings > Source logins"
            ));
        }
        Err(format!(
            "{LOGIN_REQUIRED}: Fur Affinity only shows this Mature/Adult submission to signed-in users - sign in under Settings > Source logins, with Mature/Adult content enabled on your FA account"
        ))
    } else {
        Err("no submission image on the page (removed or disabled?)".into())
    }
}

/// The largest index <= `i` that's a char boundary of `s` (so a byte window never splits a char).
fn floor_boundary(s: &str, mut i: usize) -> usize {
    i = i.min(s.len());
    while !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

/// SoFurry submission pages (`sofurry.com/s/<id>`, the 2025 site) have no `og:image`; the file
/// is in the page's embedded route data as `"displayUrl","https://cdn.sofurryfiles.com/..."`
/// (JSON-escaped). That's a full-resolution WebP, not the uploaded file - so it can reach
/// "same dimensions", never "exact". The page is served to us in full without the site's 18+
/// click-through (that's client-side). Checked live, 2026-11.
fn parse_sofurry(html: &str) -> Result<Vec<Url>, String> {
    const KEY: &str = "displayUrl";
    const CDN: &str = "https://cdn.sofurryfiles.com/";
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(pos) = html[from..].find(KEY) {
        let start = from + pos + KEY.len();
        from = start;
        let window = &html[start..floor_boundary(html, start + 200)];
        let Some(at) = window.find(CDN) else { continue };
        let rest = &window[at..];
        let end = rest.find(|c: char| c == '\\' || c == '"' || c == '\'' || c.is_whitespace()).unwrap_or(rest.len());
        if let Ok(url) = Url::parse(&rest[..end]) {
            out.push(url);
        }
    }
    let out = dedupe_urls(out);
    if out.is_empty() {
        Err("no submission file on the page (removed, or a writing/audio submission?)".into())
    } else {
        Ok(out)
    }
}

/// Weasyl submission pages: the full original is the `#detail-art` "Download" link
/// (`cdn.weasyl.com/~user/submissions/<id>/<hash>/<file>`); `og:image` is only a preview (often a
/// WebP). An adult page fetched without the `ro` cookie (see `session_cookie_for`) - or an
/// archived copy of one - has neither link nor art, just the age prompt.
fn parse_weasyl(html: &str, page: &Url) -> Result<Vec<Url>, String> {
    let mut out: Vec<Url> = tags(html, "a")
        .into_iter()
        .filter_map(|t| attr(t, "href"))
        .filter(|h| h.starts_with("https://cdn.weasyl.com/~") && h.contains("/submissions/"))
        .filter_map(|h| Url::parse(&h).ok())
        .collect();
    out.extend(find_meta_image(html, page));
    let out = dedupe_urls(out);
    if !out.is_empty() {
        Ok(out)
    } else if html.contains("rating-override") {
        Err("Weasyl kept this submission behind its 18+ prompt".into())
    } else {
        Err("no submission file on the page (removed?)".into())
    }
}

fn is_weasyl(url: &Url) -> bool {
    matches!(url.host_str(), Some("www.weasyl.com" | "weasyl.com"))
}

fn is_sofurry(url: &Url) -> bool {
    matches!(url.host_str(), Some("sofurry.com" | "www.sofurry.com"))
}

fn is_furaffinity(url: &Url) -> bool {
    matches!(url.host_str(), Some("www.furaffinity.net" | "furaffinity.net"))
}

fn is_hentaivox(url: &Url) -> bool {
    matches!(url.host_str(), Some("hentaivox.com" | "www.hentaivox.com"))
}

/// The image(s) an HTML page shows: the site's own markup where we know it (FA, HentaiVox),
/// else its `og:image`. `page` is the page's real URL (for an archived copy, the original one).
fn scrape_page(html: &str, page: &Url) -> Result<Vec<Url>, String> {
    if is_furaffinity(page) {
        parse_furaffinity(html, page)
    } else if is_hentaivox(page) {
        parse_hentaivox(html, page)
    } else if is_sofurry(page) {
        parse_sofurry(html)
    } else if is_weasyl(page) {
        parse_weasyl(html, page)
    } else {
        find_meta_image(html, page).map(|u| vec![u]).ok_or_else(|| "no og:image on the page".into())
    }
}

async fn fetch_page(client: &Client, url: &Url) -> Result<String, String> {
    let response = get_timed(client, url, Some(PAGE_TIMEOUT), ACCEPT_ANY).await?;
    Ok(String::from_utf8_lossy(&read_capped(response, MAX_HTML_BYTES).await?).into_owned())
}

/// The id at the start of a path segment like `3978541` or `3978541-p2-some-title`.
fn leading_id(seg: &str) -> Option<&str> {
    let end = seg.find(|c: char| !c.is_ascii_digit()).unwrap_or(seg.len());
    (end > 0).then(|| &seg[..end])
}

fn inkbunny_sid_cache() -> &'static Mutex<Option<String>> {
    static SID: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    SID.get_or_init(Default::default)
}

/// A guest session on Inkbunny's API, with every rating switched on via the API's own
/// `api_userrating.php` (a fresh guest session only sees General work, and deleted e621 posts are
/// mostly not). Cached for the app's lifetime; `fresh` forces a new one.
async fn inkbunny_sid(client: &Client, fresh: bool) -> Result<String, String> {
    if !fresh {
        if let Some(sid) = lock(inkbunny_sid_cache()).clone() {
            return Ok(sid);
        }
    }
    let login = get_json(client, "https://inkbunny.net/api_login.php", &[("username", "guest")], None).await?;
    let sid = login.get("sid").and_then(|s| s.as_str()).ok_or("guest login refused")?.to_string();
    let _ = get_json(
        client,
        "https://inkbunny.net/api_userrating.php",
        &[("sid", &sid), ("tag[2]", "yes"), ("tag[3]", "yes"), ("tag[4]", "yes"), ("tag[5]", "yes")],
        None,
    )
    .await;
    *lock(inkbunny_sid_cache()) = Some(sid.clone());
    Ok(sid)
}

/// Inkbunny (`/s/<id>`, `/submissionview.php?id=<id>`) via its API, which reports every file's md5
/// - so the file matching the deleted post goes first and is usually the only download needed.
/// Checked live, 2026-11.
async fn resolve_inkbunny(client: &Client, url: &Url, expected: &Expected) -> Result<Vec<Url>, String> {
    let seg = path_segments(url);
    let id = match seg.as_slice() {
        ["s", rest, ..] => leading_id(rest).map(str::to_string),
        _ => url.query_pairs().find(|(k, _)| k == "id").and_then(|(_, v)| leading_id(&v).map(str::to_string)),
    }
    .ok_or("not an Inkbunny submission URL")?;
    let mut json = serde_json::Value::Null;
    for fresh in [false, true] {
        let sid = inkbunny_sid(client, fresh).await?;
        json = get_json(client, "https://inkbunny.net/api_submissions.php", &[("sid", &sid), ("submission_ids", &id)], None).await?;
        // An expired session answers with an error code instead of results.
        if json.get("error_code").is_none() {
            break;
        }
    }
    if let Some(msg) = json.get("error_message").and_then(|m| m.as_str()) {
        return Err(format!("Inkbunny API: {msg}"));
    }
    let files = json.pointer("/submissions/0/files").and_then(|f| f.as_array()).ok_or("submission not found (removed?)")?;
    let want = expected.md5.as_deref().unwrap_or("").trim().to_ascii_lowercase();
    let mut matching = Vec::new();
    let mut rest = Vec::new();
    for f in files {
        let Some(u) = f.get("file_url_full").and_then(|u| u.as_str()).and_then(|u| Url::parse(u).ok()) else { continue };
        let md5 = f.get("full_file_md5").and_then(|m| m.as_str()).unwrap_or("");
        if !want.is_empty() && md5.eq_ignore_ascii_case(&want) {
            matching.push(u)
        } else {
            rest.push(u)
        }
    }
    matching.extend(rest);
    if matching.is_empty() { Err("submission has no files".into()) } else { Ok(matching) }
}

/// Itaku (`itaku.ee/images/<id>`) via its public API: `image` is the original upload, `image_xl`
/// a resize kept as a fallback. Checked live, 2026-11.
async fn resolve_itaku(client: &Client, url: &Url) -> Result<Vec<Url>, String> {
    let id = match path_segments(url).as_slice() {
        ["images", id, ..] => leading_id(id).map(str::to_string),
        _ => None,
    }
    .ok_or("not an Itaku image URL")?;
    let json = get_json(client, &format!("https://itaku.ee/api/galleries/images/{id}/"), &[], None).await?;
    let out: Vec<Url> = ["image", "image_xl"].iter().filter_map(|k| Url::parse(json.get(*k)?.as_str()?).ok()).collect();
    if out.is_empty() { Err("image not found (removed?)".into()) } else { Ok(out) }
}

/// Weasyl submissions: with a saved API key, its API (keyless API clients get a block page,
/// checked 2026-11); otherwise - or if the API fails - the submission page itself, fetched with
/// the 18+ click-through cookie and read by `parse_weasyl`.
async fn resolve_weasyl(client: &Client, url: &Url) -> Option<Result<Vec<Url>, String>> {
    let id = weasyl_submission_id(url)?;
    let mut api_error = None;
    if let Some(key) = crate::credentials::source_key("weasyl") {
        let api = async {
            let json = get_json_with(
                client,
                &format!("https://www.weasyl.com/api/submissions/{id}/view"),
                &[],
                &[("X-Weasyl-API-Key", key.api_key.as_str())],
            )
            .await?;
            let out: Vec<Url> = json
                .pointer("/media/submission")
                .and_then(|m| m.as_array())
                .into_iter()
                .flatten()
                .filter_map(|m| Url::parse(m.get("url")?.as_str()?).ok())
                .collect();
            if out.is_empty() { Err("submission has no file".to_string()) } else { Ok(out) }
        }
        .await;
        match api {
            Ok(out) => return Some(Ok(out)),
            Err(e) => api_error = Some(format!("Weasyl API: {e}")),
        }
    }
    let page = match fetch_page(client, url).await {
        Ok(html) => parse_weasyl(&html, url),
        Err(e) => Err(e),
    };
    Some(page.map_err(|e| match api_error {
        Some(api) => format!("{api}; page: {e}"),
        None => e,
    }))
}

/// A copy of the post found by md5 on another booru: its post page (shown as the "source") and file.
struct MirrorHit {
    page: String,
    file: Url,
}

/// Posts from a booru answer that really carry `md5` (the field name differs per site), mapped to
/// their page (`page_for(id)`) and file URL.
fn booru_hits(posts: &[serde_json::Value], md5: &str, md5_field: &str, page_for: impl Fn(&str) -> String) -> Vec<MirrorHit> {
    posts
        .iter()
        .filter_map(|p| {
            let reported = p.get(md5_field).and_then(|m| m.as_str()).unwrap_or(md5);
            if !reported.eq_ignore_ascii_case(md5) {
                return None;
            }
            let id = match p.get("id")? {
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::String(s) => s.clone(),
                _ => return None,
            };
            Some(MirrorHit { page: page_for(&id), file: Url::parse(p.get("file_url")?.as_str()?).ok()? })
        })
        .collect()
}

/// rule34.paheal's Danbooru-compatible XML (`<post id='..' md5='..' file_url='..'>`). A miss is
/// `<posts count='1'>` with no `<post>` in it (checked live), so only real `<post>` elements count.
fn paheal_hits(xml: &str, md5: &str) -> Vec<MirrorHit> {
    tags(xml, "post ")
        .into_iter()
        .filter_map(|t| {
            if !attr(t, "md5")?.eq_ignore_ascii_case(md5) {
                return None;
            }
            let id = attr(t, "id")?;
            Some(MirrorHit { page: format!("https://rule34.paheal.net/post/view/{id}"), file: Url::parse(&attr(t, "file_url")?).ok()? })
        })
        .collect()
}

/// Boorus that can be searched by md5 - a hit there is byte-identical to the deleted post by
/// definition. Gelbooru and Rule34.xxx refuse anonymous API use, so they're only asked when the
/// user saved a key for them (Settings > Source logins).
#[derive(Clone, Copy, Debug)]
enum Mirror {
    Danbooru,
    Paheal,
    Gelbooru,
    Rule34,
}

impl Mirror {
    fn name(self) -> &'static str {
        match self {
            Mirror::Danbooru => "Danbooru",
            Mirror::Paheal => "rule34.paheal",
            Mirror::Gelbooru => "Gelbooru",
            Mirror::Rule34 => "Rule34.xxx",
        }
    }

    fn available() -> Vec<Mirror> {
        let mut out = vec![Mirror::Danbooru, Mirror::Paheal];
        if crate::credentials::source_key("gelbooru").is_some() {
            out.push(Mirror::Gelbooru);
        }
        if crate::credentials::source_key("rule34").is_some() {
            out.push(Mirror::Rule34);
        }
        out
    }

    async fn lookup(self, client: &Client, md5: &str) -> Result<Vec<MirrorHit>, String> {
        let tag = format!("md5:{md5}");
        match self {
            Mirror::Danbooru => {
                let json = get_json(client, "https://danbooru.donmai.us/posts.json", &[("tags", &tag), ("limit", "5")], None).await?;
                Ok(booru_hits(json.as_array().map_or(&[][..], |a| a), md5, "md5", |id| format!("https://danbooru.donmai.us/posts/{id}")))
            }
            Mirror::Paheal => {
                let xml = get_text(client, "https://rule34.paheal.net/api/danbooru/find_posts", &[("md5", md5)]).await?;
                Ok(paheal_hits(&xml, md5))
            }
            Mirror::Gelbooru | Mirror::Rule34 => {
                let site = if matches!(self, Mirror::Gelbooru) { "gelbooru" } else { "rule34" };
                let key = crate::credentials::source_key(site).ok_or("no API key saved")?;
                let (api, page, md5_field) = match self {
                    Mirror::Gelbooru => ("https://gelbooru.com/index.php", "https://gelbooru.com/index.php?page=post&s=view&id=", "md5"),
                    _ => ("https://api.rule34.xxx/index.php", "https://rule34.xxx/index.php?page=post&s=view&id=", "hash"),
                };
                let body = get_text(
                    client,
                    api,
                    &[
                        ("page", "dapi"),
                        ("s", "post"),
                        ("q", "index"),
                        ("json", "1"),
                        ("tags", &tag),
                        ("user_id", &key.user_id),
                        ("api_key", &key.api_key),
                    ],
                )
                .await?;
                parse_dapi(&body, md5, md5_field, page)
            }
        }
    }
}

/// A Gelbooru-style `dapi` JSON answer: Gelbooru wraps posts as `{"post": [...]}`, Rule34.xxx
/// returns the bare array and an empty body for a miss; a refused key comes back as a JSON string.
fn parse_dapi(body: &str, md5: &str, md5_field: &str, page: &str) -> Result<Vec<MirrorHit>, String> {
    if body.trim().is_empty() {
        return Ok(Vec::new());
    }
    let json: serde_json::Value = serde_json::from_str(body).map_err(|_| "unexpected answer".to_string())?;
    if let Some(msg) = json.as_str() {
        return Err(format!("{msg} - check the key under Settings > Source logins"));
    }
    let posts = json.get("post").unwrap_or(&json).as_array().map_or(&[][..], |a| a);
    Ok(booru_hits(posts, md5, md5_field, |id| format!("{page}{id}")))
}

/// Whether a saved source API key works, for Settings. `state`: "valid", "rejected" (the site
/// refused it), "unverified" (couldn't reach the site / unexpected answer), "missing".
#[derive(serde::Serialize)]
pub struct KeyCheck {
    pub state: &'static str,
    pub message: Option<String>,
}

fn key_check(state: &'static str, message: impl Into<String>) -> KeyCheck {
    KeyCheck { state, message: Some(message.into()) }
}

/// Tries a saved key with one cheap request. How each site refuses a bad key (checked live,
/// 2026-11): Gelbooru HTTP 401; Rule34.xxx HTTP 200 with a JSON string ("Missing authentication...");
/// Weasyl's `/api/whoami` HTTP 401.
#[tauri::command]
pub async fn check_source_key(site: String) -> Result<KeyCheck, String> {
    let Some(key) = crate::credentials::source_key(&site) else {
        return Ok(KeyCheck { state: "missing", message: None });
    };
    let client = recovery_client()?;
    let result = match site.as_str() {
        "weasyl" => get_json_with(&client, "https://www.weasyl.com/api/whoami", &[], &[("X-Weasyl-API-Key", key.api_key.as_str())]).await,
        "gelbooru" | "rule34" => {
            let api = if site == "gelbooru" { "https://gelbooru.com/index.php" } else { "https://api.rule34.xxx/index.php" };
            let query = [
                ("page", "dapi"),
                ("s", "post"),
                ("q", "index"),
                ("json", "1"),
                ("limit", "1"),
                ("user_id", key.user_id.as_str()),
                ("api_key", key.api_key.as_str()),
            ];
            get_text(&client, api, &query).await.and_then(|body| {
                if body.trim().is_empty() {
                    Ok(serde_json::Value::Array(Vec::new()))
                } else {
                    serde_json::from_str(&body).map_err(|_| "unexpected answer".to_string())
                }
            })
        }
        other => return Err(format!("unknown site: {other}")),
    };
    Ok(match result {
        Err(e) if e.starts_with("HTTP 401") || e.starts_with("HTTP 403") => key_check("rejected", "The site refused this key"),
        Err(e) => key_check("unverified", e),
        Ok(serde_json::Value::String(msg)) => key_check("rejected", msg),
        Ok(json) if site == "weasyl" => match json.get("login").and_then(|l| l.as_str()) {
            Some(login) => key_check("valid", format!("Signed in as {login}")),
            None => key_check("unverified", "unexpected answer"),
        },
        Ok(json) if json.is_array() || json.is_object() => KeyCheck { state: "valid", message: None },
        Ok(_) => key_check("unverified", "unexpected answer"),
    })
}

/// Hosts whose pages don't carry usable `og:image` tags (or need a login/JS) but that expose a
/// public lookup. `None` means "no special handling - use the generic path".
async fn resolve_site_image(client: &Client, url: &Url, expected: &Expected) -> Option<Result<Vec<Url>, String>> {
    let host = url.host_str()?.to_ascii_lowercase();
    match host.trim_start_matches("www.").trim_start_matches("mobile.") {
        "twitter.com" | "x.com" | "fxtwitter.com" | "vxtwitter.com" | "fixupx.com" => {
            Some(resolve_twitter(client, url, expected).await)
        }
        "bsky.app" => Some(resolve_bluesky(client, url).await),
        "pixiv.net" => Some(resolve_pixiv(client, url).await),
        "deviantart.com" | "fav.me" => Some(resolve_deviantart(client, url).await),
        "hentaivox.com" => Some(match fetch_page(client, url).await {
            Ok(html) => parse_hentaivox(&html, url),
            Err(e) => Err(e),
        }),
        "furaffinity.net" => Some(match fetch_page(client, url).await {
            Ok(html) => parse_furaffinity(&html, url),
            Err(e) => Err(e),
        }),
        "inkbunny.net" => Some(resolve_inkbunny(client, url, expected).await),
        "itaku.ee" => Some(resolve_itaku(client, url).await),
        "weasyl.com" => resolve_weasyl(client, url).await,
        "sofurry.com" => Some(match fetch_page(client, url).await {
            Ok(html) => parse_sofurry(&html),
            Err(e) => Err(e),
        }),
        _ => None,
    }
}

/// What a source URL should become before it's fetched: sources are often a CDN thumbnail or a
/// downsized copy whose original is one URL tweak away.
#[derive(Debug, PartialEq)]
enum Upgrade {
    /// Fetch the submission page instead (FA thumbnail -> its `/view/<id>/` page).
    Page(Url),
    /// Direct media: try these, best first; the source URL itself is always last.
    Media(Vec<Url>),
    /// A Bluesky CDN image - expanded by `bsky_originals` (needs a network lookup).
    Bluesky(Url),
}

/// Is this path segment a Tumblr size preset like `s640x960`?
fn is_tumblr_size(seg: &str) -> bool {
    seg.strip_prefix('s').and_then(|r| r.split_once('x')).is_some_and(|(w, h)| {
        !w.is_empty() && !h.is_empty() && w.bytes().all(|b| b.is_ascii_digit()) && h.bytes().all(|b| b.is_ascii_digit())
    })
}

fn upgrade_source(url: &Url, expected: &Expected) -> Option<Upgrade> {
    let host = url.host_str()?.to_ascii_lowercase();
    let want = normalize_ext(&expected.ext);
    let seg = path_segments(url);
    let finish = |mut list: Vec<Url>| {
        list.push(url.clone());
        Some(Upgrade::Media(dedupe_urls(list)))
    };

    if host == "d.facdn.net" {
        return finish(fa_cdn_twin(url).into_iter().collect());
    }

    if host == "t.furaffinity.net" {
        // t.furaffinity.net/<id>@<size>-<timestamp>.jpg
        let id = seg.first()?.split('@').next()?;
        if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        return Url::parse(&format!("https://www.furaffinity.net/view/{id}/")).ok().map(Upgrade::Page);
    }

    if host == "cdn.bsky.app" && parse_bsky_cdn(url).is_some() {
        return Some(Upgrade::Bluesky(url.clone()));
    }

    if host == "pbs.twimg.com" && seg.first() == Some(&"media") && seg.len() == 2 {
        // pbs.twimg.com/media/<id>.<ext>[:size] or /media/<id>?format=<ext>&name=<size>
        let file = seg[1].split(':').next()?;
        let (stem, path_ext) = file.rsplit_once('.').unwrap_or((file, ""));
        let query_ext = url.query_pairs().find(|(k, _)| k == "format").map(|(_, v)| v.into_owned());
        let have = normalize_ext(query_ext.as_deref().unwrap_or(path_ext));
        let base = format!("https://pbs.twimg.com/media/{stem}");
        let mut list = Vec::new();
        for ext in [want.as_str(), have.as_str()] {
            if !ext.is_empty() && !matches!(ext, "webm" | "mp4") {
                list.extend(Url::parse(&format!("{base}?format={ext}&name=orig")).ok());
            }
        }
        return finish(list);
    }

    if host == "i.pximg.net" {
        // .../img-master/img/<date path>/<id>_p0_master1200.jpg -> img-original/img/<date path>/<id>_p0.<ext>
        let path = url.path();
        let rest = ["/img-master/img/", "/custom-thumb/img/"]
            .iter()
            .find_map(|marker| path.find(marker).map(|i| &path[i + marker.len()..]))?;
        let (dir, file) = rest.rsplit_once('/')?;
        let mut parts = file.split('_');
        let (id, page) = (parts.next()?, parts.next()?);
        if !page.starts_with('p') {
            return None;
        }
        let mut list = Vec::new();
        for ext in [want.as_str(), "png", "jpg", "gif"] {
            if !ext.is_empty() && !matches!(ext, "webm" | "mp4") {
                list.extend(Url::parse(&format!("https://i.pximg.net/img-original/img/{dir}/{id}_{page}.{ext}")).ok());
            }
        }
        return finish(list);
    }

    if host.ends_with(".media.tumblr.com") {
        // Always `Media`, even with nothing to upgrade, so the URL is fetched with ACCEPT_MEDIA.
        let file = *seg.last()?;
        let (stem, ext) = file.rsplit_once('.').unwrap_or((file, ""));
        // `.pnj` is Tumblr's JPEG re-encode of a PNG (same URL with `.png` is the real PNG), and
        // `.gifv` a GIF's video/page form - checked live, 2026-11.
        let real_ext = match ext {
            "pnj" => "png",
            "gifv" => "gif",
            e => e,
        };
        let with = |size: Option<&str>, name: &str| -> Option<Url> {
            let mut path: Vec<&str> =
                seg[..seg.len() - 1].iter().map(|s| if is_tumblr_size(s) { size.unwrap_or(s) } else { s }).collect();
            path.push(name);
            let mut u = url.clone();
            u.set_path(&format!("/{}", path.join("/")));
            u.set_query(None);
            Some(u)
        };
        let real = if real_ext.is_empty() { file.to_string() } else { format!("{stem}.{real_ext}") };
        let mut list = Vec::new();
        if seg.iter().any(|s| is_tumblr_size(s)) {
            // The largest preset first; it 404s when the original is smaller, hence the fallbacks.
            list.extend(with(Some("s2048x3072"), &real));
            list.extend(with(None, &real));
        } else if let Some((prefix, _)) = stem.rsplit_once('_').filter(|(_, size)| {
            file.starts_with("tumblr_") && !size.is_empty() && size.bytes().all(|b| b.is_ascii_digit())
        }) {
            // Legacy tumblr_<key>_<size>.<ext>: _1280 is the largest legacy size.
            list.extend(with(None, &format!("{prefix}_1280.{real_ext}")));
            list.extend(with(None, &real));
        } else {
            list.extend(with(None, &real));
        }
        return finish(list);
    }

    // Blog-subdomain post pages (`<blog>.tumblr.com/post/<id>`) answer 403 to non-browser
    // clients; the same post at `www.tumblr.com/<blog>/<id>` is public (checked live, 2026-11).
    if let Some(blog) = host.strip_suffix(".tumblr.com").filter(|b| !b.contains('.') && !matches!(*b, "www" | "assets")) {
        if let (Some(&("post" | "image")), Some(id)) = (seg.first(), seg.get(1)) {
            if !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()) {
                return Url::parse(&format!("https://www.tumblr.com/{blog}/{id}")).ok().map(Upgrade::Page);
            }
        }
    }

    None
}

/// Where a source's file(s) were found: bytes already in hand (the source URL was itself a
/// file), or URLs still to be fetched (a site lookup's results, or a page's image).
enum Found {
    Image { bytes: Vec<u8>, url: Url },
    Urls(Vec<Url>),
}

/// The URL itself is an image/video, or an HTML page whose image `scrape_page` can find. `page`
/// is the URL the content really belongs to: `fetch` itself for a live source, the original URL
/// when `fetch` is a Wayback capture (then `archive_ts` re-points the page's images at the archive).
async fn find_generic(client: &Client, fetch: &Url, page: &Url, archive_ts: Option<&str>) -> Result<Found, String> {
    let response = get_timed(client, fetch, Some(MEDIA_TIMEOUT), ACCEPT_ANY).await?;
    let ct = content_type(&response);
    if ct == "text/html" || ct == "application/xhtml+xml" {
        let html = String::from_utf8_lossy(&read_capped(response, MAX_HTML_BYTES).await?).into_owned();
        let images = scrape_page(&html, page)?;
        Ok(Found::Urls(match archive_ts {
            None => images,
            Some(ts) => images.iter().filter_map(|u| wayback_raw(ts, u.as_str())).collect(),
        }))
    } else if ct.starts_with("text/") || ct.contains("json") {
        Err(format!("unsupported content ({ct})"))
    } else {
        let bytes = read_capped(response, MAX_MEDIA_BYTES).await?;
        if sniff_mime(&bytes).is_none() {
            return Err(format!("not a usable image or video ({})", if ct.is_empty() { "unknown type" } else { &ct }));
        }
        Ok(Found::Image { bytes, url: fetch.clone() })
    }
}

/// Runs every found URL through `upgrade_source`'s direct-media upgrades (an `og:image` is usually
/// a downsized copy - Tumblr's `s1280x1920` `.pnj`, a Twitter `name=small`, a Pixiv master).
fn upgrade_all(urls: Vec<Url>, expected: &Expected) -> Vec<Url> {
    let expanded = urls
        .into_iter()
        .flat_map(|u| match upgrade_source(&u, expected) {
            Some(Upgrade::Media(list)) => list,
            _ => vec![u],
        })
        .collect();
    dedupe_urls(expanded)
}

async fn find_images(client: &Client, source: &str, expected: &Expected) -> Result<Found, String> {
    let mut url = Url::parse(source.trim()).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("unsupported scheme".into());
    }

    match upgrade_source(&url, expected) {
        Some(Upgrade::Page(page)) => url = page,
        Some(Upgrade::Media(list)) => return Ok(Found::Urls(list)),
        Some(Upgrade::Bluesky(u)) => return Ok(Found::Urls(bsky_originals(client, vec![u]).await)),
        None => {}
    }

    let mut site_error = None;
    match resolve_site_image(client, &url, expected).await {
        Some(Ok(urls)) => return Ok(Found::Urls(upgrade_all(urls, expected))),
        Some(Err(e)) if e.starts_with(LOGIN_REQUIRED) => return Err(e),
        // These resolvers parse the page itself; the generic scrape would just fetch it again.
        Some(Err(e)) if is_furaffinity(&url) || is_hentaivox(&url) || is_sofurry(&url) || is_weasyl(&url) => return Err(e),
        Some(Err(e)) => site_error = Some(e),
        None => {}
    }

    match find_generic(client, &url, &url, None).await {
        Ok(Found::Urls(urls)) => Ok(Found::Urls(upgrade_all(urls, expected))),
        Ok(found) => Ok(found),
        Err(e) => Err(match site_error {
            Some(site) => format!("{site}; page scrape: {e}"),
            None => e,
        }),
    }
}

/// A Wayback Machine raw-capture URL (`<ts>id_` = the original bytes, without the archive's page
/// rewriting or toolbar). Wayback redirects to the nearest capture when there's none at `ts`.
fn wayback_raw(ts: &str, url: &str) -> Option<Url> {
    // An og:image read from a raw capture may itself already point into the archive.
    let original = url.rsplit_once("id_/").map_or(url, |(_, o)| o);
    Url::parse(&format!("https://web.archive.org/web/{ts}id_/{original}")).ok()
}

/// Timestamps out of a CDX JSON answer (`[["timestamp"], ["20200101..."], ...]`, header row first).
fn parse_cdx(json: &serde_json::Value) -> Vec<String> {
    json.as_array()
        .into_iter()
        .flatten()
        .filter_map(|row| row.as_array()?.first()?.as_str())
        .filter(|ts| ts.bytes().all(|b| b.is_ascii_digit()) && !ts.is_empty())
        .map(str::to_string)
        .collect()
}

/// Up to `k` items spread evenly from the first to the last (oldest to newest capture), so a URL
/// that later turned into a 404 page or a login wall still gets its early captures tried.
fn pick_spread<T: Clone>(items: &[T], k: usize) -> Vec<T> {
    let n = items.len();
    if n <= k || k < 2 {
        return items.iter().take(k.max(1).min(n)).cloned().collect();
    }
    let mut idx: Vec<usize> = (0..k).map(|i| (i * (n - 1) + (k - 1) / 2) / (k - 1)).collect();
    idx.dedup();
    idx.into_iter().map(|i| items[i].clone()).collect()
}

/// Capture timestamps worth trying for `url`: the CDX index's distinct-content 200 captures
/// (`collapse=digest` drops repeats), spread over time; else the availability API's closest one.
async fn wayback_captures(client: &Client, url: &str) -> Result<Vec<String>, String> {
    match get_json(
        client,
        "https://web.archive.org/cdx/search/cdx",
        &[("url", url), ("output", "json"), ("fl", "timestamp"), ("filter", "statuscode:200"), ("collapse", "digest"), ("limit", "200")],
        None,
    )
    .await
    {
        Ok(json) => {
            let all = parse_cdx(&json);
            if !all.is_empty() {
                return Ok(pick_spread(&all, WAYBACK_CAPTURES_PER_TARGET));
            }
            // An empty CDX answer is authoritative enough, but the availability API is cheap.
        }
        Err(e) => trace(format!("  CDX lookup failed: {e}")),
    }
    let json = get_json(client, "https://archive.org/wayback/available", &[("url", url)], None).await?;
    let closest = json.pointer("/archived_snapshots/closest").ok_or("no Wayback snapshot")?;
    match (closest.get("available").and_then(|a| a.as_bool()), closest.get("timestamp").and_then(|t| t.as_str())) {
        (Some(true), Some(ts)) => Ok(vec![ts.to_string()]),
        _ => Err("no Wayback snapshot".into()),
    }
}

/// Shared state of one recovery run (its tasks run in parallel - see `PARALLEL_HOSTS`).
struct Session {
    client: Client,
    expected: Expected,
    ch: Channel<RecoverProgress>,
    /// The post's cache folder; candidates are written here as they're found.
    dir: PathBuf,
    found: Mutex<Vec<(usize, RecoveredImage)>>,
    seen_md5: Mutex<HashSet<String>>,
    failures: Mutex<Vec<Attempt>>,
    exact: AtomicBool,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Session {
    fn progress(&self, stage: &'static str, message: impl Into<String>) {
        progress(&self.ch, stage, message);
    }

    fn fail(&self, stage: &'static str, label: impl Into<String>, url: Option<&str>, reason: impl Into<String>) {
        lock(&self.failures).push(Attempt {
            stage: stage.to_string(),
            label: label.into(),
            url: url.map(str::to_string),
            reason: reason.into(),
        });
    }

    fn done(&self) -> bool {
        self.exact.load(Ordering::Relaxed)
    }

    fn good_enough(&self) -> bool {
        self.done() || lock(&self.found).iter().any(|(_, c)| c.grade >= Grade::SameDimensions)
    }

    /// Grades one downloaded file and, if it's usable and new, stores it in the cache folder.
    fn consider(&self, order: usize, source: &str, bytes: &[u8], url: &Url, via_archive: bool) {
        self.progress("comparing", format!("Comparing {} to the original", host_of(url)));
        let Some(mut c) = score_candidate(&self.expected, source, bytes, url, via_archive) else {
            self.progress("scored", format!("Skipped a file from {} that isn't a usable image", host_of(url)));
            return;
        };
        self.progress(
            "scored",
            format!(
                "Scored {} {} from {}: {}",
                if c.is_video { "a".to_string() } else { format!("{}x{}", c.width, c.height) },
                ext_for_mime(&c.mime),
                host_of(url),
                grade_label(c.grade)
            ),
        );
        // Byte-identical repeats (the same file via two sources) are kept once.
        if !lock(&self.seen_md5).insert(c.md5.clone()) {
            return;
        }
        match recovered::store_file(&self.dir, &c.md5, ext_for_mime(&c.mime), bytes) {
            Ok(file) => c.file = file,
            Err(e) => {
                self.fail("source", host_of(url), Some(url.as_str()), format!("couldn't save the file ({e})"));
                return;
            }
        }
        if c.grade == Grade::Exact {
            self.exact.store(true, Ordering::Relaxed);
        }
        lock(&self.found).push((order, c));
    }

    /// Downloads and grades each of `found`'s files, stopping early on an exact match.
    async fn evaluate(&self, order: usize, source: &str, found: Found, via_archive: bool) {
        match found {
            Found::Image { bytes, url } => self.consider(order, source, &bytes, &url, via_archive),
            Found::Urls(urls) => {
                let total = urls.len().min(MAX_CANDIDATES_PER_SOURCE);
                for (i, url) in urls.into_iter().take(MAX_CANDIDATES_PER_SOURCE).enumerate() {
                    if self.done() {
                        break;
                    }
                    self.progress(
                        "downloading",
                        if total > 1 {
                            format!("Downloading file {} of {total} from {}", i + 1, host_of(&url))
                        } else {
                            format!("Downloading file from {}", host_of(&url))
                        },
                    );
                    match fetch_media(&self.client, &url).await {
                        Ok(bytes) => self.consider(order, source, &bytes, &url, via_archive),
                        Err(e) => trace(format!("  candidate download failed: {url}: {e}")),
                    }
                }
            }
        }
    }

    async fn try_source(&self, order: usize, total: usize, source: &str) {
        let host = Url::parse(source).map(|u| host_of(&u)).unwrap_or_else(|_| source.to_string());
        self.progress("fetching", format!("Fetching post from {host} (source {} of {total})", order + 1));
        match find_images(&self.client, source, &self.expected).await {
            Ok(found) => self.evaluate(order, source, found, false).await,
            Err(e) => {
                trace(format!("source failed: {source}: {e}"));
                self.progress("failed", format!("{host}: {}", e.lines().next().unwrap_or("failed")));
                self.fail("source", host, Some(source), e);
            }
        }
    }

    /// Looks the post's md5 up on one booru and grades whatever it finds (normally one exact match).
    async fn try_mirror(&self, order: usize, mirror: Mirror, md5: &str) {
        self.progress("fetching", format!("Looking for an identical copy on {}", mirror.name()));
        match mirror.lookup(&self.client, md5).await {
            Ok(hits) if hits.is_empty() => self.fail("mirror", mirror.name(), None, "no copy"),
            Ok(hits) => {
                for hit in hits {
                    if self.done() {
                        break;
                    }
                    self.evaluate(order, &hit.page, Found::Urls(vec![hit.file]), false).await;
                }
            }
            Err(e) => {
                self.progress("failed", format!("{}: {}", mirror.name(), e.lines().next().unwrap_or("failed")));
                self.fail("mirror", mirror.name(), None, e);
            }
        }
    }

    /// Tries a few Wayback captures of `target` (a source URL, or e621's own CDN path for the md5).
    async fn try_archive(&self, order: usize, target: &str) {
        let Ok(page) = Url::parse(target) else { return };
        if wayback_paused() {
            self.fail("archive", host_of(&page), Some(target), "skipped - the Wayback Machine asked us to slow down; it's left alone for a few minutes");
            return;
        }
        self.progress("archive", format!("Checking the Wayback Machine for {}", host_of(&page)));
        let captures = match wayback_captures(&self.client, target).await {
            Ok(c) => c,
            Err(e) => {
                self.fail("archive", host_of(&page), Some(target), e);
                return;
            }
        };
        let mut errors: Vec<String> = Vec::new();
        let mut tried = 0;
        for ts in captures {
            if self.good_enough() {
                return;
            }
            let Some(raw) = wayback_raw(&ts, target) else { continue };
            self.progress("archive", format!("Trying the {} capture of {}", &ts[..ts.len().min(8)], host_of(&page)));
            tried += 1;
            match find_generic(&self.client, &raw, &page, Some(&ts)).await {
                Ok(found) => self.evaluate(order, target, found, true).await,
                Err(e) if !errors.contains(&e) => errors.push(e),
                Err(_) => {}
            }
        }
        if !errors.is_empty() {
            let captures = if tried == 1 { "1 capture".to_string() } else { format!("{tried} captures") };
            self.fail("archive", host_of(&page), Some(target), format!("{captures}, none usable: {}", errors.join("; ")));
        }
    }
}

/// Why a source can't hold the post's image, if it's one of the "this artist is on site X" links
/// e621 sources are full of: a site's front page (`https://forge.sofurry.com/`) or an artist's
/// profile/gallery page on a site we know the URL layout of. Neither the live page nor its Wayback
/// captures can hold the post's image, so these are skipped rather than spending time on them.
fn not_a_post(source: &str) -> Option<&'static str> {
    let url = Url::parse(source).ok()?;
    if matches!(url.path(), "" | "/") && url.query().is_none() {
        return Some("only the site's front page");
    }
    let host = url.host_str()?.to_ascii_lowercase();
    let host = host.trim_start_matches("www.").trim_start_matches("mobile.");
    let seg = path_segments(&url);
    let first = seg.first().copied().unwrap_or("");
    let profile = match host {
        "furaffinity.net" => matches!(first, "user" | "gallery" | "scraps" | "favorites" | "journals" | "commissions"),
        "twitter.com" | "x.com" => !seg.contains(&"status") && first != "i",
        "bsky.app" => first == "profile" && !seg.contains(&"post"),
        "pixiv.net" => seg.iter().any(|s| *s == "users"),
        "deviantart.com" => seg.len() == 1 || seg.get(1).is_some_and(|s| matches!(*s, "gallery" | "about")),
        _ => false,
    };
    profile.then_some("an artist's profile page, not a link to the post")
}

/// Fur Affinity's file host moved from `d.facdn.net` to `d.furaffinity.net` (same paths); the
/// other spelling of a file URL, so both get tried (live and on the Wayback Machine).
fn fa_cdn_twin(url: &Url) -> Option<Url> {
    let twin = match url.host_str()? {
        "d.facdn.net" => "d.furaffinity.net",
        "d.furaffinity.net" => "d.facdn.net",
        _ => return None,
    };
    let mut u = url.clone();
    u.set_host(Some(twin)).ok()?;
    Some(u)
}

/// A URL that points straight at a file (by extension) - the most promising Wayback targets.
fn looks_like_file(source: &str) -> bool {
    Url::parse(source).is_ok_and(|u| {
        let path = u.path().to_ascii_lowercase();
        [".jpg", ".jpeg", ".png", ".gif", ".webp", ".webm", ".mp4", ".pnj"].iter().any(|e| path.ends_with(e))
    })
}

/// Sources grouped by host, in the order each host first appears. Sources on one host run
/// one after another; different hosts run in parallel.
fn group_by_host(sources: &[String]) -> Vec<Vec<(usize, String)>> {
    let mut groups: Vec<(String, Vec<(usize, String)>)> = Vec::new();
    for (i, s) in sources.iter().enumerate() {
        let host = Url::parse(s).ok().and_then(|u| u.host_str().map(|h| h.trim_start_matches("www.").to_string())).unwrap_or_default();
        match groups.iter_mut().find(|(h, _)| *h == host) {
            Some((_, g)) => g.push((i, s.clone())),
            None => groups.push((host, vec![(i, s.clone())])),
        }
    }
    groups.into_iter().map(|(_, g)| g).collect()
}

/// The post's md5, if e621 gave a well-formed one (lowercased).
fn valid_md5(md5: Option<&str>) -> Option<String> {
    md5.map(|m| m.trim().to_ascii_lowercase()).filter(|m| m.len() == 32 && m.bytes().all(|b| b.is_ascii_hexdigit()))
}

fn recovery_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .read_timeout(READ_IDLE_TIMEOUT)
        .redirect(redirect_policy())
        .dns_resolver(Arc::new(PublicOnlyResolver))
        .user_agent(format!("MonosodiumDesktop/{} (source recovery for deleted e621 posts)", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

async fn run_recovery(
    site: Site,
    post_id: i64,
    sources: Vec<String>,
    expected: Expected,
    on_progress: Channel<RecoverProgress>,
) -> Result<RecoveredSet, RecoverFailure> {
    let web_sources: Vec<String> = sources
        .iter()
        .map(|s| s.trim())
        .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
        .map(str::to_string)
        .collect();
    let (homepages, web_sources): (Vec<String>, Vec<String>) =
        web_sources.into_iter().partition(|s| not_a_post(s).is_some());
    let session = Arc::new(Session {
        client: recovery_client()?,
        expected,
        ch: on_progress,
        dir: recovered::post_dir(site, post_id),
        found: Mutex::new(Vec::new()),
        seen_md5: Mutex::new(HashSet::new()),
        failures: Mutex::new(Vec::new()),
        exact: AtomicBool::new(false),
    });

    for page in &homepages {
        let why = not_a_post(page).unwrap_or("not a link to the post");
        let host = Url::parse(page).map(|u| host_of(&u)).unwrap_or_default();
        session.fail("skipped", host, Some(page), why);
    }

    // Live sources: hosts in parallel, each host's sources in order.
    let total = web_sources.len();
    let permits = Arc::new(Semaphore::new(PARALLEL_HOSTS));
    let mut tasks = JoinSet::new();
    for group in group_by_host(&web_sources) {
        let (s, permits) = (session.clone(), permits.clone());
        tasks.spawn(async move {
            let _permit = permits.acquire_owned().await.ok();
            for (i, source) in group {
                if s.done() {
                    break;
                }
                s.try_source(i, total, &source).await;
            }
        });
    }
    // md5 lookups on other boorus run alongside: one request each, and a hit is an exact copy.
    if let Some(md5) = valid_md5(session.expected.md5.as_deref()) {
        for (k, mirror) in Mirror::available().into_iter().enumerate() {
            let (s, md5) = (session.clone(), md5.clone());
            tasks.spawn(async move { s.try_mirror(total + 100 + k, mirror, &md5).await });
        }
    }
    let finished = tokio::time::timeout(LIVE_BUDGET, async {
        while tasks.join_next().await.is_some() {
            if session.done() {
                break;
            }
        }
    })
    .await;
    tasks.abort_all();
    if finished.is_err() {
        session.progress("failed", "Stopped waiting for the remaining sources (time limit)");
        session.fail("limit", "Live sources", None, format!("stopped after {}s", LIVE_BUDGET.as_secs()));
    }

    // Archived copies: each source, then e621's own CDN file for the md5.
    if !session.good_enough() {
        // Direct file URLs first - an archived copy of the file itself is the best find, and the
        // budget may not stretch to every page's captures.
        let mut targets: Vec<String> = Vec::new();
        for t in web_sources.iter().filter(|s| looks_like_file(s)).chain(web_sources.iter().filter(|s| !looks_like_file(s))) {
            targets.push(t.clone());
            if let Some(twin) = Url::parse(t).ok().and_then(|u| fa_cdn_twin(&u)) {
                targets.push(twin.to_string());
            }
        }
        if let Some(md5) = valid_md5(session.expected.md5.as_deref()) {
            let ext = normalize_ext(&session.expected.ext);
            let ext = if ext.is_empty() { "jpg".to_string() } else { ext };
            targets.push(format!("https://{}/data/{}/{}/{md5}.{ext}", site.static_host(), &md5[0..2], &md5[2..4]));
        }
        let s = session.clone();
        let finished = tokio::time::timeout(ARCHIVE_BUDGET, async move {
            for (k, target) in targets.iter().enumerate() {
                if s.good_enough() {
                    break;
                }
                s.try_archive(total + k, target).await;
            }
        })
        .await;
        if finished.is_err() {
            session.fail("limit", "Wayback Machine", None, format!("stopped after {}s", ARCHIVE_BUDGET.as_secs()));
        }
    }

    let mut found = std::mem::take(&mut *lock(&session.found));
    // Best score first; equal scores keep the order the sources are listed in.
    found.sort_by(|(oa, a), (ob, b)| b.score.cmp(&a.score).then(oa.cmp(ob)));
    let failures = std::mem::take(&mut *lock(&session.failures));
    match found.first() {
        Some((_, best)) => {
            session.progress("done", format!("Best match: {} (score {})", grade_label(best.grade), best.score));
            recovered::save(site, post_id, found.into_iter().map(|(_, c)| c).collect(), failures).map_err(RecoverFailure::from)
        }
        None => {
            // Reached only when the search ran to the end (a cancel aborts the task before here).
            recovered::mark_not_found(site, post_id, failures.clone());
            let no_sources = web_sources.is_empty() && homepages.is_empty();
            Err(RecoverFailure {
                message: if no_sources {
                    "No copy found. The post lists no sources, and no other site has a file with its checksum.".into()
                } else {
                    "No copy found.".into()
                },
                cancelled: false,
                no_sources,
                attempts: failures,
            })
        }
    }
}

/// One place a recovery looked without result, for the viewer's report. `stage`: "source" (one of
/// the post's sources), "skipped" (a source that can't hold the post), "mirror" (an md5 lookup on
/// another booru), "archive" (Wayback Machine captures of a URL), "limit" (a phase ran out of time).
/// `reason` is the raw message; the viewer turns the common ones into plain words.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Attempt {
    pub stage: String,
    /// The host or site name ("furaffinity.net", "Danbooru").
    pub label: String,
    pub url: Option<String>,
    pub reason: String,
}

/// Why a recovery came back empty-handed (the command's error value).
#[derive(serde::Serialize, Debug)]
pub struct RecoverFailure {
    pub message: String,
    pub cancelled: bool,
    pub no_sources: bool,
    pub attempts: Vec<Attempt>,
}

impl From<String> for RecoverFailure {
    fn from(message: String) -> Self {
        RecoverFailure { message, cancelled: false, no_sources: false, attempts: Vec::new() }
    }
}

/// Running recoveries by the frontend's token, so `cancel_recovery` can abort one (the viewer
/// cancels when the user navigates away or presses Cancel). A cancel that arrives before its
/// recovery registered is remembered in `cancelled_early`.
#[derive(Default)]
struct Running {
    tasks: HashMap<u32, AbortHandle>,
    cancelled_early: HashSet<u32>,
}

fn running() -> &'static Mutex<Running> {
    static RUNNING: OnceLock<Mutex<Running>> = OnceLock::new();
    RUNNING.get_or_init(Default::default)
}

/// Tries each of a deleted post's `sources` and returns every usable file found, best match to
/// the post's original first, so the viewer can let the user pick. e621 keeps a deleted post's
/// md5, byte size, dimensions and format, so every download is graded against them (see `Grade`);
/// an md5 match ends the search immediately. Sources on different hosts are tried in parallel
/// (see `PARALLEL_HOSTS`), thumbnail URLs are upgraded to their originals first (`upgrade_source`),
/// and site-specific lookups (X, Bluesky, Pixiv, DeviantArt, FA) return every file of a
/// multi-image source. When no live source reaches `SameDimensions`, a few Wayback Machine
/// captures of each source - and of e621's own CDN path for the md5 - are tried too.
///
/// Results are written to the post's cache folder (`recovered.rs`) and merged with anything
/// recovered for it before; the merged set comes back. Fetched here (not in the webview) so
/// hotlink/CORS rules don't apply, and not through api.rs's `request()` - these are third-party
/// hosts, not the e621 API. Status lines stream over `on_progress`.
#[tauri::command]
pub async fn recover_from_sources(
    site: Site,
    post_id: i64,
    sources: Vec<String>,
    expected: Expected,
    token: u32,
    on_progress: Channel<RecoverProgress>,
) -> Result<RecoveredSet, RecoverFailure> {
    let task = tokio::spawn(run_recovery(site, post_id, sources, expected, on_progress));
    {
        let mut r = lock(running());
        if r.cancelled_early.remove(&token) {
            task.abort();
        } else {
            r.tasks.insert(token, task.abort_handle());
        }
    }
    let result = task.await;
    lock(running()).tasks.remove(&token);
    match result {
        Ok(r) => r,
        Err(e) if e.is_cancelled() => Err(RecoverFailure { cancelled: true, ..RecoverFailure::from("Cancelled.".to_string()) }),
        Err(e) => Err(e.to_string().into()),
    }
}

#[tauri::command]
pub fn cancel_recovery(token: u32) {
    let mut r = lock(running());
    match r.tasks.remove(&token) {
        Some(handle) => handle.abort(),
        None => {
            // Normally a cancel that raced ahead of its recovery's start; a late cancel for one that
            // already finished also lands here, so keep the set from growing without bound.
            if r.cancelled_early.len() > 64 {
                r.cancelled_early.clear();
            }
            r.cancelled_early.insert(token);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smallest byte string `imagesize` accepts as a PNG of the given dimensions (signature + IHDR).
    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut v = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        v.extend_from_slice(&w.to_be_bytes());
        v.extend_from_slice(&h.to_be_bytes());
        v.extend_from_slice(&[8, 2, 0, 0, 0, 0, 0, 0, 0]);
        v
    }

    fn grade(expected: &Expected, bytes: &[u8]) -> Option<Grade> {
        let url = Url::parse("https://example.com/x").unwrap();
        score_candidate(expected, "https://example.com/", bytes, &url, false).map(|c| c.grade)
    }

    fn expected_for(bytes: &[u8], w: i64, h: i64) -> Expected {
        Expected { md5: Some(md5_hex(bytes)), size: bytes.len() as i64, width: w, height: h, ext: "png".into() }
    }

    #[test]
    fn ssrf_guard_blocks_non_public_hosts() {
        for bad in [
            "http://127.0.0.1/", "http://localhost:8080/", "http://foo.localhost/", "http://10.1.2.3/",
            "http://192.168.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/",
            "http://[fd00::1]/", "http://[::ffff:127.0.0.1]/", "http://100.64.0.1/", "http://0.0.0.0/",
            "file:///C:/Windows/win.ini",
        ] {
            assert!(check_url(&Url::parse(bad).unwrap()).is_err(), "{bad} should be blocked");
        }
        for ok in ["https://www.furaffinity.net/view/1/", "http://93.184.216.34/", "https://[2606:4700::1]/"] {
            assert!(check_url(&Url::parse(ok).unwrap()).is_ok(), "{ok} should be allowed");
        }
    }

    #[test]
    fn grades_against_the_original() {
        let original = png(1500, 2000);
        let expected = expected_for(&original, 1500, 2000);
        assert_eq!(grade(&expected, &original), Some(Grade::Exact));
        // Same dimensions, different bytes.
        let mut reencoded = png(1500, 2000);
        reencoded.push(0);
        assert_eq!(grade(&expected, &reencoded), Some(Grade::SameDimensions));
        // A 3:4 preview of a 3:4 original.
        assert_eq!(grade(&expected, &png(600, 800)), Some(Grade::Rescaled));
        // A different shape (e.g. a square crop or a logo).
        assert_eq!(grade(&expected, &png(500, 500)), Some(Grade::Mismatch));
        // Not an image at all.
        assert_eq!(grade(&expected, b"<html>nope</html>"), None);
    }

    #[test]
    fn better_grade_always_outranks_closer_size() {
        let original = png(1500, 2000);
        let expected = expected_for(&original, 1500, 2000);
        let url = Url::parse("https://example.com/x").unwrap();
        let score = |bytes: &[u8]| score_candidate(&expected, "s", bytes, &url, false).unwrap().score;
        assert!(score(&png(1500, 2000)) > score(&png(600, 800)));
        assert!(score(&png(600, 800)) > score(&png(500, 500)));
    }

    #[test]
    fn sniffs_real_file_types() {
        assert_eq!(sniff_mime(&png(1, 1)), Some("image/png"));
        assert_eq!(sniff_mime(b"\xff\xd8\xff\xe0rest"), Some("image/jpeg"));
        assert_eq!(sniff_mime(b"GIF89a...."), Some("image/gif"));
        assert_eq!(sniff_mime(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff_mime(b"\x1a\x45\xdf\xa3webm"), Some("video/webm"));
        assert_eq!(sniff_mime(b"\0\0\0\x20ftypisom...."), Some("video/mp4"));
        assert_eq!(sniff_mime(b"\0\0\0\x20ftypavif...."), Some("image/avif"));
        assert_eq!(sniff_mime(b"\0\0\0\x20ftypheic...."), None);
        assert_eq!(sniff_mime(b"<!doctype html>"), None);
    }

    #[test]
    fn grades_videos_by_md5_only() {
        let video = b"\x1a\x45\xdf\xa3some webm bytes".to_vec();
        let expected =
            Expected { md5: Some(md5_hex(&video)), size: video.len() as i64, width: 640, height: 480, ext: "webm".into() };
        assert_eq!(grade(&expected, &video), Some(Grade::Exact));
        let mut other = video.clone();
        other.push(1);
        assert_eq!(grade(&expected, &other), Some(Grade::Rescaled));
        // A poster frame of a video post never counts as the post.
        assert_eq!(grade(&expected, &png(640, 480)), Some(Grade::Mismatch));
    }

    #[test]
    fn decodes_entities_in_attributes() {
        assert_eq!(decode_entities("a&amp;b&#x2F;c&#47;d&quot;"), "a&b/c/d\"");
        assert_eq!(decode_entities("&amp;lt; &unknown; & alone"), "&lt; &unknown; & alone");
        let html = r#"<meta property="og:image" content="https:&#x2F;&#x2F;cdn.example&#x2F;a.png?x=1&amp;y=2">"#;
        let base = Url::parse("https://example.com/page").unwrap();
        assert_eq!(find_meta_image(html, &base).unwrap().as_str(), "https://cdn.example/a.png?x=1&y=2");
    }

    fn media(url: &str, ext: &str) -> Vec<String> {
        let e = Expected { ext: ext.into(), ..Default::default() };
        match upgrade_source(&Url::parse(url).unwrap(), &e) {
            Some(Upgrade::Media(list)) => list.iter().map(|u| u.to_string()).collect(),
            other => panic!("{url}: expected Media, got {other:?}"),
        }
    }

    #[test]
    fn upgrades_twitter_thumbnails() {
        assert_eq!(
            media("https://pbs.twimg.com/media/AbC123.jpg:small", "png"),
            [
                "https://pbs.twimg.com/media/AbC123?format=png&name=orig",
                "https://pbs.twimg.com/media/AbC123?format=jpg&name=orig",
                "https://pbs.twimg.com/media/AbC123.jpg:small",
            ]
        );
        assert_eq!(
            media("https://pbs.twimg.com/media/AbC123?format=jpg&name=900x900", "jpg"),
            [
                "https://pbs.twimg.com/media/AbC123?format=jpg&name=orig",
                "https://pbs.twimg.com/media/AbC123?format=jpg&name=900x900",
            ]
        );
    }

    #[test]
    fn upgrades_pixiv_masters() {
        let list = media(
            "https://i.pximg.net/c/600x1200_90/img-master/img/2020/01/02/03/04/05/12345_p1_master1200.jpg",
            "png",
        );
        assert_eq!(list[0], "https://i.pximg.net/img-original/img/2020/01/02/03/04/05/12345_p1.png");
        assert_eq!(list[1], "https://i.pximg.net/img-original/img/2020/01/02/03/04/05/12345_p1.jpg");
        assert!(list.last().unwrap().contains("master1200"));
    }

    #[test]
    fn upgrades_tumblr_media() {
        // A sized preset + `.pnj` (a JPEG re-encode): the largest preset as the real PNG, the same
        // size as PNG, then the URL as given.
        assert_eq!(
            media("https://64.media.tumblr.com/aa/bb-cc/s1280x1920/dd.pnj", "png"),
            [
                "https://64.media.tumblr.com/aa/bb-cc/s2048x3072/dd.png",
                "https://64.media.tumblr.com/aa/bb-cc/s1280x1920/dd.png",
                "https://64.media.tumblr.com/aa/bb-cc/s1280x1920/dd.pnj",
            ]
        );
        assert_eq!(
            media("https://64.media.tumblr.com/aa/tumblr_key_640.jpg", "jpg"),
            ["https://64.media.tumblr.com/aa/tumblr_key_1280.jpg", "https://64.media.tumblr.com/aa/tumblr_key_640.jpg"]
        );
        // Nothing to upgrade still comes back as Media, so it's fetched with ACCEPT_MEDIA.
        assert_eq!(
            media("https://64.media.tumblr.com/aa/tumblr_key_1280.jpg", "jpg"),
            ["https://64.media.tumblr.com/aa/tumblr_key_1280.jpg"]
        );
    }

    #[test]
    fn rewrites_pages_that_block_us() {
        let page = |u: &str| match upgrade_source(&Url::parse(u).unwrap(), &Expected::default()) {
            Some(Upgrade::Page(p)) => Some(p.to_string()),
            _ => None,
        };
        assert_eq!(
            page("https://someblog.tumblr.com/post/817173039714385920/a-slug").as_deref(),
            Some("https://www.tumblr.com/someblog/817173039714385920")
        );
        assert_eq!(page("https://www.tumblr.com/someblog/817173039714385920"), None);
        assert_eq!(
            page("https://t.furaffinity.net/12345678@600-1700000000.jpg").as_deref(),
            Some("https://www.furaffinity.net/view/12345678/")
        );
    }

    #[test]
    fn finds_sofurry_display_files() {
        // The shape of the route data in a real page (JSON-escaped inside a script string).
        let html = r#"x\",\"thumbUrl\",\"https://cdn.sofurryfiles.com/submissions/thumbnails/92/eb/t\",\"file\",\"extension\",\"png\",\"displayUrl\",\"https://cdn.sofurryfiles.com/submissions/contents/display/ac/62/ac62eada-ec60\",\"meta\""#;
        assert_eq!(
            urls_of(parse_sofurry(html).unwrap()),
            ["https://cdn.sofurryfiles.com/submissions/contents/display/ac/62/ac62eada-ec60"]
        );
        assert!(parse_sofurry("<html>no files</html>").is_err());
        // A multi-byte char right where the search window would end mustn't panic.
        let tricky = format!("displayUrl{}é", " ".repeat(199));
        assert!(parse_sofurry(&tricky).is_err());
    }

    fn urls_of(list: Vec<Url>) -> Vec<String> {
        list.into_iter().map(String::from).collect()
    }

    #[test]
    fn weasyl_pages_and_click_through() {
        let page = Url::parse("https://www.weasyl.com/~sammyphan/submissions/2627424/halloween-2026").unwrap();
        // The 18+ cookie goes to that submission's page only.
        assert_eq!(session_cookie_for(&page).as_deref(), Some("ro=2627424"));
        assert_eq!(session_cookie_for(&Url::parse("https://www.weasyl.com/~sammyphan").unwrap()), None);
        assert_eq!(session_cookie_for(&Url::parse("https://cdn.weasyl.com/~x/submissions/1/a/b.jpg").unwrap()), None);
        // Unlocked page (shape of the real one): the Download link first, og:image preview after.
        let full = "https://cdn.weasyl.com/~sammyphan/submissions/2627424/772c5c/sammyphan-halloween-2026.jpg";
        let html = format!(
            r#"<meta property="og:image" content="https://cdn.weasyl.com/static/media/cf/c6/91/cfc6.webp" /><div id="detail-art"><a href="{full}" download><img src="https://cdn.weasyl.com/static/media/1c/64/ff/1c64.jpg"></a></div>"#
        );
        let urls = parse_weasyl(&html, &page).unwrap();
        assert_eq!(urls[0].as_str(), full);
        assert_eq!(urls.len(), 2);
        // Still gated: no art, no preview.
        let gated = r#"<form class="form skinny form-flow" id="rating-override" action="javascript:;" data-submitid="2627424"></form>"#;
        assert!(parse_weasyl(gated, &page).unwrap_err().contains("18+"));
    }

    #[test]
    fn bluesky_cdn_urls_parse() {
        let u = Url::parse("https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc123/bafkreixyz@jpeg").unwrap();
        assert_eq!(parse_bsky_cdn(&u), Some(("did:plc:abc123".into(), "bafkreixyz".into())));
        assert!(matches!(upgrade_source(&u, &Expected::default()), Some(Upgrade::Bluesky(_))));
    }

    #[test]
    fn wayback_capture_selection() {
        let json: serde_json::Value =
            serde_json::from_str(r#"[["timestamp"],["20200101000000"],["20210101000000"],["20220101000000"]]"#).unwrap();
        assert_eq!(parse_cdx(&json), ["20200101000000", "20210101000000", "20220101000000"]);
        assert_eq!(pick_spread(&[1, 2, 3], 4), [1, 2, 3]);
        assert_eq!(pick_spread(&(0..10).collect::<Vec<_>>(), 4), [0, 3, 6, 9]);
        assert_eq!(pick_spread(&(0..100).collect::<Vec<_>>(), 2), [0, 99]);
        assert_eq!(
            wayback_raw("2020", "https://web.archive.org/web/2019id_/https://x.com/a.png").unwrap().as_str(),
            "https://web.archive.org/web/2020id_/https://x.com/a.png"
        );
    }

    #[test]
    fn parses_booru_md5_answers() {
        let md5 = "7848c812646d034d19af26acdbcf7c50";
        // rule34.paheal: a hit, and its odd miss shape (count='1', no <post>).
        let hit = format!("<posts count='1' offset='0'><post id='7500809' md5='{md5}' file_name='a b.jpg' file_url='https://r34i.paheal-cdn.net/78/48/{md5}' /></posts>");
        let hits = paheal_hits(&hit, md5);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].page, "https://rule34.paheal.net/post/view/7500809");
        assert!(paheal_hits("<posts count='1' offset='0'></posts>", md5).is_empty());
        // Gelbooru-style wrapper, Rule34.xxx bare array + empty miss, refused key.
        let gel = format!(r#"{{"@attributes":{{"count":1}},"post":[{{"id":5,"md5":"{md5}","file_url":"https://img.gelbooru.com/x.png"}}]}}"#);
        assert_eq!(parse_dapi(&gel, md5, "md5", "https://g/?id=").unwrap()[0].page, "https://g/?id=5");
        let r34 = format!(r#"[{{"id":9,"hash":"{md5}","file_url":"https://r34/x.png"}},{{"id":10,"hash":"0000","file_url":"https://r34/y.png"}}]"#);
        assert_eq!(parse_dapi(&r34, md5, "hash", "p").unwrap().len(), 1, "only the post with the right md5");
        assert!(parse_dapi("", md5, "hash", "p").unwrap().is_empty());
        assert!(parse_dapi(r#""Missing authentication.""#, md5, "hash", "p").is_err());
        assert_eq!(leading_id("3978541-p2-title"), Some("3978541"));
        assert_eq!(leading_id("title"), None);
    }

    #[test]
    fn reads_tweet_media_from_each_api() {
        let syn: serde_json::Value = serde_json::from_str(r#"{"mediaDetails":[{"type":"photo","media_url_https":"https://pbs.twimg.com/media/A.jpg"},{"type":"video","media_url_https":"https://pbs.twimg.com/poster.jpg","video_info":{"variants":[{"content_type":"video/mp4","bitrate":100,"url":"https://video.twimg.com/lo.mp4"},{"content_type":"video/mp4","bitrate":900,"url":"https://video.twimg.com/hi.mp4"},{"content_type":"application/x-mpegURL","url":"https://video.twimg.com/p.m3u8"}]}}]}"#).unwrap();
        assert_eq!(
            syndication_media(&syn),
            [TweetMedia::Photo("https://pbs.twimg.com/media/A.jpg".into()), TweetMedia::Video(Url::parse("https://video.twimg.com/hi.mp4").unwrap())]
        );
        // FxTwitter's shape (real answer for an age-restricted tweet, trimmed).
        let fx: serde_json::Value = serde_json::from_str(r#"{"code":200,"message":"OK","tweet":{"media":{"all":[{"type":"photo","url":"https://pbs.twimg.com/media/EqqGJYhXMAAqFeh.jpg?name=orig"}]}}}"#).unwrap();
        assert_eq!(mirror_media(&fx), [TweetMedia::Photo("https://pbs.twimg.com/media/EqqGJYhXMAAqFeh.jpg".into())]);
        let vx: serde_json::Value = serde_json::from_str(r#"{"mediaURLs":["https://pbs.twimg.com/media/B.png"],"media_extended":[{"type":"image","url":"https://pbs.twimg.com/media/B.png"},{"type":"video","url":"https://video.twimg.com/v.mp4"}]}"#).unwrap();
        assert_eq!(mirror_media(&vx).len(), 2);
    }

    #[test]
    fn skips_sources_that_cannot_hold_the_post() {
        for skip in [
            "https://forge.sofurry.com/",
            "https://example.com",
            "https://www.furaffinity.net/user/brachiaraidos/",
            "https://www.furaffinity.net/gallery/someone/",
            "https://x.com/Forgewalfhammer",
            "https://twitter.com/someone/media",
            "https://bsky.app/profile/someone.bsky.social",
            "https://www.pixiv.net/en/users/123",
            "https://www.deviantart.com/someone",
            "https://www.deviantart.com/someone/gallery",
        ] {
            assert!(not_a_post(skip).is_some(), "{skip} should be skipped");
        }
        for keep in [
            "https://example.com/?p=123",
            "https://www.furaffinity.net/view/23742600/",
            "https://x.com/Forgewalfhammer/status/1345035022781321218",
            "https://x.com/i/web/status/1345035022781321218",
            "https://bsky.app/profile/someone.bsky.social/post/3k",
            "https://www.pixiv.net/en/artworks/123",
            "https://www.deviantart.com/someone/art/some-piece-123",
            "https://d.facdn.net/art/a/1/1.a_b.jpg",
        ] {
            assert!(not_a_post(keep).is_none(), "{keep} should be tried");
        }
    }

    #[test]
    fn fa_cdn_hosts_and_file_urls() {
        let old = Url::parse("https://d.facdn.net/art/brachiaraidos/1493502559/1493502559.brachiaraidos_forge1.jpg").unwrap();
        assert_eq!(fa_cdn_twin(&old).unwrap().host_str(), Some("d.furaffinity.net"));
        assert_eq!(fa_cdn_twin(&fa_cdn_twin(&old).unwrap()).unwrap(), old);
        assert_eq!(
            media(old.as_str(), "jpg"),
            [
                "https://d.furaffinity.net/art/brachiaraidos/1493502559/1493502559.brachiaraidos_forge1.jpg",
                "https://d.facdn.net/art/brachiaraidos/1493502559/1493502559.brachiaraidos_forge1.jpg",
            ]
        );
        assert!(looks_like_file(old.as_str()));
        assert!(!looks_like_file("https://www.furaffinity.net/view/23368042/"));
        let deleted = "<div>System Error</div><p>The submission you are trying to find is not in our database.</p>";
        let base = Url::parse("https://www.furaffinity.net/view/23368042/").unwrap();
        assert!(parse_furaffinity(deleted, &base).unwrap_err().starts_with("deleted from Fur Affinity"));
    }

    #[test]
    fn groups_sources_by_host_in_order() {
        let s: Vec<String> =
            ["https://a.com/1", "https://www.b.com/1", "https://a.com/2"].iter().map(|x| x.to_string()).collect();
        let g = group_by_host(&s);
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].iter().map(|(i, _)| *i).collect::<Vec<_>>(), [0, 2]);
        assert_eq!(g[1][0].0, 1);
    }
}
