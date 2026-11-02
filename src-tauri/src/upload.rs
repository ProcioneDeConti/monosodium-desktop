//! e621 uploader backend: file inspection (MD5, type, dimensions), the pre-flight lookups the
//! upload checklist runs (MD5 duplicate, IQDB similarity, tag preview, DNP), and the upload itself.
//!
//! Every e621 call goes through `api::request()` (rate limiter, User-Agent, Basic Auth). The only
//! non-e621 traffic is `upload_fetch_url`, which pulls a direct-URL upload down locally through
//! `source_fetch`'s SSRF-guarded client so the same MD5/IQDB checks can run on it.
//!
//! e621 only, by design: every command rejects other sites.

use std::io::Read;
use std::time::Duration;

use md5::{Digest, Md5};
use reqwest::Method;
use serde::{Deserialize, Serialize};

use crate::api::{ensure_success, error_chain, request, AppState, SendRetry};
use crate::models::{DnpEntry, Post, PostsResponse};
use crate::site::Site;

/// e621's per-file cap (all types). Mirrored in `src/lib/uploadChecks.ts`.
pub const MAX_UPLOAD_BYTES: u64 = 100 * 1024 * 1024;

fn require_e621(site: Site) -> Result<(), String> {
    if site == Site::E621 {
        Ok(())
    } else {
        Err("Uploading is only supported on e621".into())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UploadFileInfo {
    pub path: String,
    pub md5: String,
    pub size: u64,
    /// Detected from the file's own header bytes, not its name: jpg/png/gif/webp/webm/mp4, or
    /// empty when it's none of the types e621 accepts.
    pub ext: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Sniffs the container format from magic bytes.
fn sniff_ext(head: &[u8]) -> &'static str {
    if head.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if head.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if head.starts_with(b"GIF8") {
        "gif"
    } else if head.len() >= 12 && &head[0..4] == b"RIFF" && &head[8..12] == b"WEBP" {
        "webp"
    } else if head.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        "webm"
    } else if head.len() >= 8 && &head[4..8] == b"ftyp" {
        "mp4"
    } else {
        ""
    }
}

fn inspect(path: &std::path::Path) -> Result<UploadFileInfo, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("can't open file: {e}"))?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let mut hasher = Md5::new();
    let mut head = Vec::with_capacity(64);
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        if head.len() < 64 {
            let take = (64 - head.len()).min(n);
            head.extend_from_slice(&buf[..take]);
        }
        hasher.update(&buf[..n]);
    }
    let md5: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    let ext = sniff_ext(&head).to_string();
    let (width, height) = match ext.as_str() {
        "jpg" | "png" | "gif" | "webp" => match imagesize::size(path) {
            Ok(d) => (Some(d.width as u32), Some(d.height as u32)),
            Err(_) => (None, None),
        },
        // Video dimensions come from the frontend's <video> metadata.
        _ => (None, None),
    };
    Ok(UploadFileInfo { path: path.to_string_lossy().into_owned(), md5, size, ext, width, height })
}

/// Hashes and identifies a local file picked for upload.
#[tauri::command]
pub async fn upload_inspect_file(path: String) -> Result<UploadFileInfo, String> {
    tokio::task::spawn_blocking(move || inspect(std::path::Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

/// Downloads a direct-URL upload to a temp file (SSRF-guarded, capped at e621's size limit) and
/// inspects it. The actual upload still sends `direct_url` so e621 fetches it itself; this copy
/// only feeds the duplicate checks and the preview.
#[tauri::command]
pub async fn upload_fetch_url(url: String) -> Result<UploadFileInfo, String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|_| "That isn't a valid URL".to_string())?;
    let client = crate::source_fetch::public_client(Duration::from_secs(120), "upload pre-check fetch")?;
    let response = crate::source_fetch::get(&client, &parsed).await?;
    let bytes = crate::source_fetch::read_capped(response, MAX_UPLOAD_BYTES as usize)
        .await
        .map_err(|e| if e == "response too large" { "File is over e621's 100 MB limit".into() } else { e })?;
    let digest: String = Md5::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();
    let ext = sniff_ext(&bytes[..bytes.len().min(64)]);
    let dir = std::env::temp_dir().join("monosodium-upload");
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let path = dir.join(if ext.is_empty() { digest.clone() } else { format!("{digest}.{ext}") });
    tokio::fs::write(&path, &bytes).await.map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || inspect(&path)).await.map_err(|e| e.to_string())?
}

/// A data URL for previewing a picked image in the panel (the webview can't read local paths -
/// no asset protocol). `None` for videos and very large images; the panel shows a placeholder.
#[tauri::command]
pub async fn upload_preview(path: String) -> Result<Option<String>, String> {
    use base64::Engine;
    const MAX_PREVIEW_BYTES: u64 = 40 * 1024 * 1024;
    let meta = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?;
    if meta.len() > MAX_PREVIEW_BYTES {
        return Ok(None);
    }
    let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
    let mime = match sniff_ext(&bytes[..bytes.len().min(64)]) {
        "jpg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return Ok(None),
    };
    Ok(Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(&bytes))))
}

