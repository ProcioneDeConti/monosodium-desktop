use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// All of this app's local state - settings.json/saved-searches.json (tauri-plugin-store),
/// credentials.dat (credentials.rs), and the WebView2 cache (cache.rs) - lives in a "data" folder
/// next to the exe instead of scattered across %APPDATA%/%LOCALAPPDATA%/Windows Credential
/// Manager. Deleting the app's folder (or the whole portable install) leaves nothing else behind
/// on the system - the point of a portable/incognito-friendly build.
///
/// Falls back to the standard local-appdata location only for a genuinely-fresh install whose
/// exe directory isn't writable (a per-machine MSI under Program Files without elevation being
/// the one realistic case). **Once either location already holds real data, that location wins
/// unconditionally** - a *transient* writability failure (an antivirus scan of a freshly-built
/// exe, a file lock during an active rebuild) must never be able to silently move the whole
/// config elsewhere and make the app look factory-reset.
///
/// Settings > Reset ("erase all data") writes a `.full_reset_pending` marker and restarts; the
/// next launch calls `apply_full_reset` before anything else touches the data folder (and while
/// the old webview's file locks are gone), wiping *every* `candidate_roots()` entry - both the
/// portable folder and the AppData fallback, regardless of which one is currently active.
const DATA_MARKERS: [&str; 5] = [
    "settings.json",
    "saved-searches.json",
    "credentials.dat",
    ".vault_check",
    "search-history.json",
];

/// Left behind by `request_full_reset`, consumed by `apply_full_reset` at the next launch.
const RESET_MARKER: &str = ".full_reset_pending";

/// Where this app's data folder lives, plus whether that's the portable (next-to-exe) location
/// or the `%LOCALAPPDATA%` fallback - surfaced to Settings so it can warn when the program
/// directory wasn't writable.
pub struct DataLocation {
    pub path: PathBuf,
    pub portable: bool,
}

fn portable_root() -> Option<PathBuf> {
    exe_dir().map(|d| d.join("data"))
}

fn appdata_root() -> PathBuf {
    dirs::data_local_dir()
        .map(|p| p.join("Monosodium Desktop"))
        .unwrap_or_else(std::env::temp_dir)
}

/// Every location the data folder could ever be, so `apply_full_reset` clears the inactive
/// fallback too rather than leaving half the config behind on disk.
fn candidate_roots() -> Vec<PathBuf> {
    let mut roots = Vec::with_capacity(2);
    if let Some(p) = portable_root() {
        roots.push(p);
    }
    roots.push(appdata_root());
    roots
}

pub fn data_location() -> DataLocation {
    let portable = portable_root();
    let appdata = appdata_root();

    if let Some(p) = &portable {
        if has_app_data(p) {
            return DataLocation { path: p.clone(), portable: true };
        }
    }
    if has_app_data(&appdata) {
        return DataLocation { path: appdata, portable: false };
    }

    // First run (or everything was wiped): prefer next to the exe, retrying the probe so one
    // flaky check doesn't push a portable install into %LOCALAPPDATA%.
    if let Some(p) = portable {
        for attempt in 0..6u64 {
            if is_writable(&p) {
                return DataLocation { path: p, portable: true };
            }
            std::thread::sleep(std::time::Duration::from_millis(40 * (attempt + 1)));
        }
    }
    DataLocation { path: appdata, portable: false }
}

pub fn data_root() -> PathBuf {
    data_location().path
}

