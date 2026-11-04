use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use pbkdf2::pbkdf2_hmac_array;
use sha2::Sha256;

/// Shared AES-256-GCM/PBKDF2-HMAC-SHA256 primitives, factored out of backup.rs (Settings > Backup
/// & Restore) so credentials.rs's on-disk credential file can use the same, already-vetted
/// envelope crypto instead of a second hand-rolled implementation. OWASP's 2023-current minimum
/// iteration count for PBKDF2-HMAC-SHA256.
const PBKDF2_ITERATIONS: u32 = 210_000;
pub const SALT_LEN: usize = 16;
pub const IV_LEN: usize = 12;

pub fn derive_key(secret: &str, salt: &[u8]) -> [u8; 32] {
    pbkdf2_hmac_array::<Sha256, 32>(secret.as_bytes(), salt, PBKDF2_ITERATIONS)
}

pub fn encrypt(plaintext: &[u8], secret: &str) -> Result<([u8; SALT_LEN], [u8; IV_LEN], Vec<u8>), String> {
    // Fresh random salt and nonce per encryption (OS-seeded CSPRNG).
    let salt: [u8; SALT_LEN] = rand::random();
    let iv: [u8; IV_LEN] = rand::random();

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_key_matches_buffer_api() {
        // Existing vaults/backups were keyed via the out-buffer API - must stay byte-identical.
        let salt = [7u8; SALT_LEN];
        let mut expected = [0u8; 32];
        pbkdf2::pbkdf2_hmac::<Sha256>(b"hunter2", &salt, PBKDF2_ITERATIONS, &mut expected);
        assert_eq!(derive_key("hunter2", &salt), expected);
    }

    #[test]
    fn round_trip_and_fresh_salt_iv() {
        let (salt, iv, ct) = encrypt(b"hello", "pw").unwrap();
        assert_eq!(decrypt(&ct, &salt, &iv, "pw").unwrap(), b"hello");
        assert!(decrypt(&ct, &salt, &iv, "wrong").is_err());
        let (salt2, iv2, _) = encrypt(b"hello", "pw").unwrap();
        assert_ne!((salt, iv), (salt2, iv2));
    }
}
