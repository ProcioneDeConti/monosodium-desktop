use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::site::Site;

const KEYRING_SERVICE: &str = "com.monosodiumdesktop.app";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SiteCredentials {
    pub username: String,
    pub api_key: String,
}

fn entry_for(site: Site) -> Result<Entry, String> {
    let account = match site {
        Site::E621 => "e621",
        Site::E6ai => "e6ai",
    };
    Entry::new(KEYRING_SERVICE, account).map_err(|e| e.to_string())
}

/// Reads the stored credentials for a site from Windows Credential Manager, if any were saved.
pub fn load(site: Site) -> Result<Option<SiteCredentials>, String> {
    let entry = entry_for(site)?;
    match entry.get_password() {
        Ok(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|e| e.to_string()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_credentials(site: Site, username: String, api_key: String) -> Result<(), String> {
    let entry = entry_for(site)?;
    let creds = SiteCredentials { username, api_key };
    let json = serde_json::to_string(&creds).map_err(|e| e.to_string())?;
    entry.set_password(&json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_credentials(site: Site) -> Result<Option<SiteCredentials>, String> {
    load(site)
}

#[tauri::command]
pub fn delete_credentials(site: Site) -> Result<(), String> {
    let entry = entry_for(site)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// The user's own SauceNAO API key (Settings > Reverse Image Search) - optional, works without
/// one at a much lower rate limit, but goes through Credential Manager rather than the plain
/// settings JSON store same as e621/e6AI credentials, not the settings.json backup/restore
/// snapshot (lib/backup.ts) either - it's a third-party secret, same treatment as the others.
fn saucenao_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, "saucenao").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_saucenao_key(api_key: String) -> Result<(), String> {
    saucenao_entry()?.set_password(&api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_saucenao_key() -> Result<Option<String>, String> {
    match saucenao_entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_saucenao_key() -> Result<(), String> {
    match saucenao_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
