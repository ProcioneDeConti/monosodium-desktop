use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};

use tauri::{AppHandle, Emitter};

use crate::{credentials, crypto};

/// Top-level key the recovery-source secrets (credentials.rs's `SourceSecrets`) ride under in the
/// backup plaintext. Added/removed here rather than by `lib/backup.ts`, since those secrets never
/// leave the backend.
const SOURCE_SECRETS_FIELD: &str = "sourceSecrets";

/// Reads/writes Settings > Backup & Restore's on-disk format - a straight port of the reference
/// Android app's `SettingsBackupManager`/`BackupCrypto` (same envelope shape, same AES-256-GCM/
/// PBKDF2-HMAC-SHA256 parameters - see crypto.rs, shared with credentials.rs's on-disk credential
/// file), except this module knows nothing about *what* it's encrypting. The reference app's
/// `SettingsBackup` is a fixed struct mirroring its own `UserSettings` - porting that field-for-
/// field here would mean maintaining the same field list twice (once in `state/settingsStore.ts`,
/// which already owns it, and again in a Rust struct). Instead, the frontend assembles the backup
/// JSON (settings + both sites' credentials - see `lib/backup.ts`) and hands this module an
/// opaque string to encrypt/decrypt; only the envelope framing lives here - plus the one
/// exception, the recovery-source secrets (`SOURCE_SECRETS_FIELD`), which the frontend can't see.
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
    let plaintext = with_source_secrets(plaintext)?;
    let envelope_json = build_envelope(plaintext.as_bytes(), password)?;
    std::fs::write(&path, envelope_json).map_err(|e| e.to_string())
}

/// `password` is ignored for an unencrypted file; pass `None`/blank when `is_backup_encrypted`
/// said false. Returns the decrypted plaintext JSON string for the caller to parse.
#[tauri::command]
pub fn import_backup(app: AppHandle, path: String, password: Option<String>) -> Result<String, String> {
    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let plaintext = decrypt_envelope(&contents, password)?;
    let (plaintext, restored) = take_source_secrets(plaintext)?;
    if restored {
        // Settings > Recovery sign-ins re-reads its status on this.
        let _ = app.emit("source-secrets-restored", ());
    }
    Ok(plaintext)
}

/// Adds this machine's recovery-source keys/cookies to the frontend's snapshot (if any are saved).
fn with_source_secrets(plaintext: String) -> Result<String, String> {
    let secrets = credentials::export_source_secrets();
    if secrets.is_empty() {
        return Ok(plaintext);
    }
    let mut value: serde_json::Value =
        serde_json::from_str(&plaintext).map_err(|_| "Backup data is malformed".to_string())?;
    let obj = value.as_object_mut().ok_or_else(|| "Backup data is malformed".to_string())?;
    obj.insert(
        SOURCE_SECRETS_FIELD.into(),
        serde_json::to_value(secrets).map_err(|e| e.to_string())?,
    );
    serde_json::to_string(&value).map_err(|e| e.to_string())
}

/// Strips the recovery-source secrets back out of a decrypted backup and saves them, so they never
/// reach the frontend. Anything that isn't a JSON object, or lacks the field (an older backup),
/// passes through untouched for the frontend's own validation to judge. Returns whether any were
/// restored.
fn take_source_secrets(plaintext: String) -> Result<(String, bool), String> {
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&plaintext) else {
        return Ok((plaintext, false));
    };
    let Some(field) = value.as_object_mut().and_then(|o| o.remove(SOURCE_SECRETS_FIELD)) else {
        return Ok((plaintext, false));
    };
    let secrets: credentials::SourceSecrets = serde_json::from_value(field).unwrap_or_default();
    let restored = !secrets.is_empty();
    credentials::import_source_secrets(secrets)?;
    Ok((serde_json::to_string(&value).map_err(|e| e.to_string())?, restored))
}
