// Mirrors src-tauri/src/cache.rs's CacheInfo.

export interface CacheInfo {
  used_bytes: number;
  /** null = unlimited (Chromium's own default disk-cache sizing applies). */
  limit_mb: number | null;
}
