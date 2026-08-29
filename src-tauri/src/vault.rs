use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::AppHandle;
use tauri_plugin_store::StoreBuilder;

use crate::credentials;
use crate::crypto;
use crate::paths;

/// Optional, off-by-default password protection for settings.json/saved-searches.json/
/// credentials.dat (Settings > Encryption) - an explicit user-chosen password instead of the
/// machine+Windows-user-derived key credentials.rs falls back to otherwise. Nothing here runs,
/// and no file changes shape, unless the user turns it on.
///
/// The presence of `.vault_check` (an AES-GCM-encrypted known plaintext) *is* "password
/// protection is enabled" - there's no separate flag file, since a stored plaintext flag would
/// be redundant with this file's own existence and one less file to keep in sync. Decrypting it
/// successfully with a submitted password both confirms the password and yields the salt to
/// derive the real data key from (`crypto::derive_key`) - the two are deliberately the same
/// salt, so there's only one KDF run per unlock, not two.
///
/// The derived key lives only in memory for the life of the process (`MASTER_KEY`) - every
/// launch starts locked again if protection is on, which is the whole point.
const CHECK_FILE: &str = ".vault_check";
const CHECK_PLAINTEXT: &[u8] = b"monosodium-desktop-vault-v1";
const SETTINGS_FILE: &str = "settings.json";
const SAVED_SEARCHES_FILE: &str = "saved-searches.json";

static MASTER_KEY: OnceLock<Mutex<Option<[u8; 32]>>> = OnceLock::new();

fn key_cell() -> &'static Mutex<Option<[u8; 32]>> {
    MASTER_KEY.get_or_init(|| Mutex::new(None))
}

/// Read by credentials.rs (in place of its machine-bound secret) and by this module's own
/// tauri-plugin-store hooks below.
pub fn current_key() -> Option<[u8; 32]> {
    *key_cell().lock().unwrap()
}

fn set_key(key: Option<[u8; 32]>) {
    *key_cell().lock().unwrap() = key;
}

fn check_file_path() -> PathBuf {
    paths::data_root().join(CHECK_FILE)
}

pub fn is_password_protected() -> bool {
    check_file_path().exists()
}

#[derive(Serialize)]
pub struct VaultStatus {
    password_protected: bool,
    /// True only while password-protected and not yet unlocked this session - the frontend
    /// gates booting the rest of the app (which would otherwise try to read the encrypted
    /// stores before the key exists) on this being false.
    locked: bool,
}

#[tauri::command]
pub fn vault_status() -> VaultStatus {
    let protected = is_password_protected();
    VaultStatus {
        password_protected: protected,
        locked: protected && current_key().is_none(),
    }
}

#[derive(Serialize, Deserialize)]
struct CheckEnvelope {
    salt: String,
    iv: String,
    payload: String,
}

fn write_check_file(password: &str) -> Result<Vec<u8>, String> {
    let (salt, iv, ciphertext) = crypto::encrypt(CHECK_PLAINTEXT, password)?;
    let envelope = CheckEnvelope {
        salt: BASE64.encode(salt),
        iv: BASE64.encode(iv),
        payload: BASE64.encode(ciphertext),
    };
    let json = serde_json::to_string(&envelope).map_err(|e| e.to_string())?;
    paths::write_atomic(&check_file_path(), json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(salt.to_vec())
}

/// Errors with a generic "Incorrect password" - same reasoning as backup.rs/credentials.rs:
/// AES-GCM doesn't distinguish a wrong key from tampered ciphertext, and that distinction would
/// be a decryption oracle anyway.
fn verify_password(password: &str) -> Result<[u8; 32], String> {
    let contents = std::fs::read_to_string(check_file_path()).map_err(|e| e.to_string())?;
    let envelope: CheckEnvelope = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    let salt = BASE64.decode(&envelope.salt).map_err(|e| e.to_string())?;
    let iv = BASE64.decode(&envelope.iv).map_err(|e| e.to_string())?;
    let ciphertext = BASE64.decode(&envelope.payload).map_err(|e| e.to_string())?;
    let plaintext =
        crypto::decrypt(&ciphertext, &salt, &iv, password).map_err(|_| "Incorrect password".to_string())?;
    if plaintext != CHECK_PLAINTEXT {
        return Err("Incorrect password".to_string());
    }
    Ok(crypto::derive_key(password, &salt))
}

/// The two `tauri-plugin-store`-managed files. Plain `fn` items (not closures) because
/// `tauri_plugin_store::{SerializeFn, DeserializeFn}` are bare function pointers with no room to
/// capture anything - they read the key from `MASTER_KEY` instead, which is the only reason that
/// global exists rather than threading the key through some other way.
fn store_serialize(cache: &HashMap<String, JsonValue>) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let plaintext = serde_json::to_vec(cache)?;
    let key = current_key().ok_or("vault is locked")?;
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&iv), plaintext.as_slice())
        .map_err(|e| e.to_string())?;
    let mut out = iv.to_vec();
    out.extend(ciphertext);
    Ok(out)
}

