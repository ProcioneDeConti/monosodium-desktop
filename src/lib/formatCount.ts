// Ported from the reference Android app's data/util/CountFormat.kt.
/** Below 1000, the exact count; at or above, one decimal place + "K"/"M" (e.g. "1.1K", "-3.5K", "2.4M"). */
export function formatCount(count: number): string {
  const magnitude = Math.abs(count);
  let divisor: number;
  let suffix: string;
  if (magnitude >= 1_000_000) {
    divisor = 1_000_000;
    suffix = "M";
  } else if (magnitude >= 1_000) {
    divisor = 1_000;
    suffix = "K";
  } else {
    return String(count);
  }
  const formatted = `${(magnitude / divisor).toFixed(1)}${suffix}`;
  return count < 0 ? `-${formatted}` : formatted;
}
