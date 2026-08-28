use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;

/// Shared AES-256-GCM/PBKDF2-HMAC-SHA256 primitives, factored out of backup.rs (Settings > Backup
/// & Restore) so credentials.rs's on-disk credential file can use the same, already-vetted
/// envelope crypto instead of a second hand-rolled implementation. OWASP's 2023-current minimum
/// iteration count for PBKDF2-HMAC-SHA256.
const PBKDF2_ITERATIONS: u32 = 210_000;
pub const SALT_LEN: usize = 16;
pub const IV_LEN: usize = 12;

pub fn derive_key(secret: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(secret.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

pub fn encrypt(plaintext: &[u8], secret: &str) -> Result<([u8; SALT_LEN], [u8; IV_LEN], Vec<u8>), String> {
    let mut salt = [0u8; SALT_LEN];
    let mut iv = [0u8; IV_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut iv);

    let key = derive_key(secret, &salt);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&iv), plaintext)
        .map_err(|e| e.to_string())?;
    Ok((salt, iv, ciphertext))
}

/// Deliberately doesn't distinguish a wrong key from tampered/corrupted ciphertext (AES-GCM's tag
/// check fails the same way for both) - that distinction would be a decryption oracle.
pub fn decrypt(ciphertext: &[u8], salt: &[u8], iv: &[u8], secret: &str) -> Result<Vec<u8>, String> {
    let key = derive_key(secret, salt);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    cipher
        .decrypt(Nonce::from_slice(iv), ciphertext)
        .map_err(|_| "Decryption failed".to_string())
}
