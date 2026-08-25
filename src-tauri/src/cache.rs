use std::path::{Path, PathBuf};

use serde::Serialize;

/// Manages the disk cache WebView2 (not this app's own Rust code) keeps for everything the
/// webview loads directly - which, per api.rs's doc comment, is every thumbnail/sample/full
/// image and video, since media never makes a Rust round-trip. That's a real architectural
/// difference from the reference Android app's Coil disk cache: Coil is a same-process,
/// self-managed cache a `.clear()` call or an `ImageLoader` rebuild can affect immediately;
/// WebView2's cache is owned by an external browser process (msedgewebview2.exe) that holds
/// file locks on it for as long as this app is running. Both the size limit and a clear are
/// therefore applied at the next launch, not live - `bootstrap()` runs before the webview (and
/// so before that process/its locks) exists, which is the only point a plain filesystem
/// operation on the cache directory is safe.
const APP_DATA_FOLDER: &str = "Monosodium Desktop";
const WEBVIEW2_SUBDIR: &str = "WebView2";
const CLEAR_MARKER_FILE: &str = ".clear_cache_pending";
const LIMIT_FILE: &str = "cache_limit_mb.txt";

fn app_data_root() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|p| p.join(APP_DATA_FOLDER))
        .ok_or_else(|| "Could not resolve the local app data folder".to_string())
}

fn webview2_dir(root: &Path) -> PathBuf {
    root.join(WEBVIEW2_SUBDIR)
}

/// Must run before the Tauri app (and therefore the webview) is built - see this module's doc
/// comment. Pins WebView2's user data folder to a location this module knows, applies a pending
/// clear request left by `request_cache_clear` (safe now: the browser process that would
/// otherwise lock these files doesn't exist yet), and, if a size limit was set, passes it to
/// WebView2 via its documented `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` bootstrap env var
/// (`--disk-cache-size` is a Chromium flag read once at browser-process startup). Best-effort
/// throughout: there's no user-facing way to surface a failure this early, so errors are
/// swallowed rather than blocking app startup over a non-essential feature.
pub fn bootstrap() {
    let Ok(root) = app_data_root() else { return };
    let _ = std::fs::create_dir_all(&root);
    let webview2 = webview2_dir(&root);

    if root.join(CLEAR_MARKER_FILE).exists() {
        let _ = std::fs::remove_dir_all(&webview2);
        let _ = std::fs::remove_file(root.join(CLEAR_MARKER_FILE));
    }

    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview2);

    if let Some(mb) = read_limit_mb(&root) {
        let bytes = mb * 1024 * 1024;
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", format!("--disk-cache-size={bytes}"));
    }
}

/// `None` means no cap was persisted, or it was explicitly cleared (the "Unlimited" slider
/// position) - Chromium's own default disk-cache sizing (roughly scaled to free disk space)
/// applies in that case, the closest practical analogue to the reference app's `UNLIMITED`.
fn read_limit_mb(root: &Path) -> Option<i64> {
    std::fs::read_to_string(root.join(LIMIT_FILE))
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .filter(|&mb| mb > 0)
}

fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    entries
        .flatten()
        .map(|entry| match entry.metadata() {
            Ok(meta) if meta.is_dir() => dir_size(&entry.path()),
            Ok(meta) => meta.len(),
            Err(_) => 0,
        })
        .sum()
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheInfo {
    pub used_bytes: u64,
    /// `None` = unlimited (see `read_limit_mb`).
    pub limit_mb: Option<i64>,
}

#[tauri::command]
pub fn get_cache_info() -> Result<CacheInfo, String> {
    let root = app_data_root()?;
    Ok(CacheInfo {
        used_bytes: dir_size(&webview2_dir(&root)),
        limit_mb: read_limit_mb(&root),
    })
}

/// Doesn't take effect until the next launch - see this module's doc comment.
#[tauri::command]
pub fn set_cache_limit_mb(limit_mb: Option<i64>) -> Result<(), String> {
    let root = app_data_root()?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let path = root.join(LIMIT_FILE);
    match limit_mb {
        Some(mb) if mb > 0 => std::fs::write(&path, mb.to_string()).map_err(|e| e.to_string()),
        _ => {
            if path.exists() {
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
            Ok(())
        }
    }
}

/// Marks the cache for deletion at the next launch (see this module's doc comment for why it
/// can't happen immediately) rather than clearing it now.
#[tauri::command]
pub fn request_cache_clear() -> Result<(), String> {
    let root = app_data_root()?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    std::fs::write(root.join(CLEAR_MARKER_FILE), "1").map_err(|e| e.to_string())
}