fn has_app_data(dir: &Path) -> bool {
    DATA_MARKERS.iter().any(|f| dir.join(f).is_file())
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

fn is_writable(dir: &Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write_test");
    let ok = std::fs::write(&probe, []).is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

/// Write `bytes` to `path` atomically: a sibling temp file is written and flushed, then renamed
/// over the target. Rename-over is atomic on Windows (`MoveFileExW` with `REPLACE_EXISTING`) and
/// POSIX, so a crash - or `tauri dev` SIGKILLing the app on a rebuild - mid-write can never leave
/// a truncated file; a reader sees either the whole old contents or the whole new contents.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("data");
    let tmp = path.with_file_name(format!(".{name}.tmp.{}", std::process::id()));
    {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    if let Err(e) = std::fs::rename(&tmp, path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}

/// Exposed to the frontend so `settingsStore.ts`/`savedSearchesStore.ts` can build an absolute
/// path and hand it to `@tauri-apps/plugin-store`'s `load()` - which otherwise always resolves
/// its argument against Tauri's own AppData dir.
#[tauri::command]
pub fn get_data_dir() -> Result<String, String> {
    let root = data_root();
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root.to_string_lossy().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageLocation {
    pub data_dir: String,
    /// False means the exe directory wasn't writable and data lives in `%LOCALAPPDATA%` instead.
    pub portable: bool,
}

/// Backs Settings > Reset's "data is stored in …" line and its AppData-fallback warning.
#[tauri::command]
pub fn storage_location() -> StorageLocation {
    let loc = data_location();
    StorageLocation {
        data_dir: loc.path.to_string_lossy().to_string(),
        portable: loc.portable,
    }
}

/// Settings > Reset. Marks every local file for deletion at the next launch rather than wiping
/// now - the WebView2 cache directory is locked by the browser process while the app runs (same
/// constraint as `cache::request_cache_clear`), so the actual `remove_dir_all` happens in
/// `apply_full_reset`, called from `lib.rs` before the webview is recreated.
#[tauri::command]
pub fn request_full_reset() -> Result<(), String> {
    let root = data_root();
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    write_atomic(&root.join(RESET_MARKER), b"1").map_err(|e| e.to_string())
}

/// True if `request_full_reset` left its marker in either candidate location.
pub fn full_reset_pending() -> bool {
    candidate_roots().iter().any(|r| r.join(RESET_MARKER).is_file())
}

/// Wipes both candidate data folders (portable + AppData fallback). Best-effort: an in-use file
/// or a missing folder is not worth blocking startup over. Must run before `cache::bootstrap`
/// and the store plugin - see this module's doc comment.
pub fn apply_full_reset() {
    for root in candidate_roots() {
        let _ = std::fs::remove_dir_all(&root);
    }
}

fn bak_path(path: &Path) -> PathBuf {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("data");
    path.with_file_name(format!("{name}.bak"))
}

fn store_file_looks_ok(path: &Path, encrypted: bool) -> bool {
    let Ok(bytes) = std::fs::read(path) else { return false };
    if encrypted {
        // AES-GCM store payload: 12-byte nonce + >=16-byte tag. A dev-kill mid-write usually
        // truncates to 0/a few bytes; that's what we're guarding against, not a subtle bit-flip.
        bytes.len() >= 28
    } else {
        serde_json::from_slice::<serde_json::Value>(&bytes).is_ok()
    }
}

/// `tauri-plugin-store` saves `settings.json` / `saved-searches.json` with a plain, non-atomic
/// `fs::write`, so a crash / dev-rebuild kill mid-save can truncate them and lose every setting
/// (theme, accent, blacklist, …). Run at startup *before* the store plugin loads: keep a `.bak`
/// of the last-known-good copy, and restore it if the live file comes back empty/corrupt.
pub fn guard_store_files(encrypted: bool) {
    let root = data_root();
    for name in ["settings.json", "saved-searches.json", "search-history.json"] {
        let live = root.join(name);
        // search-history is never encrypted (its own plaintext store).
        let enc = encrypted && name != "search-history.json";
        let bak = bak_path(&live);
        if store_file_looks_ok(&live, enc) {
            let _ = std::fs::copy(&live, &bak);
        } else if bak.is_file() && store_file_looks_ok(&bak, enc) {
            let _ = std::fs::copy(&bak, &live);
        }
    }
}

/// The `.bak` sidecars from `guard_store_files`, so `reset_vault` can wipe them too.
pub fn store_bak_paths() -> Vec<PathBuf> {
    let root = data_root();
    ["settings.json", "saved-searches.json", "search-history.json"]
        .iter()
        .map(|n| bak_path(&root.join(n)))
        .collect()
}
