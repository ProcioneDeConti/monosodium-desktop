use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::paths;
use crate::site::Site;
use crate::source_fetch::{Attempt, RecoveredImage};

/// On-disk cache of deleted-post recoveries (`source_fetch.rs`), so a recovered post opens
/// instantly next time - across restarts - without contacting any third-party site again, and so
/// the grid can show it as a thumbnail.
///
/// Layout: `<data root>/recovered/<site>/<post id>/` holds each candidate file as `<md5>.<ext>`
/// plus `index.json` (a `RecoveredSet`: the candidates' grading metadata, best first, and which
/// one the user picked). The webview loads the files through Tauri's asset protocol, scoped in
/// `lib.rs` to this folder only. Settings > Cache's "Clear" removes the whole folder at the next
/// launch, together with the WebView2 cache (see `cache.rs`); its size limit doesn't apply here.
const INDEX_FILE: &str = "index.json";

pub fn root() -> PathBuf {
    paths::data_root().join("recovered")
}

fn site_key(site: Site) -> &'static str {
    match site {
        Site::E621 => "e621",
        Site::E6ai => "e6ai",
    }
}

pub fn post_dir(site: Site, post_id: i64) -> PathBuf {
    root().join(site_key(site)).join(post_id.to_string())
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct RecoveredSet {
    /// File name of the candidate the user picked (drives the grid thumbnail); the best match
    /// until they pick another.
    pub selected: Option<String>,
    pub items: Vec<RecoveredImage>,
    /// Set (unix seconds) when a full search found nothing and nothing was cached from before -
    /// the grid then shows a "not found" tile instead of a plain deleted one. Cleared by any later
    /// search that finds something.
    #[serde(default)]
    pub not_found_at: Option<i64>,
    /// The latest search's report: when it ran and every place that came up empty (what it found
    /// is `items`). Shown by the viewer's report card, also after a restart.
    #[serde(default)]
    pub report: Option<SearchReport>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct SearchReport {
    pub searched_at: i64,
    pub attempts: Vec<Attempt>,
}

/// Cache file names are always `<md5>.<ext>`. Names coming from the frontend are checked against
/// that, so these commands can't be pointed at anything outside a post's folder.
fn valid_file_name(name: &str) -> bool {
    let Some((stem, ext)) = name.split_once('.') else { return false };
    stem.len() == 32
        && stem.bytes().all(|b| b.is_ascii_hexdigit())
        && (1..=5).contains(&ext.len())
        && ext.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// Writes one candidate's bytes (skipped if that md5 is already cached). Returns its file name.
pub fn store_file(dir: &Path, md5: &str, ext: &str, bytes: &[u8]) -> Result<String, String> {
    let name = format!("{md5}.{}", if ext.is_empty() { "bin" } else { ext });
    if !valid_file_name(&name) {
        return Err(format!("bad cache file name {name}"));
    }
    let path = dir.join(&name);
    if !path.is_file() {
        paths::write_atomic(&path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(name)
}

/// Drops entries whose file has gone missing, fills in absolute paths, and keeps `selected` valid.
fn finish(dir: &Path, mut set: RecoveredSet) -> RecoveredSet {
    set.items.retain(|i| valid_file_name(&i.file) && dir.join(&i.file).is_file());
    for item in &mut set.items {
        item.path = dir.join(&item.file).to_string_lossy().into_owned();
    }
    if !set.selected.as_ref().is_some_and(|s| set.items.iter().any(|i| &i.file == s)) {
        set.selected = set.items.first().map(|i| i.file.clone());
    }
    set
}

fn read_index(dir: &Path) -> Option<RecoveredSet> {
    let bytes = std::fs::read(dir.join(INDEX_FILE)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_index(dir: &Path, set: &RecoveredSet) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(set).map_err(|e| e.to_string())?;
    paths::write_atomic(&dir.join(INDEX_FILE), &json).map_err(|e| e.to_string())
}

/// Deletes candidate files no longer listed in the index (left by a cancelled run, or replaced).
fn remove_strays(dir: &Path, set: &RecoveredSet) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let stray = if let Some(md5) = thumb_md5(&name) {
            !set.items.iter().any(|i| i.md5.eq_ignore_ascii_case(md5))
        } else {
            valid_file_name(&name) && !set.items.iter().any(|i| i.file == name)
        };
        if stray {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Longest side of a grid thumbnail. Grid cells are a few hundred CSS px wide; this leaves room for
/// high-DPI screens while keeping decode cost near an e621 preview's (recovered originals are
/// often 2-4K and several MB - decoding those per cell made scrolling lag).
const THUMB_MAX: u32 = 480;

/// `<md5>.thumb.jpg` / `<md5>.thumb.png` -> the md5.
fn thumb_md5(name: &str) -> Option<&str> {
    let md5 = name.strip_suffix(".thumb.jpg").or_else(|| name.strip_suffix(".thumb.png"))?;
    (md5.len() == 32 && md5.bytes().all(|b| b.is_ascii_hexdigit())).then_some(md5)
}

/// The cached thumbnail of a recovered file, if one was made.
fn existing_thumb(dir: &Path, md5: &str) -> Option<PathBuf> {
    ["jpg", "png"].iter().map(|ext| dir.join(format!("{md5}.thumb.{ext}"))).find(|p| p.is_file())
}

/// Makes (or finds) the small grid copy of a recovered image: JPEG, or PNG when the image has
/// transparency (a JPEG would turn it black). `None` for videos and formats the image crate here
/// doesn't decode (AVIF) - the grid then shows a placeholder / the file itself. Blocking: decodes
/// the full file, so call it off the async runtime.
fn make_thumb(dir: &Path, item: &RecoveredImage) -> Option<PathBuf> {
    if item.is_video {
        return None;
    }
    if let Some(existing) = existing_thumb(dir, &item.md5) {
        return Some(existing);
    }
    let img = image::open(dir.join(&item.file)).ok()?;
    let small = if img.width() > THUMB_MAX || img.height() > THUMB_MAX { img.thumbnail(THUMB_MAX, THUMB_MAX) } else { img };
    let (ext, bytes) = if small.color().has_alpha() {
        let mut out = std::io::Cursor::new(Vec::new());
        small.write_to(&mut out, image::ImageFormat::Png).ok()?;
        ("png", out.into_inner())
    } else {
        let mut out = Vec::new();
        let rgb = small.to_rgb8();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85).encode_image(&rgb).ok()?;
        ("jpg", out)
    };
    let path = dir.join(format!("{}.thumb.{ext}", item.md5));
    paths::write_atomic(&path, &bytes).ok()?;
    Some(path)
}

/// The user's pick for a post (or the best match).
fn picked(set: &RecoveredSet) -> Option<&RecoveredImage> {
    set.selected.as_ref().and_then(|s| set.items.iter().find(|i| &i.file == s)).or(set.items.first())
}

pub fn load(site: Site, post_id: i64) -> Option<RecoveredSet> {
    let dir = post_dir(site, post_id);
    let set = finish(&dir, read_index(&dir)?);
    (!set.items.is_empty() || set.not_found_at.is_some()).then_some(set)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64)
}

/// Records that a full search for the post found nothing - unless copies from an earlier search
/// are still cached, which stay as they are. Best-effort: it only drives a grid marker.
pub fn mark_not_found(site: Site, post_id: i64, attempts: Vec<Attempt>) {
    let dir = post_dir(site, post_id);
    let old = read_index(&dir).map(|s| finish(&dir, s)).unwrap_or_default();
    if !old.items.is_empty() {
        return;
    }
    let now = now_secs();
    let set = RecoveredSet {
        selected: None,
        items: Vec::new(),
        not_found_at: Some(now),
        report: Some(SearchReport { searched_at: now, attempts }),
    };
    if std::fs::create_dir_all(&dir).is_ok() && write_index(&dir, &set).is_ok() {
        remove_strays(&dir, &set);
    }
}

/// Merges a fresh run's results (already best-first) into what's cached for the post: a file
/// found again takes the new metadata, files only the old run found are kept (a source may have
/// died since). The user's pick survives if its file is still there.
pub fn save(site: Site, post_id: i64, fresh: Vec<RecoveredImage>, attempts: Vec<Attempt>) -> Result<RecoveredSet, String> {
    let dir = post_dir(site, post_id);
    let old = read_index(&dir).unwrap_or_default();
    let mut items = fresh;
    for item in old.items {
        if !items.iter().any(|i| i.md5 == item.md5) {
            items.push(item);
        }
    }
    // Stable: equal scores keep fresh-before-old and source order.
    items.sort_by(|a, b| b.score.cmp(&a.score));
    let report = Some(SearchReport { searched_at: now_secs(), attempts });
    let set = finish(&dir, RecoveredSet { selected: old.selected, items, not_found_at: None, report });
    write_index(&dir, &set)?;
    remove_strays(&dir, &set);
    Ok(set)
}

/// The cached recovery for one post, if any.
#[tauri::command]
pub fn get_recovered(site: Site, post_id: i64) -> Option<RecoveredSet> {
    load(site, post_id)
}

#[derive(Serialize)]
pub struct RecoveredThumb {
    /// The picked file; `None` for a post searched without result (see `not_found_at`).
    pub path: Option<String>,
    /// Its small grid copy, once made (`make_thumb`); the grid falls back to `path` until then.
    pub thumb: Option<String>,
    pub is_video: bool,
    pub not_found_at: Option<i64>,
}

/// Every recovered post of `site` -> its selected file, for the grid's thumbnails.
#[tauri::command]
pub fn list_recovered(site: Site) -> HashMap<i64, RecoveredThumb> {
    let mut out = HashMap::new();
    let Ok(entries) = std::fs::read_dir(root().join(site_key(site))) else { return out };
    for entry in entries.flatten() {
        let Some(id) = entry.file_name().to_str().and_then(|n| n.parse::<i64>().ok()) else { continue };
        let Some(set) = load(site, id) else { continue };
        let pick = set.selected.as_ref().and_then(|s| set.items.iter().find(|i| &i.file == s));
        match pick.or(set.items.first()) {
            Some(item) => {
                let dir = post_dir(site, id);
                let thumb = existing_thumb(&dir, &item.md5).map(|p| p.to_string_lossy().into_owned());
                out.insert(id, RecoveredThumb { path: Some(item.path.clone()), thumb, is_video: item.is_video, not_found_at: None });
            }
            None => {
                out.insert(id, RecoveredThumb { path: None, thumb: None, is_video: false, not_found_at: set.not_found_at });
            }
        }
    }
    out
}

/// The grid thumbnail for one recovered post's pick, made now if missing (after a recovery or a
/// new pick).
#[tauri::command]
pub async fn recovered_thumb(site: Site, post_id: i64) -> Option<String> {
    tokio::task::spawn_blocking(move || {
        let set = load(site, post_id)?;
        let item = picked(&set)?;
        make_thumb(&post_dir(site, post_id), item).map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .ok()
    .flatten()
}

/// Makes the missing grid thumbnails for every recovered post of `site` (posts recovered before
/// thumbnails existed). Runs once per site per app session from the frontend; returns
/// post id -> thumbnail path for the ones it made.
#[tauri::command]
pub async fn build_recovered_thumbs(site: Site) -> HashMap<i64, String> {
    tokio::task::spawn_blocking(move || {
        let mut out = HashMap::new();
        let Ok(entries) = std::fs::read_dir(root().join(site_key(site))) else { return out };
        for entry in entries.flatten() {
            let Some(id) = entry.file_name().to_str().and_then(|n| n.parse::<i64>().ok()) else { continue };
            let Some(set) = load(site, id) else { continue };
            let Some(item) = picked(&set) else { continue };
            let dir = post_dir(site, id);
            if item.is_video || existing_thumb(&dir, &item.md5).is_some() {
                continue;
            }
            if let Some(path) = make_thumb(&dir, item) {
                out.insert(id, path.to_string_lossy().into_owned());
            }
        }
        out
    })
    .await
    .unwrap_or_default()
}

/// Remembers which candidate the user picked.
#[tauri::command]
pub fn select_recovered(site: Site, post_id: i64, file: String) -> Result<(), String> {
    let dir = post_dir(site, post_id);
    let mut set = read_index(&dir).ok_or("nothing recovered for this post")?;
    if !set.items.iter().any(|i| i.file == file) {
        return Err("no such recovered file".into());
    }
    set.selected = Some(file);
    write_index(&dir, &set)
}

/// Deletes everything recovered for one post.
#[tauri::command]
pub fn forget_recovered(site: Site, post_id: i64) -> Result<(), String> {
    let dir = post_dir(site, post_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Copies a recovered file to the download folder (Settings' folder, else the same default as a
/// normal post download).
#[tauri::command]
pub fn save_recovered_file(
    site: Site,
    post_id: i64,
    file: String,
    file_name: String,
    target_dir: Option<String>,
) -> Result<String, String> {
    if !valid_file_name(&file) {
        return Err("no such recovered file".into());
    }
    if file_name.is_empty() || file_name.contains(['/', '\\', ':']) || file_name.starts_with('.') {
        return Err("invalid file name".into());
    }
    let from = post_dir(site, post_id).join(&file);
    if !from.is_file() {
        return Err("the recovered file is no longer cached".into());
    }
    let is_video = matches!(file.rsplit_once('.').map(|(_, e)| e), Some("webm" | "mp4"));
    let dir = match target_dir {
        Some(d) => PathBuf::from(d),
        None => crate::downloads::default_download_dir(is_video)?,
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let to = dir.join(&file_name);
    std::fs::copy(&from, &to).map_err(|e| e.to_string())?;
    Ok(to.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumbnail_names() {
        assert_eq!(thumb_md5("0123456789abcdef0123456789abcdef.thumb.jpg"), Some("0123456789abcdef0123456789abcdef"));
        assert_eq!(thumb_md5("0123456789abcdef0123456789abcdef.thumb.png"), Some("0123456789abcdef0123456789abcdef"));
        assert_eq!(thumb_md5("0123456789abcdef0123456789abcdef.png"), None);
        assert_eq!(thumb_md5("index.json"), None);
        // A thumbnail is never mistaken for a candidate file (and so never served as one).
        assert!(!valid_file_name("0123456789abcdef0123456789abcdef.thumb.jpg"));
    }

    #[test]
    fn makes_small_thumbnails() {
        let dir = std::env::temp_dir().join(format!("monosodium-thumb-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let md5 = "0123456789abcdef0123456789abcdef";
        let mut item: RecoveredImage = serde_json::from_value(serde_json::json!({
            "file": format!("{md5}.png"), "md5": md5, "source_url": "", "image_url": "", "mime": "image/png",
            "size_bytes": 0, "via_archive": false, "grade": "exact", "md5_match": true, "width": 1200, "height": 600,
            "expected_width": 0, "expected_height": 0, "expected_size": 0, "notes": []
        }))
        .unwrap();
        // Opaque -> JPEG, scaled to fit THUMB_MAX.
        image::RgbImage::new(1200, 600).save(dir.join(&item.file)).unwrap();
        let thumb = make_thumb(&dir, &item).unwrap();
        assert!(thumb.to_string_lossy().ends_with(".thumb.jpg"));
        assert_eq!(image::image_dimensions(&thumb).unwrap(), (480, 240));
        // Transparent -> PNG.
        std::fs::remove_file(&thumb).unwrap();
        image::RgbaImage::new(100, 300).save(dir.join(&item.file)).unwrap();
        assert!(make_thumb(&dir, &item).unwrap().to_string_lossy().ends_with(".thumb.png"));
        item.is_video = true;
        assert!(make_thumb(&dir, &item).is_none(), "videos get no thumbnail");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_md5_file_names_are_accepted() {
        assert!(valid_file_name("0123456789abcdef0123456789abcdef.png"));
        assert!(valid_file_name("0123456789ABCDEF0123456789abcdef.webm"));
        for bad in [
            "index.json",
            "../0123456789abcdef0123456789abcdef.png",
            "0123456789abcdef0123456789abcdef",
            "0123456789abcdef0123456789abcdef.p/g",
            "0123456789abcdef0123456789abcde.png",
            "0123456789abcdef0123456789abcdef.png.exe",
        ] {
            assert!(!valid_file_name(bad), "{bad} should be refused");
        }
    }
}
