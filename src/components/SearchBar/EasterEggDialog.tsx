import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import eggImage from "../../assets/egg.png";
import { IconButton } from "../ui/IconButton";
import { ConfettiBurst } from "../Tagdle/Confetti";
import { MascotLayer } from "../Mascot/MascotLayer";
import { addSummon, isEggMuted, isGolden, setEggMuted, summonLine, summonTitle } from "../../lib/easterEgg";
import { playDrumrollSting } from "../../lib/eggSound";
import { motionReduced } from "../../lib/theme";
import { mascotReact } from "../../state/mascotStore";
import { useSettingsStore } from "../../state/settingsStore";

interface EasterEggDialogProps {
  onClose: () => void;
}

/** The character on the card - the app owner's own raccoon, not the mascot (Gus). */
const EGG_CHARACTER = "Procione";
const TYPE_MS_PER_CHAR = 45;
const MIN_ROLL_MS = 1200;
const EXIT_MS = 450;
const MAX_TILT_DEG = 12;
const SPARKLES = [
  { top: "12%", left: "18%", delay: "0s" },
  { top: "28%", left: "78%", delay: "0.7s" },
  { top: "64%", left: "12%", delay: "1.3s" },
  { top: "80%", left: "70%", delay: "0.4s" },
  { top: "46%", left: "52%", delay: "1.9s" },
];

/** Typing "cooter" into the search bar (SearchBar.tsx) summons this instead of a search. Started
 *  as a port of the reference Android app's EasterEggDialog; now a whole production:
 *  - entrance: the screen dims, the headline types itself out over a synthesised drumroll, then
 *    the card bursts in (shockwave + rainbow confetti + sting)
 *  - a holographic trading card: 3D tilt toward the pointer, foil sheen, twinkling sparkles; click
 *    to flip to a stats back. Golden foil from the 10th summon (lib/easterEgg.ts counts them)
 *  - Gus (the mascot) reacts to Procione on open and swears you to secrecy on close
 *  - spins away on close
 *  - the art is explicit, so with Explicit off it sits behind a censor panel until clicked */
