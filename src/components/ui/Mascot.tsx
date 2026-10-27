import mascotUrl from "../../assets/mascot.png";

interface MascotProps {
  /** Rendered size in px (square). */
  size?: number;
  /** "happy" for loading/greeting; "sad" tilts and desaturates him for errors / empty results. */
  mood?: "happy" | "sad";
  /** Idle bob (default on). Off when a parent bobs a larger unit, e.g. the companion's backdrop. */
  bob?: boolean;
  className?: string;
}

/** The app's raccoon mascot (paper-cut art, src/assets/mascot.png - a 384px downscale of the
 *  project owner's raccute2.png). Bobs gently unless motion is reduced. */
export function Mascot({ size = 96, mood = "happy", bob = true, className = "" }: MascotProps) {
  return (
    <img
      src={mascotUrl}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={`${bob ? "mascot-bob" : ""} select-none drop-shadow-[0_6px_14px_rgb(0_0_0/0.25)] ${
        mood === "sad" ? "grayscale-[0.55] opacity-80 [rotate:-6deg]" : ""
      } ${className}`}
    />
  );
}
