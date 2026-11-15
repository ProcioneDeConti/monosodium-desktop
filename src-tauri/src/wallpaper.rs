//! Desktop wallpaper: "Set as wallpaper" from the post viewer and the timed rotation
//! (src/state/wallpaperStore.ts + src/lib/useWallpaperRotation.ts decide *which* post; this file
//! only turns a CDN URL into the Windows desktop background).
//!
//! The image is always re-encoded to a JPEG in `<data>/wallpaper/` before handing it to Windows:
//! SystemParametersInfo only reliably takes JPEG/BMP/PNG, e621 also serves GIF/WebP, and huge
//! originals are downscaled so the shell isn't asked to transcode a 100-megapixel PNG. Each set
//! writes a fresh file name (Windows can skip a refresh when the path is unchanged) and deletes
//! the older ones afterwards.
//!
//! The first time we change the wallpaper, whatever the user had before is *copied* into the same
//! folder (`previous.<ext>` + `previous.json` with its fit style) so "Restore previous wallpaper"
//! still works when the original path was Windows' own TranscodedWallpaper cache, which our set
//! overwrites.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::menu::MenuItem;
use tauri::Wry;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    SystemParametersInfoW, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_GETDESKWALLPAPER,
    SPI_SETDESKWALLPAPER,
};
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
use winreg::RegKey;

use crate::api::AppState;
use crate::paths;

/// Longest edge we keep. 8K covers any single real monitor; spanned multi-monitor setups still
/// look fine because "span" scales anyway.
const MAX_EDGE: u32 = 7680;
/// Refuse absurd downloads (e621's own upload cap is 100MB).
const MAX_BYTES: usize = 120 * 1024 * 1024;
const DESKTOP_KEY: &str = r"Control Panel\Desktop";
const PREVIOUS_META: &str = "previous.json";
const CURRENT_PREFIX: &str = "wallpaper-";

/// Mirrors Windows' Settings > Personalization > Background "Choose a fit" options.
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WallpaperFit {
    Fill,
    Fit,
    Stretch,
    Center,
    Tile,
    Span,
}

