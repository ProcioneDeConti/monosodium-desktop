/** ROYGBIV stripes - the same seven hues as the Android app's `RainbowStripeColors`
 *  (ui/components/RainbowRefreshIndicator.kt), muted here (lower saturation and brightness) so
 *  they read as color rather than glare against the app's surfaces. */
export const RAINBOW_STRIPES = [
  "#D9625F",
  "#E0935A",
  "#DDC35E",
  "#73B972",
  "#5AA7CF",
  "#6366B8",
  "#9472C6",
] as const;

/** Hard-stop stripes: `bandPx` each (repeating), or the seven spread across 100% (meter). */
function stripes(bandPx: number | null): string {
  const n = RAINBOW_STRIPES.length;
  const unit = (i: number) => (bandPx == null ? `${((i * 100) / n).toFixed(4)}%` : `${i * bandPx}px`);
  const stops = RAINBOW_STRIPES.map((c, i) => `${c} ${unit(i)} ${unit(i + 1)}`).join(", ");
  return bandPx == null ? `linear-gradient(90deg, ${stops})` : `repeating-linear-gradient(90deg, ${stops})`;
}

/** Width of one band in the indeterminate stripe (matches the Android app's 24dp). Must agree
 *  with `rb-slide`'s 168px (7 x 24) period in index.css. */
const BAND_PX = 24;

interface RainbowBarProps {
  /** 0-1 for a determinate meter; omit/null for the indeterminate sliding stripe. */
  progress?: number | null;
  /** Height/rounding/width classes - the bar fills its box. */
  className?: string;
}

/** The app's loading bar, matching the Android app's RainbowLinearIndicator. Indeterminate:
 *  ROYGBIV bands repeating across the width and sliding steadily right (a translated layer, so
 *  compositor-only). Determinate: the seven bands span the full width as a fixed red-to-violet
 *  meter, revealed up to the current fraction over a faint track. */
export function RainbowBar({ progress, className = "" }: RainbowBarProps) {
  if (progress == null) {
    return (
      <div className={`relative overflow-hidden ${className}`} role="progressbar" aria-label="Loading">
        <div
          className="rainbow-slide absolute inset-y-0"
          style={{ left: -BAND_PX * RAINBOW_STRIPES.length, right: 0, backgroundImage: stripes(BAND_PX) }}
        />
      </div>
    );
  }
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div
      className={`relative overflow-hidden bg-black/10 dark:bg-white/10 ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className="absolute inset-0 transition-[clip-path] duration-300"
        style={{ backgroundImage: stripes(null), clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      />
    </div>
  );
}
