// Mirrors src-tauri/src/cache.rs's CacheInfo.

export interface CacheInfo {
  used_bytes: number;
  /** Recovered deleted-post files - separate from `used_bytes`, cleared along with it. */
  recovered_bytes: number;
  /** null = unlimited (Chromium's own default disk-cache sizing applies). */
  limit_mb: number | null;
}