fn store_deserialize(bytes: &[u8]) -> Result<HashMap<String, JsonValue>, Box<dyn std::error::Error + Send + Sync>> {
    let key = current_key().ok_or("vault is locked")?;
    if bytes.len() < 12 {
        return Err("corrupt encrypted store".into());
    }
    let (iv, ciphertext) = bytes.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(iv), ciphertext)
        .map_err(|_| "incorrect password")?;
    Ok(serde_json::from_slice(&plaintext)?)
}

fn store_file_paths() -> [PathBuf; 2] {
    let root = paths::data_root();
    [root.join(SETTINGS_FILE), root.join(SAVED_SEARCHES_FILE)]
}

/// Pre-registers both stores with the encrypted hooks above, at the exact absolute path the
/// frontend's own `@tauri-apps/plugin-store` `load()` call will resolve to - so when
/// settingsStore.ts/savedSearchesStore.ts call `load()` afterwards, tauri-plugin-store finds
/// these already-open, already-encryption-aware stores instead of creating new ones with its
/// default plaintext behavior. Must only be called once `verify_password` has already confirmed
/// the key is right - `StoreBuilder::build()` swallows a failed initial load internally, so a
/// wrong key here wouldn't error, it would silently look like an empty/default store, and the
/// next autosave would overwrite the real encrypted file with that empty state.
fn register_encrypted_stores(app: &AppHandle) -> Result<(), String> {
    for path in store_file_paths() {
        StoreBuilder::new(app, path)
            .serialize(store_serialize)
            .deserialize(store_deserialize)
            .build()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn unlock_vault(app: AppHandle, password: String) -> Result<(), String> {
    let key = verify_password(&password)?;
    set_key(Some(key));
    if let Err(e) = register_encrypted_stores(&app) {
        set_key(None);
        return Err(e);
    }
    Ok(())
}

/// Closes any store resource `tauri-plugin-store` already has open for `path` in this session
/// (registered back when settingsStore.ts/savedSearchesStore.ts first called `load()`, with
/// whatever hooks were active then). Without this, enabling/disabling would migrate the on-disk
/// file correctly via direct `std::fs` writes below, only for `tauri-plugin-store`'s own
/// `RunEvent::Exit` handler - which unconditionally re-saves every still-open store through its
/// own registered hooks - to immediately overwrite that migrated file again the moment
/// `relaunch()` tears the app down, using the *old* format. `StoreBuilder::new(...).build()` with
/// no custom hooks either finds the existing resource (the common case) or freshly opens/closes a
/// harmless default one if nothing was open yet - either way, closing it removes it from the
/// exit handler's reach.
fn detach_live_stores(app: &AppHandle) {
    for path in store_file_paths() {
        if let Ok(store) = StoreBuilder::new(app, &path).build() {
            store.close_resource();
        }
    }
}

fn read_plain_store(path: &std::path::Path) -> Option<HashMap<String, JsonValue>> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

fn read_encrypted_store(path: &std::path::Path) -> Option<HashMap<String, JsonValue>> {
    store_deserialize(&std::fs::read(path).ok()?).ok()
}

/// Turns password protection on: derives a new key, re-encrypts settings.json/
/// saved-searches.json/credentials.dat in place, and leaves the new key active in memory.
/// **Doesn't** live-migrate this session's already-open store resources (registered with the old
/// plaintext hooks before this ran) - the frontend restarts the app immediately after this
/// succeeds (`relaunch()`, not a deferred "restart later" button like Cache's), specifically so
/// there's no window where one of those stale resources could autosave plaintext back over the
/// file this just encrypted.
#[tauri::command]
pub fn enable_password_encryption(app: AppHandle, password: String) -> Result<(), String> {
    if is_password_protected() {
        return Err("Password protection is already enabled".to_string());
    }

    // Must happen before anything else - see detach_live_stores's doc comment.
    detach_live_stores(&app);

    // Read the current plaintext state before switching the active key.
    let existing_creds = credentials::read_all();
    let [settings_path, saved_searches_path] = store_file_paths();
    let settings_cache = read_plain_store(&settings_path);
    let saved_searches_cache = read_plain_store(&saved_searches_path);

    let salt = write_check_file(&password)?;
    set_key(Some(crypto::derive_key(&password, &salt)));

    // credentials::write_all now resolves its secret through vault::current_key(), so this
    // re-encrypts under the new password-derived key.
    credentials::write_all(&existing_creds)?;

    if let Some(cache) = settings_cache {
        let encrypted = store_serialize(&cache).map_err(|e| e.to_string())?;
        paths::write_atomic(&settings_path, &encrypted).map_err(|e| e.to_string())?;
    }
    if let Some(cache) = saved_searches_cache {
        let encrypted = store_serialize(&cache).map_err(|e| e.to_string())?;
        paths::write_atomic(&saved_searches_path, &encrypted).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Turns password protection off: decrypts the current state with the still-cached key (this
/// command is only reachable from Settings, which means the vault is already unlocked) and
/// rewrites everything in plaintext/machine-bound form. Same immediate-restart handling as
/// `enable_password_encryption`, for the same reason.
#[tauri::command]
pub fn disable_password_encryption(app: AppHandle) -> Result<(), String> {
    if !is_password_protected() {
        return Err("Password protection is not enabled".to_string());
    }
    if current_key().is_none() {
        return Err("Vault is locked".to_string());
    }

    // Must happen before anything else - see detach_live_stores's doc comment.
    detach_live_stores(&app);

    let existing_creds = credentials::read_all();
    let [settings_path, saved_searches_path] = store_file_paths();
    let settings_cache = read_encrypted_store(&settings_path);
    let saved_searches_cache = read_encrypted_store(&saved_searches_path);

    set_key(None);
    std::fs::remove_file(check_file_path()).map_err(|e| e.to_string())?;

    // credentials::write_all now falls back to the machine-bound secret again.
    credentials::write_all(&existing_creds)?;

    if let Some(cache) = settings_cache {
        let plaintext = serde_json::to_vec_pretty(&cache).map_err(|e| e.to_string())?;
        paths::write_atomic(&settings_path, &plaintext).map_err(|e| e.to_string())?;
    }
    if let Some(cache) = saved_searches_cache {
        let plaintext = serde_json::to_vec_pretty(&cache).map_err(|e| e.to_string())?;
        paths::write_atomic(&saved_searches_path, &plaintext).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// The "forgot password" recovery path, reachable from the unlock screen itself - there's no way
/// to recover a lost password with this kind of at-rest encryption, so the only way forward is
/// deleting the protected files and starting fresh, same as a first launch. Deliberately leaves
/// the WebView2 cache (cache.rs) alone - unrelated to what a forgotten password actually blocks.
#[tauri::command]
pub fn reset_vault() -> Result<(), String> {
    set_key(None);
    let root = paths::data_root();
    for name in [SETTINGS_FILE, SAVED_SEARCHES_FILE, credentials::FILE_NAME, CHECK_FILE] {
        let path = root.join(name);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    for bak in paths::store_bak_paths() {
        let _ = std::fs::remove_file(bak);
    }
    Ok(())
}
