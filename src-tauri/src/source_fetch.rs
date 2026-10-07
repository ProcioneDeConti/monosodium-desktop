use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use md5::{Digest, Md5};
use reqwest::header::{ACCEPT, CONTENT_TYPE, COOKIE, REFERER};
use reqwest::{Client, Response, Url};
use tauri::ipc::Channel;

/// Cap on a recovered image's size - it travels to the webview as a base64 `data:` URL.
const MAX_IMAGE_BYTES: usize = 40 * 1024 * 1024;
/// Cap on how much of an HTML page is read while looking for `og:image` (the tags live in `<head>`).
const MAX_HTML_BYTES: usize = 2 * 1024 * 1024;

/// Dev-build-only trace of the recovery steps (visible in the `tauri dev` terminal).
fn trace(msg: impl AsRef<str>) {
    if cfg!(debug_assertions) {
        eprintln!("[recover] {}", msg.as_ref());
    }
}

#[derive(serde::Serialize)]
pub struct RecoveredImage {
    /// `data:` URL of the image bytes, so the webview needs no hotlink-sensitive request.
    pub data_url: String,
    /// The source URL (from the post's `sources`) that this image was recovered through.
    pub source_url: String,
    /// The URL the bytes were actually fetched from (differs from `source_url` when it was an
    /// `og:image` found on a page).
    pub image_url: String,
    /// Content type the server reported for the image, and its size in bytes (for diagnostics when
    /// the webview can't display it).
    pub mime: String,
    pub size_bytes: usize,
    /// True when the image came from a Wayback Machine snapshot of the source rather than the live site.
    pub via_archive: bool,
    /// How closely this matches the deleted post's own file (see `Grade`), judged against the
    /// md5/size/dimensions/format e621 keeps for the post.
    pub grade: Grade,
    pub md5_match: bool,
    /// Pixel dimensions of the recovered file, and the original's (0 when e621 didn't report them).
    pub width: i64,
    pub height: i64,
    pub expected_width: i64,
    pub expected_height: i64,
    pub expected_size: i64,
    /// Human-readable differences from the original ("png instead of jpg", "smaller file", ...).
    pub notes: Vec<String>,
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

/// How close a recovered file is to the original, best first.
#[derive(serde::Serialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Grade {
    /// Different shape from the original (cropped, a different image of the set, or a placeholder).
    Mismatch,
    /// Same picture at another resolution (a preview, or a larger re-host).
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
        "image/jpeg" | "image/jpg" | "image/pjpeg" => "jpg",
        "image/png" | "image/apng" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/avif" => "avif",
        _ => "",
    }
}

/// A fetched file, graded against the original.
struct Candidate {
    image: RecoveredImage,
    /// Orders candidates: grade first, then format match, then how near the byte size is.
    score: i64,
}

