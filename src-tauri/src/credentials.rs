use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::crypto;
use crate::paths;
use crate::site::Site;

pub(crate) const FILE_NAME: &str = "credentials.dat";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SiteCredentials {
    pub username: String,
    pub api_key: String,
}

/// Everything this app keeps secret, in one encrypted file next to the exe instead of Windows
/// Credential Manager - see paths.rs's doc comment for why. e621/e6ai credentials and the
/// SauceNAO key used to be three separate Credential Manager entries; they're one file now since
/// there's no per-secret benefit to splitting them once they're not living in a shared OS vault
/// alongside every other app's entries.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct CredentialsFile {
    e621: Option<SiteCredentials>,
    e6ai: Option<SiteCredentials>,
    saucenao: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Envelope {
    salt: String,
    iv: String,
    payload: String,
}

fn file_path() -> PathBuf {
    paths::data_root().join(FILE_NAME)
}

/// The secret this file is encrypted under. When Settings > Encryption's password protection is
/// on (vault.rs), this is the user's own password-derived key - a real secret, not something
/// reconstructible from public system info. Otherwise it falls back to a key derived from the
/// machine name + Windows username (there's no password-prompt UX in that mode - Credential
/// Manager never needed one either, being implicitly bound to the logged-in Windows user). That
/// fallback is a weaker bound than Credential Manager's own DPAPI-backed protection - anyone who
/// can read this file *and* run code as this same Windows user on this same machine can
/// reproduce the key - but it still stops the plaintext-on-disk case (a copied file, or the same
/// file opened on another machine or account, decrypts to nothing) while keeping the file itself
/// fully portable alongside the exe.
fn machine_secret() -> String {
    if let Some(key) = crate::vault::current_key() {
        return BASE64.encode(key);
    }
    let computer = std::env::var("COMPUTERNAME").unwrap_or_default();
    let user = std::env::var("USERNAME").unwrap_or_default();
    format!("monosodium-desktop:{computer}:{user}")
}

/// In-memory cache of the last decrypted credentials, keyed by the secret string they were
/// decrypted under. `read_all()` runs on **every** e621/e6AI API request (`api.rs::request()`
/// loads the site's credentials to attach Basic Auth), and each miss is a full
/// PBKDF2-HMAC-SHA256 key derivation (crypto.rs, 210k iterations - deliberately ~100ms) plus an
/// AES-GCM decrypt. Without this cache that cost is paid per request, adding real latency to
/// every API call and pinning a worker thread. The file has exactly one writer (this process,
/// via `write_all`), so the cache only needs invalidating there and whenever the active secret
/// changes - keying on the secret string handles the latter for free (a vault unlock/enable/
/// disable changes `machine_secret()`, so the next read misses and re-derives).
static CACHE: Mutex<Option<(String, CredentialsFile)>> = Mutex::new(None);

fn decrypt_file(secret: &str) -> CredentialsFile {
    (|| -> Option<CredentialsFile> {
        let contents = std::fs::read_to_string(file_path()).ok()?;
        let envelope: Envelope = serde_json::from_str(&contents).ok()?;
        let salt = BASE64.decode(&envelope.salt).ok()?;
        let iv = BASE64.decode(&envelope.iv).ok()?;
        let ciphertext = BASE64.decode(&envelope.payload).ok()?;
        let plaintext = crypto::decrypt(&ciphertext, &salt, &iv, secret).ok()?;
        serde_json::from_slice(&plaintext).ok()
    })()
    .unwrap_or_default()
}

/// Any read failure - no file yet, corrupted contents, or a secret that no longer matches (e.g.
/// the file was copied to a different machine/account) - is treated as "nothing saved" rather
/// than a hard error, matching the old keyring backend's `NoEntry` behavior.
pub(crate) fn read_all() -> CredentialsFile {
    let secret = machine_secret();
    let mut cache = CACHE.lock().unwrap();
    if let Some((cached_secret, data)) = cache.as_ref() {
        if *cached_secret == secret {
            return data.clone();
        }
    }
    let data = decrypt_file(&secret);
    *cache = Some((secret, data.clone()));
    data
}

pub(crate) fn write_all(data: &CredentialsFile) -> Result<(), String> {
    let secret = machine_secret();
    let plaintext = serde_json::to_vec(data).map_err(|e| e.to_string())?;
    let (salt, iv, ciphertext) = crypto::encrypt(&plaintext, &secret)?;
    let envelope = Envelope {
        salt: BASE64.encode(salt),
        iv: BASE64.encode(iv),
        payload: BASE64.encode(ciphertext),
    };
    let json = serde_json::to_string(&envelope).map_err(|e| e.to_string())?;
    // Atomic - a truncated credentials.dat decrypts to nothing, i.e. silently signs the user out.
    paths::write_atomic(&file_path(), json.as_bytes()).map_err(|e| e.to_string())?;
    // Keep the in-memory cache in step with what's now on disk (under whatever secret is active),
    // so the next read_all() - e.g. the very next API request - doesn't re-derive the key.
    *CACHE.lock().unwrap() = Some((secret, data.clone()));
    Ok(())
}

/// Drop the in-memory cache - used by `vault::reset_vault`, which deletes credentials.dat out
/// from under this module. (Not strictly required: the next `read_all()` misses anyway once the
/// active secret has changed, and falls back to "nothing saved" for the now-absent file.
/// Explicit is clearer.)
pub(crate) fn clear_cache() {
    *CACHE.lock().unwrap() = None;
}

fn site_slot(data: &mut CredentialsFile, site: Site) -> &mut Option<SiteCredentials> {
    match site {
        Site::E621 => &mut data.e621,
        Site::E6ai => &mut data.e6ai,
    }
}

pub fn load(site: Site) -> Result<Option<SiteCredentials>, String> {
    let mut data = read_all();
    Ok(site_slot(&mut data, site).take())
}

#[tauri::command]
pub fn save_credentials(site: Site, username: String, api_key: String) -> Result<(), String> {
    let mut data = read_all();
    *site_slot(&mut data, site) = Some(SiteCredentials { username, api_key });
    write_all(&data)
}

#[tauri::command]
pub fn load_credentials(site: Site) -> Result<Option<SiteCredentials>, String> {
    load(site)
}

#[tauri::command]
pub fn delete_credentials(site: Site) -> Result<(), String> {
    let mut data = read_all();
    *site_slot(&mut data, site) = None;
    write_all(&data)
}

/// The user's own SauceNAO API key (Settings > Reverse Image Search) - optional, required for any
/// search to succeed at all (SauceNAO rejects anonymous API requests outright - see saucenao.rs),
/// kept in this same file rather than the plain settings JSON store or `lib/backup.ts`'s snapshot,
/// same treatment as e621/e6ai credentials - it's a third-party secret, not an e621 one.
#[tauri::command]
pub fn save_saucenao_key(api_key: String) -> Result<(), String> {
    let mut data = read_all();
    data.saucenao = Some(api_key);
    write_all(&data)
}

#[tauri::command]
pub fn load_saucenao_key() -> Result<Option<String>, String> {
    Ok(read_all().saucenao)
}

#[tauri::command]
pub fn delete_saucenao_key() -> Result<(), String> {
    let mut data = read_all();
    data.saucenao = None;
    write_all(&data)
}