/// The existing post with this MD5, if any (including deleted ones, which e621 also rejects).
#[tauri::command]
pub async fn upload_md5_lookup(
    state: tauri::State<'_, AppState>,
    site: Site,
    md5: String,
) -> Result<Option<Post>, String> {
    require_e621(site)?;
    let tags = format!("md5:{} status:any", md5.trim().to_ascii_lowercase());
    let response = request(&state, site, Method::GET, "posts.json")
        .await?
        .query(&[("tags", tags.as_str()), ("limit", "1")])
        .send_retry(&state, site)
        .await
        .map_err(|e| error_chain(&e))?;
    let body = ensure_success(response).await?.bytes().await.map_err(|e| error_chain(&e))?;
    let parsed: PostsResponse = serde_json::from_slice(&body).map_err(|e| format!("bad posts JSON: {e}"))?;
    Ok(parsed.posts.into_iter().next())
}

#[derive(Debug, Clone, Serialize)]
pub struct IqdbMatch {
    pub post_id: i64,
    pub score: f64,
    pub preview_url: Option<String>,
    pub rating: Option<String>,
}

/// Pulls a thumbnail URL out of either post serialization IQDB may return (the nested
/// `preview.url` blueprint shape or the flat legacy `preview_file_url`).
fn iqdb_preview(post: &serde_json::Value) -> Option<String> {
    post.pointer("/preview/url")
        .or_else(|| post.get("preview_file_url"))
        .or_else(|| post.get("preview_url"))
        .and_then(|v| v.as_str())
        .map(str::to_owned)
}

/// Visually similar existing posts (e621's IQDB, default score cutoff). Runs after the MD5 check
/// finds no exact duplicate. Only the file is sent - same bytes the upload itself would send.
#[tauri::command]
pub async fn upload_iqdb(
    state: tauri::State<'_, AppState>,
    site: Site,
    path: String,
) -> Result<Vec<IqdbMatch>, String> {
    require_e621(site)?;
    let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload")
        .to_string();
    let form = reqwest::multipart::Form::new()
        .part("search[file]", reqwest::multipart::Part::bytes(bytes).file_name(name));
    let response = request(&state, site, Method::POST, "iqdb_queries.json")
        .await?
        .query(&[("v2", "true")])
        .timeout(Duration::from_secs(90))
        .multipart(form)
        .send()
        .await
        .map_err(|e| error_chain(&e))?;
    let value: serde_json::Value = ensure_success(response).await?.json().await.map_err(|e| error_chain(&e))?;
    // `render json: @matches, root: "posts"` - tolerate both the wrapped and bare array shapes.
    let list = value
        .get("posts")
        .and_then(|v| v.as_array())
        .or_else(|| value.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(list
        .iter()
        .filter_map(|m| {
            let post = m.get("post").cloned().unwrap_or(serde_json::Value::Null);
            let post_id = m
                .get("post_id")
                .and_then(|v| v.as_i64())
                .or_else(|| post.get("id").and_then(|v| v.as_i64()))?;
            Some(IqdbMatch {
                post_id,
                score: m.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0),
                preview_url: iqdb_preview(&post),
                rating: post.get("rating").and_then(|v| v.as_str()).map(str::to_owned),
            })
        })
        .collect())
}

/// One entry of `POST /tags/preview.json` (e621ng `TagsPreview#serializable_hash`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagPreview {
    pub name: String,
    #[serde(default)]
    pub resolved: Option<String>,
    #[serde(default)]
    pub category: Option<i64>,
    #[serde(default)]
    pub alias: Option<String>,
    #[serde(default)]
    pub implies: Option<Vec<String>>,
    #[serde(default)]
    pub id: Option<i64>,
    #[serde(default)]
    pub post_count: Option<i64>,
}

/// Aliases, categories and (two levels of) implications for a tag string - what e621's own
/// upload page uses for its tag preview. Member-only server-side.
#[tauri::command]
pub async fn upload_tags_preview(
    state: tauri::State<'_, AppState>,
    site: Site,
    tags: Vec<String>,
) -> Result<Vec<TagPreview>, String> {
    require_e621(site)?;
    if tags.is_empty() {
        return Ok(Vec::new());
    }
    let joined = tags.join(" ");
    let response = request(&state, site, Method::POST, "tags/preview.json")
        .await?
        .multipart(reqwest::multipart::Form::new().text("tags", joined))
        .send()
        .await
        .map_err(|e| error_chain(&e))?;
    let body = ensure_success(response).await?.bytes().await.map_err(|e| error_chain(&e))?;
    serde_json::from_slice(&body).map_err(|e| format!("bad tag preview JSON: {e}"))
}

#[derive(Debug, Clone, Serialize)]
pub struct DnpHit {
    pub artist: String,
    pub details: String,
}

