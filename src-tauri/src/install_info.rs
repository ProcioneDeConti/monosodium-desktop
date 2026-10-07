//! Works out how this copy of the app was installed, from what each installer leaves behind:
//!
//! - **setup.exe (NSIS):** an `uninstall.exe` beside the exe, plus an uninstall registry entry
//!   named after the product (under `HKCU` for a per-user install, `HKLM` for all users).
//! - **MSI (WiX):** an uninstall entry with `WindowsInstaller = 1` whose install location is this
//!   exe's folder. MSIs are no longer published, but 1.14.91-1.14.94 shipped them.
//! - **portable:** neither - just the exe.
//!
//! The registry is only trusted when it points at *this* exe's folder, so an unrelated copy of the
//! exe sitting elsewhere on disk doesn't count as installed.

use std::path::Path;

use serde::Serialize;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
/// Tauri's `productName`: the name NSIS gives its uninstall key, and the MSI's `DisplayName`.
const PRODUCT_NAME: &str = "monosodium-desktop";

#[derive(Serialize)]
pub struct InstallInfo {
    /// `"installer"` (setup.exe), `"msi"`, `"portable"`, or `"dev"` (a debug build).
    pub kind: &'static str,
    /// Extra context for display: scope and recorded version for installs.
    pub detail: Option<String>,
}

fn normalize(path: &str) -> String {
    path.trim().trim_matches('"').trim_end_matches(['\\', '/']).to_ascii_lowercase()
}

/// `(hive name, key)` pairs to look in: per-user first, then all-users.
fn hives() -> [(&'static str, RegKey); 2] {
    [
        ("per-user", RegKey::predef(HKEY_CURRENT_USER)),
        ("all users", RegKey::predef(HKEY_LOCAL_MACHINE)),
    ]
}

/// The NSIS uninstall entry for this product, as (scope, recorded version).
fn nsis_entry() -> Option<(&'static str, Option<String>)> {
    for (scope, hive) in hives() {
        let Ok(key) = hive.open_subkey(format!(r"{UNINSTALL_KEY}\{PRODUCT_NAME}")) else { continue };
        return Some((scope, key.get_value::<String, _>("DisplayVersion").ok()));
    }
    None
}

/// A Windows Installer entry for this product installed into `exe_dir`, as (scope, version).
fn msi_entry(exe_dir: &str) -> Option<(&'static str, Option<String>)> {
    for (scope, hive) in hives() {
        let Ok(uninstall) = hive.open_subkey(UNINSTALL_KEY) else { continue };
        for name in uninstall.enum_keys().flatten() {
            let Ok(key) = uninstall.open_subkey(&name) else { continue };
            let is_product = key.get_value::<String, _>("DisplayName").is_ok_and(|n| n == PRODUCT_NAME);
            let is_msi = key.get_value::<u32, _>("WindowsInstaller").is_ok_and(|v| v == 1);
            if !is_product || !is_msi {
                continue;
            }
            // MSIs don't always record InstallLocation; when they do, it must be this folder.
            let here = key
                .get_value::<String, _>("InstallLocation")
                .map_or(true, |loc| normalize(&loc) == exe_dir);
            if here {
                return Some((scope, key.get_value::<String, _>("DisplayVersion").ok()));
            }
        }
    }
    None
}

fn describe(scope: &str, version: Option<String>) -> Option<String> {
    Some(match version {
        Some(v) => format!("{scope}, v{v}"),
        None => scope.to_string(),
    })
}

fn detect() -> InstallInfo {
    if cfg!(debug_assertions) {
        return InstallInfo { kind: "dev", detail: None };
    }
    let Some(exe_dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) else {
        return InstallInfo { kind: "portable", detail: None };
    };

    if exe_dir.join("uninstall.exe").is_file() {
        let (scope, version) = nsis_entry().unzip();
        return InstallInfo { kind: "installer", detail: scope.and_then(|s| describe(s, version.flatten())) };
    }
    if let Some((scope, version)) = msi_entry(&normalize(&exe_dir.to_string_lossy())) {
        return InstallInfo { kind: "msi", detail: describe(scope, version) };
    }
    InstallInfo { kind: "portable", detail: None }
}

#[tauri::command]
pub fn get_install_info() -> InstallInfo {
    detect()
}