export function EasterEggDialog({ onClose }: EasterEggDialogProps) {
  // Counted once per summon (ref-guarded: effects can double-run in dev).
  const summonsRef = useRef<number | null>(null);
  if (summonsRef.current === null) summonsRef.current = addSummon();
  const summons = summonsRef.current;
  const golden = isGolden(summons);
  const line = useMemo(() => summonLine(summons), [summons]);

  const explicitAllowed = useSettingsStore((s) => s.adultModeEnabled && s.enabledRatings.includes("e"));
  const [censored, setCensored] = useState(!explicitAllowed);

  const reduced = motionReduced();
  const [typed, setTyped] = useState(reduced ? line.length : 0);
  const [revealed, setRevealed] = useState(reduced);
  const [leaving, setLeaving] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [muted, setMuted] = useState(isEggMuted);
  const [tilt, setTilt] = useState({ x: 0, y: 0, px: 50, py: 50 });

  // Entrance: type the line while the drumroll builds, reveal the card on the sting.
  useEffect(() => {
    if (reduced) return;
    const rollMs = Math.max(MIN_ROLL_MS, line.length * TYPE_MS_PER_CHAR + 250);
    const stopSound = isEggMuted() ? () => {} : playDrumrollSting(rollMs, golden);
    let i = 0;
    const typer = window.setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= line.length) window.clearInterval(typer);
    }, TYPE_MS_PER_CHAR);
    const reveal = window.setTimeout(() => setRevealed(true), rollMs + 50);
    return () => {
      window.clearInterval(typer);
      window.clearTimeout(reveal);
      stopSound();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The mascot sees what you summoned.
  useEffect(() => {
    if (revealed) mascotReact("eggSpotted");
  }, [revealed]);

  function close() {
    if (leaving) return;
    mascotReact("eggClosed");
    if (reduced) {
      onClose();
      return;
    }
    setLeaving(true);
    window.setTimeout(onClose, EXIT_MS);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 2 * MAX_TILT_DEG, y: (px - 0.5) * 2 * MAX_TILT_DEG, px: px * 100, py: py * 100 });
  }

  const cardStyle = {
    "--foil-x": `${tilt.px}%`,
    "--foil-y": `${tilt.py}%`,
    transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y + (flipped ? 180 : 0)}deg)`,
  } as CSSProperties;

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/80
                  ${leaving ? "animate-[fade-out_450ms_ease-in_forwards]" : "animate-[fade-in_300ms_ease-out]"}`}
      onClick={close}
    >
      <MascotLayer inOverlay />

      <p className={`min-h-[1.5em] px-6 text-center text-lg font-black text-white drop-shadow ${golden ? "egg-golden-text" : ""}`}>
        {line.slice(0, typed)}
        {typed < line.length && <span className="egg-caret">▍</span>}
      </p>

      {revealed && (
        <div
          className={`relative ${leaving ? "egg-exit" : reduced ? "" : "egg-burst"}`}
          style={{ perspective: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          {!reduced && !leaving && <div className="egg-shockwave pointer-events-none absolute inset-0" />}
          {!reduced && <ConfettiBurst variant="rainbow" count={golden ? 140 : 90} />}

          <div
            className="egg-card relative h-[min(70vh,480px)] w-[min(80vw,340px)] cursor-pointer"
            style={cardStyle}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setTilt({ x: 0, y: 0, px: 50, py: 50 })}
            onClick={() => setFlipped((f) => !f)}
            title={flipped ? "Click to flip back" : "Click to flip"}
          >
            {/* Front */}
            <div className={`egg-face ${golden ? "egg-frame-golden" : "egg-frame"}`}>
              <div className="relative h-full w-full overflow-hidden rounded-[calc(var(--radius-lg)-4px)]">
                <div className="rainbow-scroll absolute inset-0" />
                <img
                  src={eggImage}
                  alt=""
                  draggable={false}
                  className={`absolute inset-0 h-full w-full object-contain p-5 transition-[filter] duration-300 ${censored ? "blur-2xl" : ""}`}
                />
                <div className={`egg-foil pointer-events-none absolute inset-0 ${golden ? "egg-foil-golden" : ""}`} />
                {!reduced &&
                  SPARKLES.map((s, i) => (
                    <span
                      key={i}
                      className="egg-sparkle pointer-events-none absolute select-none text-lg"
                      style={{ top: s.top, left: s.left, animationDelay: s.delay }}
                    >
                      ✨
                    </span>
                  ))}
                {censored && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCensored(false);
                    }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white backdrop-blur-sm"
                  >
                    <span className="text-5xl">🙈</span>
                    <span className="text-sm font-bold">Explicit is turned off</span>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25">
                      Click to peek anyway
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Back - Procione's stats */}
            <div className={`egg-face egg-back ${golden ? "egg-frame-golden" : "egg-frame"}`}>
              <div className="flex h-full w-full flex-col rounded-[calc(var(--radius-lg)-4px)] bg-gradient-to-b from-neutral-900 to-neutral-800 p-5 text-white">
                <div className="flex items-baseline justify-between border-b border-white/15 pb-2">
                  <span className="text-2xl font-black">
                    {EGG_CHARACTER}
                    <span className="ml-1.5 text-xs font-semibold opacity-50">a.k.a. "the magic word"</span>
                  </span>
                  <span className="text-sm font-bold text-red-400">HP 621</span>
                </div>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
                  <dt className="opacity-60">Rarity</dt>
                  <dd className={golden ? "egg-golden-text font-bold" : "text-amber-300"}>
                    ★★★★★{golden && " GOLDEN"}
                  </dd>
                  <dt className="opacity-60">Type</dt>
                  <dd>Trash Panda</dd>
                  <dt className="opacity-60">Special move</dt>
                  <dd>Crossed Arms</dd>
                  <dt className="opacity-60">Weakness</dt>
                  <dd>Being looked at</dd>
                  <dt className="opacity-60">Summoned</dt>
                  <dd className="font-bold tabular-nums">
                    {summons} {summons === 1 ? "time" : "times"}
                  </dd>
                  <dt className="opacity-60">Your title</dt>
                  <dd className={golden ? "egg-golden-text font-bold" : "font-semibold"}>{summonTitle(summons)}</dd>
                </dl>
                <p className="mt-auto text-center text-[11px] italic opacity-50">
                  "Ah ah ah! You didn't say the magic word." — someone who never typed it
                </p>
                <p className="mt-2 flex items-center justify-center gap-1 text-[11px] opacity-40">
                  <RotateCcw size={11} /> click to flip back
                </p>
              </div>
            </div>
          </div>

          <div className="absolute -right-12 top-0 flex flex-col gap-1">
            <IconButton tone="invert" onClick={close} title="Close (Esc)">
              <X size={18} />
            </IconButton>
            <IconButton
              tone="invert"
              onClick={() => {
                setEggMuted(!muted);
                setMuted(!muted);
              }}
              title={muted ? "Unmute fanfare" : "Mute fanfare"}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
