use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::header::{ACCEPT, CONTENT_TYPE, COOKIE, REFERER};
use reqwest::{Client, Response, Url};

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
async fn resolve_twitter(client: &Client, url: &Url) -> Result<Url, String> {
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
    let chosen = urls.get(photo_index).or(urls.first()).ok_or("tweet has no media (or it was removed)")?;
    // `name=orig` asks pbs.twimg.com for the original-resolution file.
    Url::parse(&format!("{chosen}?name=orig")).map_err(|e| e.to_string())
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
async fn resolve_bluesky(client: &Client, url: &Url) -> Result<Url, String> {
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
    let first = found.first().ok_or("post has no images")?;
    Url::parse(first).map_err(|e| e.to_string())
}

/// Pixiv: the public per-illustration pages endpoint (works for non-R18 works without a login).
async fn resolve_pixiv(client: &Client, url: &Url) -> Result<Url, String> {
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
    let original = json
        .pointer("/body/0/urls/original")
        .and_then(|u| u.as_str())
        .ok_or("artwork has no pages")?;
    Url::parse(original).map_err(|e| e.to_string())
}

/// DeviantArt via its oEmbed endpoint.
async fn resolve_deviantart(client: &Client, url: &Url) -> Result<Url, String> {
    let json = get_json(client, "https://backend.deviantart.com/oembed", &[("url", url.as_str())], None)
        .await
        .map_err(|e| format!("oEmbed lookup failed ({e})"))?;
    let photo = (json.get("type").and_then(|t| t.as_str()) == Some("photo"))
        .then(|| json.get("url").and_then(|u| u.as_str()))
        .flatten();
    let chosen = photo
        .or_else(|| json.get("thumbnail_url").and_then(|u| u.as_str()))
        .ok_or("oEmbed returned no image")?;
    Url::parse(chosen).map_err(|e| e.to_string())
}

/// HentaiVox reader pages (`/view/<gallery>/<page>`) declare no meta image at all; the page image
/// is the one `<img class="js-main-img">`.
async fn resolve_hentaivox(client: &Client, url: &Url) -> Result<Url, String> {
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
            return url.join(src.trim()).map_err(|e| e.to_string());
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
async fn resolve_furaffinity(client: &Client, url: &Url) -> Result<Url, String> {
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
            return url.join(src.trim()).map_err(|e| e.to_string());
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
async fn resolve_site_image(client: &Client, url: &Url) -> Option<Result<Url, String>> {
    let host = url.host_str()?.to_ascii_lowercase();
    match host.trim_start_matches("www.").trim_start_matches("mobile.") {
        "twitter.com" | "x.com" | "fxtwitter.com" | "vxtwitter.com" | "fixupx.com" => {
            Some(resolve_twitter(client, url).await)
        }
        "bsky.app" => Some(resolve_bluesky(client, url).await),
        "pixiv.net" => Some(resolve_pixiv(client, url).await),
        "deviantart.com" | "fav.me" => Some(resolve_deviantart(client, url).await),
        "hentaivox.com" => Some(resolve_hentaivox(client, url).await),
        "furaffinity.net" => Some(resolve_furaffinity(client, url).await),
        _ => None,
    }
}

fn recovered(source: &str, mime: &str, bytes: &[u8], image_url: &Url) -> RecoveredImage {
    RecoveredImage {
        data_url: format!("data:{mime};base64,{}", BASE64.encode(bytes)),
        source_url: source.to_string(),
        image_url: image_url.to_string(),
        mime: mime.to_string(),
        size_bytes: bytes.len(),
        via_archive: false,
    }
}

/// The URL itself is an image, or an HTML page whose `og:image` / `twitter:image` is.
async fn recover_generic(client: &Client, source: &str, url: &Url) -> Result<RecoveredImage, String> {
    let response = get(client, url).await?;
    let ct = content_type(&response);
    if ct.starts_with("image/") {
        let bytes = read_capped(response, MAX_IMAGE_BYTES).await?;
        Ok(recovered(source, &ct, &bytes, url))
    } else if ct == "text/html" || ct == "application/xhtml+xml" {
        let html = String::from_utf8_lossy(&read_capped(response, MAX_HTML_BYTES).await?).into_owned();
        let image_url = find_meta_image(&html, url).ok_or("no og:image on the page")?;
        let (mime, bytes) = fetch_image(client, &image_url).await?;
        Ok(recovered(source, &mime, &bytes, &image_url))
    } else {
        Err(format!("unsupported content ({ct})"))
    }
}

async fn recover_one(client: &Client, source: &str) -> Result<RecoveredImage, String> {
    let url = Url::parse(source.trim()).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("unsupported scheme".into());
    }

    let mut site_error = None;
    match resolve_site_image(client, &url).await {
        Some(Ok(image_url)) => match fetch_image(client, &image_url).await {
            Ok((mime, bytes)) => return Ok(recovered(source, &mime, &bytes, &image_url)),
            Err(e) => site_error = Some(e),
        },
        Some(Err(e)) if e.starts_with(LOGIN_REQUIRED) => return Err(e),
        Some(Err(e)) => site_error = Some(e),
        None => {}
    }

    recover_generic(client, source, &url).await.map_err(|e| match site_error {
        Some(site) => format!("{site}; page scrape: {e}"),
        None => e,
    })
}

/// Closest Wayback Machine snapshot of `source`, if the availability API knows one.
async fn wayback_snapshot(client: &Client, source: &str) -> Option<String> {
    let json = get_json(client, "https://archive.org/wayback/available", &[("url", source)], None)
        .await
        .ok()?;
    let closest = json.pointer("/archived_snapshots/closest")?;
    if closest.get("available")?.as_bool()? {
        Some(closest.get("url")?.as_str()?.replacen("http://", "https://", 1))
    } else {
        None
    }
}

/// Tries each of a deleted post's `sources` in order and returns the first one that yields an
/// image: a site-specific lookup (X, Bluesky, Pixiv, DeviantArt), the URL itself serving an
/// `image/*`, or an HTML page's `og:image` / `twitter:image`. If every live source fails, falls
/// back to Wayback Machine snapshots. Fetched here (not in the webview) so hotlink/CORS rules don't apply, and
/// not through api.rs's `request()` - these are third-party hosts, not the e621 API.
#[tauri::command]
pub async fn recover_from_sources(sources: Vec<String>) -> Result<RecoveredImage, String> {
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
    for source in &web_sources {
        match recover_one(&client, source).await {
            Ok(found) => {
                trace(format!("recovered via {} ({}, {}, {} bytes)", found.source_url, found.image_url, found.mime, found.size_bytes));
                return Ok(found);
            }
            Err(e) => {
                trace(format!("source failed: {source}: {e}"));
                failures.push(format!("{source}: {e}"))
            }
        }
    }

    // Last resort for dead links: the Wayback Machine's copy of each source.
    for source in &web_sources {
        let Some(snapshot) = wayback_snapshot(&client, source).await else { continue };
        match recover_one(&client, &snapshot).await {
            Ok(mut found) => {
                found.source_url = source.to_string();
                found.via_archive = true;
                return Ok(found);
            }
            Err(e) => failures.push(format!("{source} (Wayback snapshot): {e}")),
        }
    }

    if failures.is_empty() {
        Err("This post has no web sources to try.".into())
    } else {
        Err(format!("No source yielded an image.\n{}", failures.join("\n")))
    }
}
