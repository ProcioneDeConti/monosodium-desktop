import type { CSSProperties } from "react";
import mascotUrl from "../../assets/mascot.png";

interface MascotProps {
  /** Rendered size in px (square). */
  size?: number;
  /** "happy" for loading/greeting; "sad" tilts him and gives him an anime-style gloom face
   *  (blue, vertically striped shading over the top of his face) for errors / empty results;
   *  "asleep" puts a sleep mask over his eyes (Pocket Gus's bed); "listening" puts headphones on
   *  him (the Games panel's music player album-art fallback). */
  mood?: "happy" | "sad" | "asleep" | "listening";
  /** Idle bob (default on). Off when a parent bobs a larger unit, e.g. the companion's backdrop. */
  bob?: boolean;
  className?: string;
}

/** The gloom shading: blue with darker vertical stripes, masked to his own silhouette (the PNG's
 *  alpha) and to the upper face - fading out just below the eyes, and away from the cheek edges. */
const GLOOM: CSSProperties = {
  background:
    "repeating-linear-gradient(90deg, rgb(30 60 170 / 0.45) 0 1.5px, transparent 1.5px 6px), rgb(70 120 230 / 0.5)",
  maskImage: `url(${mascotUrl}), linear-gradient(to bottom, transparent 22%, black 32%, black 46%, transparent 58%), linear-gradient(to right, transparent 18%, black 30%, black 70%, transparent 82%)`,
  maskSize: "100% 100%",
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in",
  mixBlendMode: "multiply",
};

/** The app's raccoon mascot (paper-cut art, src/assets/mascot.png - a 384px downscale of the
 *  project owner's raccute2.png). Bobs gently unless motion is reduced. */
export function Mascot({ size = 96, mood = "happy", bob = true, className = "" }: MascotProps) {
  const img = (cls: string) => (
    <img
      src={mascotUrl}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={`select-none drop-shadow-[0_6px_14px_rgb(0_0_0/0.25)] ${cls}`}
    />
  );
  if (mood === "asleep" || mood === "listening") {
    return (
      <span className={`relative inline-block ${bob ? "mascot-bob" : ""} ${className}`} style={{ width: size, height: size }}>
        {img("block")}
        {mood === "asleep" ? <SleepMask /> : <Headphones />}
      </span>
    );
  }
  if (mood !== "sad") return img(`${bob ? "mascot-bob" : ""} ${className}`);
  return (
    <span className={`relative inline-block [rotate:-6deg] ${bob ? "mascot-bob" : ""} ${className}`} style={{ width: size, height: size }}>
      {img("block")}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={GLOOM} />
    </span>
  );
}

/** A padded lavender sleep mask with stitched closed eyes, sat over his eyes in the art
 *  (they're at roughly 39% / 61% across, 47% down), its strap running off behind his head. */
function SleepMask() {
  return (
    <svg aria-hidden viewBox="0 0 100 34" className="pointer-events-none absolute left-[20%] top-[38%] w-[60%] drop-shadow-[0_2px_2px_rgb(0_0_0/0.35)]">
      {/* Strap. */}
      <path d="M0 15 Q10 12 18 14 M82 14 Q90 12 100 15" stroke="#4b3a6b" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* Two padded lobes with a dip over the nose. */}
      <path
        d="M16 10 Q16 2 32 2 Q44 2 50 8 Q56 2 68 2 Q84 2 84 10 L84 18 Q84 30 68 30 Q56 30 50 23 Q44 30 32 30 Q16 30 16 18 Z"
        fill="#9b84c9"
        stroke="#5e4a86"
        strokeWidth="1.5"
      />
      <path d="M20 11 Q20 6 32 6 Q42 6 47 11" stroke="#c5b5e6" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8" />
      {/* Closed-eye embroidery, with lashes. */}
      <g stroke="#2d2145" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M24 16 Q32 23 40 16" />
        <path d="M60 16 Q68 23 76 16" />
        <path d="M27 19.5 l-2 3 M32 21 v3.5 M37 19.5 l2 3 M63 19.5 l-2 3 M68 21 v3.5 M73 19.5 l2 3" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

/** Over-ear headphones: a band arching over his crown (between the ears, which peak at roughly
 *  28% / 72% across, 18% down) down to a cup on each side of his head at cheek height (~53%). */
function Headphones() {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-[0_2px_2px_rgb(0_0_0/0.35)]">
      {/* Band, with a lighter padded strip along its top. */}
      <path d="M19 50 C16 14 84 14 81 50" stroke="#1f2430" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M27 30 C38 18 62 18 73 30" stroke="#4a5263" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Cups: dark shell, accent-colored outer plate. */}
      {[17, 83].map((cx) => (
        <g key={cx}>
          <rect x={cx - 7} y={42} width={14} height={23} rx={6} fill="#1f2430" stroke="#0d1017" strokeWidth="1.2" />
          <rect x={cx - 4} y={46} width={8} height={15} rx={3.5} fill="rgb(var(--accent))" />
          <rect x={cx - 2.5} y={48} width={2} height={7} rx={1} fill="white" opacity="0.45" />
        </g>
      ))}
    </svg>
  );
}