impl WallpaperFit {
    /// (WallpaperStyle, TileWallpaper) registry values.
    fn registry_values(self) -> (&'static str, &'static str) {
        match self {
            WallpaperFit::Fill => ("10", "0"),
            WallpaperFit::Fit => ("6", "0"),
            WallpaperFit::Stretch => ("2", "0"),
            WallpaperFit::Center => ("0", "0"),
            WallpaperFit::Tile => ("0", "1"),
            WallpaperFit::Span => ("22", "0"),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct PreviousWallpaper {
    /// Where the old wallpaper lived; preferred on restore while it still exists (and isn't
    /// Windows' TranscodedWallpaper cache, which our own sets overwrite).
    #[serde(default)]
    original: Option<String>,
    /// Our private copy of the old wallpaper file; None when there wasn't one (solid colour).
    path: Option<String>,
    style: String,
    tile: String,
}

/// The tray's "Next wallpaper" item, enabled only while a rotation is running.
pub struct WallpaperTrayItem(pub MenuItem<Wry>);

fn wallpaper_dir() -> Result<PathBuf, String> {
    let dir = paths::data_root().join("wallpaper");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn current_wallpaper_path() -> Option<PathBuf> {
    let mut buf = [0u16; 1024];
    // SAFETY: buf is a writable u16 buffer and uiparam is its length in characters.
    let ok = unsafe {
        SystemParametersInfoW(SPI_GETDESKWALLPAPER, buf.len() as u32, buf.as_mut_ptr().cast(), 0)
    };
    if ok == 0 {
        return None;
    }
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    let s = String::from_utf16_lossy(&buf[..len]);
    (!s.trim().is_empty()).then(|| PathBuf::from(s))
}

fn read_style() -> (String, String) {
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(DESKTOP_KEY, KEY_READ);
    let get = |name: &str, default: &str| {
        key.as_ref()
            .ok()
            .and_then(|k| k.get_value::<String, _>(name).ok())
            .unwrap_or_else(|| default.to_string())
    };
    (get("WallpaperStyle", "10"), get("TileWallpaper", "0"))
}

fn write_style(style: &str, tile: &str) -> Result<(), String> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(DESKTOP_KEY, KEY_SET_VALUE)
        .map_err(|e| format!("couldn't open desktop settings: {e}"))?;
    key.set_value("WallpaperStyle", &style).map_err(|e| e.to_string())?;
    key.set_value("TileWallpaper", &tile).map_err(|e| e.to_string())?;
    Ok(())
}

fn apply(path: &str) -> Result<(), String> {
    let mut wide = to_wide(path);
    // SAFETY: wide is a NUL-terminated UTF-16 string that outlives the call.
    let ok = unsafe {
        SystemParametersInfoW(
            SPI_SETDESKWALLPAPER,
            0,
            wide.as_mut_ptr().cast(),
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        )
    };
    if ok == 0 {
        return Err(format!(
            "Windows refused the wallpaper ({})",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

/// Copies the user's current wallpaper aside the first time we replace it. Never overwrites an
/// existing snapshot, so a rotation can't make "previous" one of our own images.
fn remember_previous(dir: &Path) -> Result<(), String> {
    let meta_path = dir.join(PREVIOUS_META);
    if meta_path.exists() {
        return Ok(());
    }
    let (style, tile) = read_style();
    let current = current_wallpaper_path();
    let original = current
        .as_ref()
        .filter(|p| !p.starts_with(dir) && !is_transcoded_cache(p))
        .map(|p| p.to_string_lossy().to_string());
    let path = match current {
        // A restored snapshot copy is the live wallpaper: it *is* the previous one, keep using it.
        Some(p) if p.starts_with(dir) && is_previous_copy(&p) => Some(p.to_string_lossy().to_string()),
        // One of our rotated images (snapshot lost somehow): nothing worth keeping.
        Some(p) if p.starts_with(dir) => return Ok(()),
        Some(p) if p.is_file() => {
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .filter(|e| !e.is_empty())
                .unwrap_or("jpg")
                .to_string();
            let copy = dir.join(format!("previous.{ext}"));
            std::fs::copy(&p, &copy).map_err(|e| format!("couldn't back up current wallpaper: {e}"))?;
            Some(copy.to_string_lossy().to_string())
        }
        _ => None,
    };
    let json = serde_json::to_vec(&PreviousWallpaper { original, path, style, tile })
        .map_err(|e| e.to_string())?;
    std::fs::write(meta_path, json).map_err(|e| e.to_string())
}

fn is_previous_copy(p: &Path) -> bool {
    p.file_stem().is_some_and(|s| s == "previous")
}

fn is_transcoded_cache(p: &Path) -> bool {
    p.file_name()
        .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case("TranscodedWallpaper"))
}

fn encode_wallpaper(bytes: &[u8], dest: &Path) -> Result<(), String> {
    let img = image::load_from_memory(bytes).map_err(|e| format!("couldn't decode image: {e}"))?;
    let img = if img.width().max(img.height()) > MAX_EDGE {
        img.resize(MAX_EDGE, MAX_EDGE, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };
    let rgb = img.to_rgb8();
    let file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut writer = std::io::BufWriter::new(file);
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 95)
        .encode_image(&rgb)
        .map_err(|e| format!("couldn't write wallpaper: {e}"))
}

fn remove_old_wallpapers(dir: &Path, keep: &Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name();
            if p != keep && name.to_string_lossy().starts_with(CURRENT_PREFIX) {
                let _ = std::fs::remove_file(p);
            }
        }
    }
}

/// Downloads a post image from the CDN and makes it the desktop wallpaper. Like
/// downloads.rs, this hits the static CDN, not the rate-limited JSON API.
#[tauri::command]
pub async fn set_wallpaper(
    state: tauri::State<'_, AppState>,
    url: String,
    fit: WallpaperFit,
) -> Result<(), String> {
    let response = state
        .http
        .get(&url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?;
    if let Some(len) = response.content_length() {
        if len as usize > MAX_BYTES {
            return Err("image too large for a wallpaper".into());
        }
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("image too large for a wallpaper".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let dir = wallpaper_dir()?;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let dest = dir.join(format!("{CURRENT_PREFIX}{stamp}.jpg"));
        encode_wallpaper(&bytes, &dest)?;
        remember_previous(&dir)?;
        let (style, tile) = fit.registry_values();
        write_style(style, tile)?;
        apply(&dest.to_string_lossy())?;
        remove_old_wallpapers(&dir, &dest);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Whether there's a pre-Monosodium wallpaper snapshot to go back to.
#[tauri::command]
pub fn has_previous_wallpaper() -> bool {
    paths::data_root().join("wallpaper").join(PREVIOUS_META).is_file()
}

/// Puts back the wallpaper (and fit) the user had before we first changed it, then forgets the
/// snapshot so the next "Set as wallpaper" takes a fresh one.
#[tauri::command]
pub async fn restore_previous_wallpaper() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = wallpaper_dir()?;
        let meta_path = dir.join(PREVIOUS_META);
        let raw = std::fs::read(&meta_path).map_err(|_| "No previous wallpaper saved".to_string())?;
        let prev: PreviousWallpaper = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
        write_style(&prev.style, &prev.tile)?;
        let original = prev.original.as_deref().filter(|p| Path::new(p).is_file());
        // Original file still there: point Windows back at it, as if we'd never touched it.
        // Otherwise our copy becomes the wallpaper source (and stays on disk). Neither = they had
        // no picture (solid colour), so an empty path is the faithful restore.
        let target = original.or(prev.path.as_deref()).unwrap_or("");
        apply(target)?;
        let _ = std::fs::remove_file(&meta_path);
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                let unused_copy = is_previous_copy(&p) && p != Path::new(target);
                if name.starts_with(CURRENT_PREFIX) || unused_copy {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Enables/disables the tray's "Next wallpaper" item to match whether a rotation is running.
#[tauri::command]
pub fn set_wallpaper_rotation_active(
    item: tauri::State<'_, WallpaperTrayItem>,
    active: bool,
) -> Result<(), String> {
    item.0.set_enabled(active).map_err(|e| e.to_string())
}
