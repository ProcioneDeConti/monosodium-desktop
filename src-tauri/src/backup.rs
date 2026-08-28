use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::crypto;

/// Reads/writes Settings > Backup & Restore's on-disk format - a straight port of the reference
/// Android app's `SettingsBackupManager`/`BackupCrypto` (same envelope shape, same AES-256-GCM/
/// PBKDF2-HMAC-SHA256 parameters - see crypto.rs, shared with credentials.rs's on-disk credential
/// file), except this module knows nothing about *what* it's encrypting. The reference app's
/// `SettingsBackup` is a fixed struct mirroring its own `UserSettings` - porting that field-for-
/// field here would mean maintaining the same field list twice (once in `state/settingsStore.ts`,
/// which already owns it, and again in a Rust struct). Instead, the frontend assembles the backup
/// JSON (settings + both sites' credentials - see `lib/backup.ts`) and hands this module an
/// opaque string to encrypt/decrypt; only the envelope framing lives here.
const ENVELOPE_VERSION: i32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BackupEnvelope {
    #[serde(default = "default_version")]
    version: i32,
    encrypted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    salt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    iv: Option<String>,
    payload: String,
}

fn default_version() -> i32 {
    ENVELOPE_VERSION
}

fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    BASE64.decode(value).map_err(|_| "Backup file is corrupted".to_string())
}

fn parse_envelope(file_contents: &str) -> Result<BackupEnvelope, String> {
    serde_json::from_str(file_contents).map_err(|_| "Not a valid backup file".to_string())
}

fn build_envelope(bytes: &[u8], password: Option<String>) -> Result<String, String> {
    let envelope = match password.filter(|p| !p.is_empty()) {
        None => BackupEnvelope {
            version: ENVELOPE_VERSION,
            encrypted: false,
            salt: None,
            iv: None,
            payload: BASE64.encode(bytes),
        },
        Some(pw) => {
            let (salt, iv, ciphertext) = crypto::encrypt(bytes, &pw)?;
            BackupEnvelope {
                version: ENVELOPE_VERSION,
                encrypted: true,
                salt: Some(BASE64.encode(salt)),
                iv: Some(BASE64.encode(iv)),
                payload: BASE64.encode(&ciphertext),
            }
        }
    };
    serde_json::to_string_pretty(&envelope).map_err(|e| e.to_string())
}

fn decrypt_envelope(file_contents: &str, password: Option<String>) -> Result<String, String> {
    let envelope = parse_envelope(file_contents)?;
    let bytes = if !envelope.encrypted {
        decode_base64(&envelope.payload)?
    } else {
        let pw = password
            .filter(|p| !p.is_empty())
            .ok_or_else(|| "This backup is password-protected".to_string())?;
        let salt = envelope
            .salt
            .as_deref()
            .ok_or_else(|| "Backup file is missing encryption data".to_string())
            .and_then(decode_base64)?;
        let iv = envelope
            .iv
            .as_deref()
            .ok_or_else(|| "Backup file is missing encryption data".to_string())
            .and_then(decode_base64)?;
        let ciphertext = decode_base64(&envelope.payload)?;
        crypto::decrypt(&ciphertext, &salt, &iv, &pw).map_err(|_| "Incorrect password".to_string())?
    };
    String::from_utf8(bytes).map_err(|_| "Backup file is corrupted".to_string())
}

/// Peeks at a picked file's envelope to tell the caller whether to prompt for a password before
/// `import_backup`.
#[tauri::command]
pub fn is_backup_encrypted(path: String) -> Result<bool, String> {
    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(parse_envelope(&contents)?.encrypted)
}

/// Pass `None`/blank `password` to export unencrypted - the caller's plaintext (which may include
/// API keys) ends up readable as-is in the file. `plaintext` is an opaque JSON string assembled
/// by the frontend - see this module's doc comment.
#[tauri::command]
pub fn export_backup(path: String, plaintext: String, password: Option<String>) -> Result<(), String> {
    let envelope_json = build_envelope(plaintext.as_bytes(), password)?;
    std::fs::write(&path, envelope_json).map_err(|e| e.to_string())
}

/// `password` is ignored for an unencrypted file; pass `None`/blank when `is_backup_encrypted`
/// said false. Returns the decrypted plaintext JSON string for the caller to parse.
#[tauri::command]
pub fn import_backup(path: String, password: Option<String>) -> Result<String, String> {
    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    decrypt_envelope(&contents, password)
}
