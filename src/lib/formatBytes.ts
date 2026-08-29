// Human-readable byte / duration formatting for the User Dashboard's stat tiles.

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** e.g. 1536 -> "1.5 KB", 0 -> "0 B". Binary (1024) steps, matching how the rest of the app
 *  (Settings > Cache) talks about sizes. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/** e.g. 3_900_000 -> "1h 5m", 45_000 -> "45s", 0 -> "0s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Compact "N min" / "N.N h" for the "avg per session" sub-line. */
export function formatMinutes(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return `${Math.round(ms / 1000)} sec`;
  if (min < 90) return `${Math.round(min)} min`;
  return `${(min / 60).toFixed(1)} h`;
}
