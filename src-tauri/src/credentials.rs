use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::site::Site;

const KEYRING_SERVICE: &str = "com.e621desktop.app";

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