/// Compares fetched bytes with what e621 kept about the post. `None` when the bytes aren't an
/// image the viewer can show at all (an HTML error page served as `image/png`, an SVG, ...).
fn score_candidate(
    expected: &Expected,
    source: &str,
    mime: &str,
    bytes: &[u8],
    image_url: &Url,
    via_archive: bool,
) -> Option<Candidate> {
    let dims = imagesize::blob_size(bytes).ok()?;
    let (w, h) = (dims.width as i64, dims.height as i64);
    let mut notes = Vec::new();

    let digest = Md5::digest(bytes);
    let got_md5: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    let md5_match = expected.md5.as_deref().is_some_and(|m| m.trim().eq_ignore_ascii_case(&got_md5));

    let want_ext = normalize_ext(&expected.ext);
    let got_ext = ext_for_mime(mime);
    let ext_match = want_ext.is_empty() || want_ext == got_ext;
    if !ext_match {
        notes.push(format!("{} instead of {}", if got_ext.is_empty() { mime } else { got_ext }, want_ext));
    }

    let have_dims = expected.width > 0 && expected.height > 0;
    let same_dims = have_dims && w == expected.width && h == expected.height;
    let size_ratio = if expected.size > 0 { bytes.len() as f64 / expected.size as f64 } else { 1.0 };

    let grade = if md5_match {
        Grade::Exact
    } else if same_dims || !have_dims {
        Grade::SameDimensions
    } else {
        let aspect_off = ((w as f64 / h as f64) / (expected.width as f64 / expected.height as f64) - 1.0).abs();
        if aspect_off <= 0.015 { Grade::Rescaled } else { Grade::Mismatch }
    };

    if !md5_match {
        if have_dims && !same_dims {
            notes.push(format!("{w}x{h} instead of {}x{}", expected.width, expected.height));
        }
        if expected.size > 0 && (size_ratio < 0.9 || size_ratio > 1.1) {
            notes.push(if size_ratio < 1.0 { "smaller file than the original".into() } else { "larger file than the original".into() });
        }
    }
    if grade == Grade::Mismatch {
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

    Some(Candidate {
        image: RecoveredImage {
            data_url: format!("data:{mime};base64,{}", BASE64.encode(bytes)),
            source_url: source.to_string(),
            image_url: image_url.to_string(),
            mime: mime.to_string(),
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
        },
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
async fn read_capped(mut response: Response, limit: usize) -> Result<Vec<u8>, String> {
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
fn session_cookie_for(url: &Url) -> Option<String> {
    match url.host_str()? {
        "www.furaffinity.net" | "furaffinity.net" => crate::credentials::source_cookie("furaffinity.net"),
        _ => None,
    }
}

async fn get(client: &Client, url: &Url) -> Result<Response, String> {
    let referer = referer_for(url);
    let started = std::time::Instant::now();
    trace(format!("GET {url}"));
    let mut request = client
        .get(url.clone())
        .header(REFERER, referer)
        .header(ACCEPT, "image/*,text/html;q=0.8,*/*;q=0.5");
    // A saved site session (Settings > Source logins) goes only to that site's own pages. reqwest
    // drops a manually-set Cookie header on a cross-origin redirect, so it can't follow one away.
    if let Some(cookie) = session_cookie_for(url) {
        request = request.header(COOKIE, cookie);
    }
    let response = request
        .send()
        .await
        .map_err(|e| {
            trace(format!("  request failed after {:?}: {e}", started.elapsed()));
            e.to_string()
        })?;
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

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
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

/// First `og:image` / `twitter:image` URL declared in the page's `<meta>` tags, resolved against
/// the page URL. `og:image` wins over the Twitter-card tag when both exist.
fn find_meta_image(html: &str, base: &Url) -> Option<Url> {
    let lower = html.to_ascii_lowercase();
    let mut og = None;
    let mut twitter = None;
    let mut from = 0;
    while let Some(pos) = lower[from..].find("<meta") {
        let start = from + pos;
        let end = lower[start..].find('>').map_or(lower.len(), |e| start + e);
        let tag = &html[start..end];
        from = end.max(start + 5);

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

async fn fetch_image(client: &Client, url: &Url) -> Result<(String, Vec<u8>), String> {
    let response = get(client, url).await?;
    let ct = content_type(&response);
    if !ct.starts_with("image/") {
        return Err(format!("not an image ({})", if ct.is_empty() { "unknown type" } else { &ct }));
    }
    Ok((ct, read_capped(response, MAX_IMAGE_BYTES).await?))
}

async fn get_json(
    client: &Client,
    url: &str,
    query: &[(&str, &str)],
    referer: Option<&str>,
) -> Result<serde_json::Value, String> {
    let mut req = client.get(url).query(query);
    if let Some(r) = referer {
        req = req.header(REFERER, r);
    }
    let response = req.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    response.json().await.map_err(|e| e.to_string())
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

/// X/Twitter via the public embed ("syndication") endpoint - no login needed for public tweets.
async fn resolve_twitter(client: &Client, url: &Url, expected: &Expected) -> Result<Vec<Url>, String> {
    let seg = path_segments(url);
    let at = seg.iter().position(|p| *p == "status").ok_or("not a tweet URL")?;
    let id = seg.get(at + 1).filter(|i| i.chars().all(|c| c.is_ascii_digit())).ok_or("no tweet id")?;
    let photo_index = match (seg.get(at + 2), seg.get(at + 3)) {
        (Some(&"photo"), Some(n)) => n.parse::<usize>().unwrap_or(1).saturating_sub(1),
        _ => 0,
    };

    let json = get_json(
        client,
        "https://cdn.syndication.twimg.com/tweet-result",
        &[("id", id), ("token", &twitter_token(id))],
        None,
    )
    .await
    .map_err(|e| format!("tweet lookup failed ({e})"))?;

    let urls: Vec<&str> = json
        .get("mediaDetails")
        .and_then(|m| m.as_array())
        .map(|a| a.iter().filter_map(|m| m.get("media_url_https")?.as_str()).collect())
        .filter(|v: &Vec<&str>| !v.is_empty())
        .or_else(|| {
            json.get("photos")
                .and_then(|p| p.as_array())
                .map(|a| a.iter().filter_map(|p| p.get("url")?.as_str()).collect())
        })
        .unwrap_or_default();
    if urls.is_empty() {
        return Err("tweet has no media (or it was removed)".into());
    }
    // The photo the URL points at goes first, then the tweet's other images (the deleted post may
    // be any of them; grading picks the one that matches). `name=orig` asks pbs.twimg.com for the
    // original-resolution file; when the original's format differs from the post's, also ask for
    // that format explicitly (the embed often reports `.png` for what was uploaded as a jpg).
    let first = photo_index.min(urls.len() - 1);
    let ordered = std::iter::once(urls[first]).chain(urls.iter().enumerate().filter(|(i, _)| *i != first).map(|(_, u)| *u));
    let want = normalize_ext(&expected.ext);
    let mut out = Vec::new();
    for media in ordered {
        if let Ok(u) = Url::parse(&format!("{media}?name=orig")) {
            out.push(u);
        }
        let (stem, ext) = media.rsplit_once('.').unwrap_or((media, ""));
        if !want.is_empty() && normalize_ext(ext) != want {
            if let Ok(u) = Url::parse(&format!("{stem}?format={want}&name=orig")) {
                out.push(u);
            }
        }
    }
    Ok(out)
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
    Ok(found.iter().filter_map(|u| Url::parse(u).ok()).collect())
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

/// HentaiVox reader pages (`/view/<gallery>/<page>`) declare no meta image at all; the page image
/// is the one `<img class="js-main-img">`.
async fn resolve_hentaivox(client: &Client, url: &Url) -> Result<Vec<Url>, String> {
    let response = get(client, url).await?;
    let html = String::from_utf8_lossy(&read_capped(response, MAX_HTML_BYTES).await?).into_owned();
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(pos) = lower[from..].find("<img") {
        let start = from + pos;
        let end = lower[start..].find('>').map_or(lower.len(), |e| start + e);
        let tag = &html[start..end];
        from = end.max(start + 4);
        let is_main = attr(tag, "class").is_some_and(|c| c.split_whitespace().any(|c| c == "js-main-img"));
        if is_main {
            let src = attr(tag, "src").ok_or("main image has no src")?;
            return url.join(src.trim()).map(|u| vec![u]).map_err(|e| e.to_string());
        }
    }
    Err("no reader image on the page".into())
}

/// Marks a resolver failure that is final: the page is login-gated, so scraping it generically
/// would only turn up the site's own logo/placeholder. `recover_one` stops at these.
const LOGIN_REQUIRED: &str = "login required";

/// Fur Affinity submission pages (`/view/<id>`). Logged-out visitors get a "System Message" page
/// for Mature/Adult work - whose `og:image` is just the FA logo - so that case is reported rather
/// than scraped. On a public submission the full-size file is the `submissionImg`'s
/// `data-fullview-src` (the `og:image` is only a 600px thumbnail).
async fn resolve_furaffinity(client: &Client, url: &Url) -> Result<Vec<Url>, String> {
    let response = get(client, url).await?;
    let html = String::from_utf8_lossy(&read_capped(response, MAX_HTML_BYTES).await?).into_owned();
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(pos) = lower[from..].find("<img") {
        let start = from + pos;
        let end = lower[start..].find('>').map_or(lower.len(), |e| start + e);
        let tag = &html[start..end];
        from = end.max(start + 4);
        if attr(tag, "id").as_deref() == Some("submissionImg") {
            let src = attr(tag, "data-fullview-src")
                .or_else(|| attr(tag, "src"))
                .ok_or("submission image has no src")?;
            return url.join(src.trim()).map(|u| vec![u]).map_err(|e| e.to_string());
        }
    }
    if lower.contains("you must log in") {
        Err(format!(
            "{LOGIN_REQUIRED}: Fur Affinity only shows this Mature/Adult submission to signed-in users - sign in under Settings > Source logins, with Mature/Adult content enabled on your FA account"
        ))
    } else {
        Err("no submission image on the page (removed or disabled?)".into())
    }
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
        "hentaivox.com" => Some(resolve_hentaivox(client, url).await),
        "furaffinity.net" => Some(resolve_furaffinity(client, url).await),
        _ => None,
    }
}

/// Where a source's image(s) were found: bytes already in hand (the source URL was itself an
/// image), or URLs still to be fetched (a site lookup's results, or a page's `og:image`).
enum Found {
    Image { mime: String, bytes: Vec<u8>, url: Url },
    Urls(Vec<Url>),
}

/// The URL itself is an image, or an HTML page whose `og:image` / `twitter:image` is.
async fn find_generic(client: &Client, url: &Url) -> Result<Found, String> {
    let response = get(client, url).await?;
    let ct = content_type(&response);
    if ct.starts_with("image/") {
        let bytes = read_capped(response, MAX_IMAGE_BYTES).await?;
        Ok(Found::Image { mime: ct, bytes, url: url.clone() })
    } else if ct == "text/html" || ct == "application/xhtml+xml" {
        let html = String::from_utf8_lossy(&read_capped(response, MAX_HTML_BYTES).await?).into_owned();
        let image_url = find_meta_image(&html, url).ok_or("no og:image on the page")?;
        Ok(Found::Urls(vec![image_url]))
    } else {
        Err(format!("unsupported content ({ct})"))
    }
}

async fn find_images(client: &Client, source: &str, expected: &Expected) -> Result<Found, String> {
    let url = Url::parse(source.trim()).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("unsupported scheme".into());
    }

    let mut site_error = None;
    match resolve_site_image(client, &url, expected).await {
        Some(Ok(urls)) => return Ok(Found::Urls(urls)),
        Some(Err(e)) if e.starts_with(LOGIN_REQUIRED) => return Err(e),
        Some(Err(e)) => site_error = Some(e),
        None => {}
    }

    find_generic(client, &url).await.map_err(|e| match site_error {
        Some(site) => format!("{site}; page scrape: {e}"),
        None => e,
    })
}

/// How many images from one source (a tweet or a multi-page work) get downloaded and compared.
const MAX_CANDIDATES_PER_SOURCE: usize = 8;

fn is_exact(expected: &Expected, bytes: &[u8]) -> bool {
    let Some(want) = expected.md5.as_deref() else { return false };
    let got: String = Md5::digest(bytes).iter().map(|b| format!("{b:02x}")).collect();
    want.trim().eq_ignore_ascii_case(&got)
}

/// Fetches each of `found`'s images and grades it, keeping `best` up to date. Returns true as soon
/// as an exact (md5) match turns up, since nothing can beat it.
async fn evaluate(
    client: &Client,
    ch: &Channel<RecoverProgress>,
    source: &str,
    found: Found,
    expected: &Expected,
    via_archive: bool,
    best: &mut Option<Candidate>,
) -> bool {
    let mut fetched: Vec<(String, Vec<u8>, Url)> = Vec::new();
    match found {
        Found::Image { mime, bytes, url } => fetched.push((mime, bytes, url)),
        Found::Urls(urls) => {
            let total = urls.len().min(MAX_CANDIDATES_PER_SOURCE);
            for (i, url) in urls.into_iter().take(MAX_CANDIDATES_PER_SOURCE).enumerate() {
                progress(
                    ch,
                    "downloading",
                    if total > 1 {
                        format!("Downloading image {} of {total} from {}", i + 1, host_of(&url))
                    } else {
                        format!("Downloading image from {}", host_of(&url))
                    },
                );
                match fetch_image(client, &url).await {
                    Ok((mime, bytes)) => {
                        // An exact match makes the remaining downloads pointless.
                        let exact = is_exact(expected, &bytes);
                        fetched.push((mime, bytes, url));
                        if exact {
                            break;
                        }
                    }
                    Err(e) => trace(format!("  candidate download failed: {e}")),
                }
            }
        }
    }

    for (mime, bytes, url) in fetched {
        progress(ch, "comparing", format!("Comparing {} to the original", host_of(&url)));
        match score_candidate(expected, source, &mime, &bytes, &url, via_archive) {
            Some(candidate) => {
                progress(
                    ch,
                    "scored",
                    format!(
                        "Scored {}x{} {} from {}: {}",
                        candidate.image.width,
                        candidate.image.height,
                        candidate.image.mime.trim_start_matches("image/"),
                        host_of(&url),
                        grade_label(candidate.image.grade)
                    ),
                );
                let exact = candidate.image.grade == Grade::Exact;
                if best.as_ref().map_or(true, |b| candidate.score > b.score) {
                    *best = Some(candidate);
                }
                if exact {
                    return true;
                }
            }
            None => progress(ch, "scored", format!("Skipped a file from {} that isn't a usable image", host_of(&url))),
        }
    }
    false
}

/// Timestamp of the Wayback Machine's closest snapshot of `url`, if the availability API has one.
async fn wayback_snapshot(client: &Client, url: &str) -> Option<String> {
    let json = get_json(client, "https://archive.org/wayback/available", &[("url", url)], None)
        .await
        .ok()?;
    let closest = json.pointer("/archived_snapshots/closest")?;
    if closest.get("available")?.as_bool()? {
        Some(closest.get("timestamp")?.as_str()?.to_string())
    } else {
        None
    }
}

/// Looks `url` up in the Wayback Machine and returns what its raw capture (`<ts>id_`, which is
/// the original bytes without the archive's page rewriting or toolbar) holds: the image itself,
/// or - for a page - the image its `og:image` points at, also fetched raw from the archive.
async fn find_archived(client: &Client, url: &str) -> Result<Found, String> {
    let ts = wayback_snapshot(client, url).await.ok_or("no Wayback snapshot")?;
    let raw = Url::parse(&format!("https://web.archive.org/web/{ts}id_/{url}")).map_err(|e| e.to_string())?;
    let page_url = Url::parse(url).map_err(|e| e.to_string())?;
    match find_generic(client, &raw).await? {
        Found::Image { mime, bytes, .. } => Ok(Found::Image { mime, bytes, url: raw }),
        Found::Urls(images) => {
            // The raw page's og:image resolved against the archive URL; re-resolve it against the
            // original page, then ask the archive for its raw copy of that image.
            let archived: Vec<Url> = images
                .iter()
                .filter_map(|u| {
                    let s = u.as_str();
                    let original = page_url.join(s.rsplit_once("id_/").map_or(s, |(_, o)| o)).ok()?;
                    Url::parse(&format!("https://web.archive.org/web/{ts}id_/{original}")).ok()
                })
                .collect();
            if archived.is_empty() { Err("no archived image".into()) } else { Ok(Found::Urls(archived)) }
        }
    }
}

/// Tries each of a deleted post's `sources` and returns the candidate that best matches the
/// post's original file. e621 keeps a deleted post's md5, byte size, dimensions and format, so
/// every downloaded image is graded against them (see `Grade`); an md5 match ends the search
/// immediately, otherwise the best-scoring image across all sources wins. Site-specific lookups
/// (X, Bluesky, Pixiv, DeviantArt, FA) return every image of a multi-image source so the right
/// one can be picked. When no live source reaches `SameDimensions`, the Wayback Machine's raw
/// captures of the sources - and of e621's own CDN path for the md5 - are tried too. Fetched here
/// (not in the webview) so hotlink/CORS rules don't apply, and not through api.rs's `request()` -
/// these are third-party hosts, not the e621 API. Status lines stream over `on_progress`.
#[tauri::command]
pub async fn recover_from_sources(
    sources: Vec<String>,
    expected: Expected,
    on_progress: Channel<RecoverProgress>,
) -> Result<RecoveredImage, String> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .user_agent(format!(
            "MonosodiumDesktop/{} (source recovery for deleted e621 posts)",
            env!("CARGO_PKG_VERSION")
        ))
        .build()
        .map_err(|e| e.to_string())?;

    let web_sources: Vec<&String> =
        sources.iter().filter(|s| s.starts_with("http://") || s.starts_with("https://")).collect();
    let mut failures = Vec::new();
    let mut best: Option<Candidate> = None;
    let mut done = false;

    let total = web_sources.len();
    for (i, source) in web_sources.iter().enumerate() {
        let host = Url::parse(source).map(|u| host_of(&u)).unwrap_or_else(|_| source.to_string());
        progress(&on_progress, "fetching", format!("Fetching post from {host} (source {} of {total})", i + 1));
        match find_images(&client, source, &expected).await {
            Ok(found) => {
                if evaluate(&client, &on_progress, source, found, &expected, false, &mut best).await {
                    done = true;
                    break;
                }
            }
            Err(e) => {
                trace(format!("source failed: {source}: {e}"));
                progress(&on_progress, "failed", format!("{host}: {}", e.lines().next().unwrap_or("failed")));
                failures.push(format!("{source}: {e}"));
            }
        }
    }

    let good_enough = |best: &Option<Candidate>| best.as_ref().is_some_and(|b| b.image.grade >= Grade::SameDimensions);

    if !done && !good_enough(&best) {
        // Archived raw copies: each source, then e621's own CDN file for the md5.
        let mut archive_targets: Vec<String> = web_sources.iter().map(|s| s.to_string()).collect();
        if let Some(md5) = expected.md5.as_deref().filter(|m| m.len() >= 4 && m.is_ascii()) {
            let ext = normalize_ext(&expected.ext);
            let ext = if ext.is_empty() { "jpg".to_string() } else { ext };
            archive_targets.push(format!("https://static1.e621.net/data/{}/{}/{md5}.{ext}", &md5[0..2], &md5[2..4]));
        }
        for target in &archive_targets {
            progress(&on_progress, "archive", "Checking the Wayback Machine for an archived copy");
            match find_archived(&client, target).await {
                Ok(found) => {
                    if evaluate(&client, &on_progress, target, found, &expected, true, &mut best).await {
                        break;
                    }
                }
                Err(e) => failures.push(format!("{target} (Wayback): {e}")),
            }
            if good_enough(&best) {
                break;
            }
        }
    }

    match best {
        Some(candidate) => {
            progress(
                &on_progress,
                "done",
                format!("Best match: {} (score {})", grade_label(candidate.image.grade), candidate.score),
            );
            Ok(candidate.image)
        }
        None if failures.is_empty() => Err("This post has no web sources to try.".into()),
        None => Err(format!("No source yielded an image.\n{}", failures.join("\n"))),
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

    fn grade(expected: &Expected, mime: &str, bytes: &[u8]) -> Option<Grade> {
        let url = Url::parse("https://example.com/x").unwrap();
        score_candidate(expected, "https://example.com/", mime, bytes, &url, false).map(|c| c.image.grade)
    }

    fn expected_for(bytes: &[u8], w: i64, h: i64) -> Expected {
        let md5: String = Md5::digest(bytes).iter().map(|b| format!("{b:02x}")).collect();
        Expected { md5: Some(md5), size: bytes.len() as i64, width: w, height: h, ext: "png".into() }
    }

    #[test]
    fn grades_against_the_original() {
        let original = png(1500, 2000);
        let expected = expected_for(&original, 1500, 2000);
        assert_eq!(grade(&expected, "image/png", &original), Some(Grade::Exact));
        // Same dimensions, different bytes.
        let mut reencoded = png(1500, 2000);
        reencoded.push(0);
        assert_eq!(grade(&expected, "image/png", &reencoded), Some(Grade::SameDimensions));
        // A 3:4 preview of a 3:4 original.
        assert_eq!(grade(&expected, "image/png", &png(600, 800)), Some(Grade::Rescaled));
        // A different shape (e.g. a square crop or a logo).
        assert_eq!(grade(&expected, "image/png", &png(500, 500)), Some(Grade::Mismatch));
        // Not an image at all.
        assert_eq!(grade(&expected, "image/png", b"<html>nope</html>"), None);
    }

    #[test]
    fn better_grade_always_outranks_closer_size() {
        let original = png(1500, 2000);
        let expected = expected_for(&original, 1500, 2000);
        let url = Url::parse("https://example.com/x").unwrap();
        let score = |bytes: &[u8]| score_candidate(&expected, "s", "image/png", bytes, &url, false).unwrap().score;
        assert!(score(&png(1500, 2000)) > score(&png(600, 800)));
        assert!(score(&png(600, 800)) > score(&png(500, 500)));
    }
}