/// Active avoid-posting (DNP) entries for any of these artist tag names. One lookup per name;
/// uploads rarely carry more than a couple of artist tags.
#[tauri::command]
pub async fn upload_dnp_check(
    state: tauri::State<'_, AppState>,
    site: Site,
    artists: Vec<String>,
) -> Result<Vec<DnpHit>, String> {
    require_e621(site)?;
    let mut hits = Vec::new();
    for artist in artists {
        let response = request(&state, site, Method::GET, "avoid_postings.json")
            .await?
            .query(&[("search[artist_name]", artist.as_str()), ("search[is_active]", "true")])
            .send_retry(&state, site)
            .await
            .map_err(|e| error_chain(&e))?;
        let body = ensure_success(response).await?.text().await.map_err(|e| error_chain(&e))?;
        // Empty searches come back as `{"avoid_postings":[]}` rather than `[]` on some routes.
        if body.trim_start().starts_with('{') {
            continue;
        }
        let entries: Vec<DnpEntry> = serde_json::from_str(&body).map_err(|e| format!("bad DNP JSON: {e}"))?;
        if let Some(e) = entries.into_iter().find(|e| e.is_active) {
            hits.push(DnpHit { artist, details: e.details });
        }
    }
    Ok(hits)
}

#[derive(Debug, Clone, Deserialize)]
pub struct UploadRequest {
    /// Exactly one of `file_path` / `direct_url`.
    pub file_path: Option<String>,
    pub direct_url: Option<String>,
    pub tag_string: String,
    /// "s" | "q" | "e"
    pub rating: String,
    /// Newline-separated.
    pub source: String,
    pub description: String,
    pub parent_id: Option<i64>,
    pub as_pending: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum UploadResult {
    Ok { post_id: i64 },
    Duplicate { post_id: Option<i64> },
    Invalid { message: String },
}

#[derive(Deserialize)]
struct RawUploadResponse {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    post_id: Option<i64>,
}

/// `POST /uploads.json`. Never retried (not idempotent). e621 answers failures with 412 and a
/// `{success:false, reason, ...}` body, which is turned into a typed result rather than an error.
#[tauri::command]
pub async fn upload_submit(
    state: tauri::State<'_, AppState>,
    site: Site,
    req: UploadRequest,
) -> Result<UploadResult, String> {
    require_e621(site)?;
    if !matches!(req.rating.as_str(), "s" | "q" | "e") {
        return Err("A rating must be chosen".into());
    }
    let mut form = reqwest::multipart::Form::new()
        .text("upload[tag_string]", req.tag_string)
        .text("upload[rating]", req.rating)
        .text("upload[source]", req.source)
        .text("upload[description]", req.description);
    if let Some(p) = req.parent_id {
        form = form.text("upload[parent_id]", p.to_string());
    }
    if req.as_pending {
        form = form.text("upload[as_pending]", "1");
    }
    form = match (req.file_path, req.direct_url) {
        (Some(path), _) => {
            let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
            if bytes.len() as u64 > MAX_UPLOAD_BYTES {
                return Err("File is over e621's 100 MB limit".into());
            }
            let name = std::path::Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("upload")
                .to_string();
            form.part("upload[file]", reqwest::multipart::Part::bytes(bytes).file_name(name))
        }
        (None, Some(url)) => form.text("upload[direct_url]", url),
        (None, None) => return Err("No file or URL to upload".into()),
    };

    let response = request(&state, site, Method::POST, "uploads.json")
        .await?
        .timeout(Duration::from_secs(600))
        .multipart(form)
        .send()
        .await
        .map_err(|e| error_chain(&e))?;
    let status = response.status();
    if status.as_u16() != 412 && !status.is_success() {
        ensure_success(response).await?;
        return Err(format!("Upload failed (HTTP {status})"));
    }
    let body = response.text().await.map_err(|e| error_chain(&e))?;
    let raw: RawUploadResponse =
        serde_json::from_str(&body).map_err(|_| format!("Unexpected upload response (HTTP {status})"))?;
    Ok(match (raw.success, raw.post_id, raw.reason.as_deref()) {
        (true, Some(post_id), _) => UploadResult::Ok { post_id },
        (_, post_id, Some("duplicate")) => UploadResult::Duplicate { post_id },
        _ => UploadResult::Invalid {
            message: raw.message.unwrap_or_else(|| "e621 rejected the upload".into()),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::sniff_ext;

    #[test]
    fn sniffs_formats() {
        assert_eq!(sniff_ext(&[0xFF, 0xD8, 0xFF, 0xE0]), "jpg");
        assert_eq!(sniff_ext(b"\x89PNG\r\n\x1a\n"), "png");
        assert_eq!(sniff_ext(b"GIF89a"), "gif");
        assert_eq!(sniff_ext(b"RIFF\0\0\0\0WEBPVP8 "), "webp");
        assert_eq!(sniff_ext(&[0x1A, 0x45, 0xDF, 0xA3, 0]), "webm");
        assert_eq!(sniff_ext(b"\0\0\0\x18ftypmp42"), "mp4");
        assert_eq!(sniff_ext(b"<html>"), "");
    }
}
