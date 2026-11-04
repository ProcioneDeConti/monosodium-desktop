import { RAINBOW_STRIPES } from "./RainbowBar";

interface SpinnerProps {
  size?: number;
  className?: string;
}

/** The app's standard indeterminate spinner, matching the Android app's RainbowSpinner
 *  (ui/components/RainbowRefreshIndicator.kt): an arc that spins while its length breathes in
 *  and out, drawn as seven consecutive solid ROYGBIV bands (red at the tail, violet at the head).
 *  Pure CSS - `.rainbow-spinner` in index.css animates the shared `--rb-sweep` angle, and each band
 *  derives its dash length/offset from it - so it costs no JS per frame. Kept as one component so
 *  every "this is loading" moment in the app looks the same. */
export function Spinner({ size = 16, className = "" }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`rainbow-spinner shrink-0 ${className}`}
      role="progressbar"
      aria-label="Loading"
    >
      <g transform="rotate(-90 12 12)" fill="none" strokeWidth={3}>
        {RAINBOW_STRIPES.map((color, i) => (
          <circle
            key={color}
            cx={12}
            cy={12}
            r={10}
            stroke={color}
            className="rainbow-spinner-band"
            style={{ ["--i" as string]: i, ["--last" as string]: i === RAINBOW_STRIPES.length - 1 ? 1 : 0 }}
          />
        ))}
      </g>
    </svg>
  );
}
