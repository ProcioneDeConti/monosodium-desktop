// Bounds for the user-configurable WebView2 disk cache size limit (Settings > Cache). Mirrors
// the reference Android app's ImageCacheLimits.kt - same MIN/MAX/STEP/DEFAULT, same slider-index
// scheme with a trailing "Unlimited" position past the last numeric one - even though what's
// actually being sized here is WebView2's own cache, not a self-managed Coil one (see
// src-tauri/src/cache.rs's doc comment).

export const MIN_CACHE_MB = 100;
export const MAX_CACHE_MB = 4000;
export const STEP_CACHE_MB = 50;
export const DEFAULT_CACHE_MB = 250;

const NUMERIC_POSITIONS = (MAX_CACHE_MB - MIN_CACHE_MB) / STEP_CACHE_MB + 1;
/** Slider index of the trailing "Unlimited" position, one past the last numeric position. */
export const UNLIMITED_CACHE_INDEX = NUMERIC_POSITIONS;
export const LAST_CACHE_INDEX = UNLIMITED_CACHE_INDEX;

function clampCacheMb(mb: number): number {
  return Math.min(MAX_CACHE_MB, Math.max(MIN_CACHE_MB, mb));
}

export function cacheIndexForMb(mb: number | null): number {
  if (mb == null) return UNLIMITED_CACHE_INDEX;
  return Math.round((clampCacheMb(mb) - MIN_CACHE_MB) / STEP_CACHE_MB);
}

export function cacheMbForIndex(index: number): number | null {
  if (index >= UNLIMITED_CACHE_INDEX) return null;
  return MIN_CACHE_MB + index * STEP_CACHE_MB;
}

export function formatCacheSize(mb: number | null): string {
  if (mb == null) return "Unlimited";
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function formatCacheBytes(bytes: number): string {
  return formatCacheSize(Math.round(bytes / (1024 * 1024)));
}
