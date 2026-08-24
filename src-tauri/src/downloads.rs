use std::path::PathBuf;

use crate::api::AppState;

/// Where a downloaded file lands when the user hasn't picked a custom folder in Settings -
/// mirrors the reference Android app's default of separate Pictures/e621 vs Movies/e621
/// locations, falling back to the Downloads folder if neither is available (unusual, but some
/// minimal/server Windows configurations lack per-category known folders).
fn default_download_dir(is_video: bool) -> Result<PathBuf, String> {
    let base = if is_video { dirs::video_dir() } else { dirs::picture_dir() }
        .or_else(dirs::download_dir)
        .ok_or("Could not resolve a default downloads folder")?;
    Ok(base.join("e621 Desktop"))
}

/// Fetches a post's media file (the same CDN URL the webview would otherwise load directly -
/// see api.rs's doc comment on why media bypasses the rate-limited/UA'd request() helper) and
/// writes it to disk. Not rate-limited: this hits e621's static asset CDN, not the JSON API the
/// documented rate limit governs.
#[tauri::command]
pub async fn download_post_file(
    state: tauri::State<'_, AppState>,
    url: String,
    file_name: String,
    target_dir: Option<String>,
    is_video: bool,
) -> Result<String, String> {
    let bytes = state
        .http
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let dir = match target_dir {
        Some(d) => PathBuf::from(d),
        None => default_download_dir(is_video)?,
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = dir.join(&file_name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}
