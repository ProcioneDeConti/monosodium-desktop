use std::path::{Path, PathBuf};

/// All of this app's local state - settings.json/saved-searches.json (tauri-plugin-store),
/// credentials.dat (credentials.rs), and the WebView2 cache (cache.rs) - lives in a "data" folder
/// next to the exe instead of scattered across %APPDATA%/%LOCALAPPDATA%/Windows Credential
/// Manager. Deleting the app's folder (or the whole portable install) leaves nothing else behind
/// on the system - the point of a portable/incognito-friendly build.
///
/// Falls back to the standard local-appdata location only if the exe's own directory isn't
/// writable - a per-machine MSI install under Program Files without elevation being the one
/// realistic case, since a standard user can't write there. Every NSIS per-user install and every
/// portable copy of the exe already lives somewhere the user owns, so the fallback is a safety
/// net, not the common path.
pub fn data_root() -> PathBuf {
    if let Some(dir) = exe_dir() {
        let candidate = dir.join("data");
        if is_writable(&candidate) {
            return candidate;
        }
    }

    dirs::data_local_dir()
        .map(|p| p.join("Monosodium Desktop"))
        .unwrap_or_else(std::env::temp_dir)
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

/// Exposed to the frontend so `settingsStore.ts`/`savedSearchesStore.ts` can build an absolute
/// path and hand it to `@tauri-apps/plugin-store`'s `load()` - which otherwise always resolves
/// its argument against Tauri's own AppData dir. An absolute path passed to `load()` is used
/// as-is (confirmed against the plugin's `resolve_store_path`, which joins onto a `PathBuf` -
/// pushing an absolute path replaces the buffer outright, standard `PathBuf::push` behavior), so
/// this is enough to redirect both stores here without patching the plugin itself.
#[tauri::command]
pub fn get_data_dir() -> Result<String, String> {
    let root = data_root();
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root.to_string_lossy().to_string())
}
