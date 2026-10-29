import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Undo2 } from "lucide-react";
import { Mascot } from "../ui/Mascot";
import { ConfettiBurst } from "../Tagdle/Confetti";
import { MASCOT_NAME, REACTIONS, type ReactionKind } from "../../lib/mascot";
import { motionReduced } from "../../lib/theme";
import { mascotReact, useMascotStore, type ActiveReaction } from "../../state/mascotStore";
import { useSettingsStore, type MascotCorner } from "../../state/settingsStore";

const COMPANION_PX = 56;
const CAMEO_PX = 72;
/** Companion fades to this while the pointer is near, so it never blocks a thumbnail. */
const NEAR_PX = 110;
const DRAG_THRESHOLD_PX = 6;
const UNDO_VISIBLE_MS = 6000;

const FEED_PARTICLE_MS = 1700;
const THOUGHTS = ["🤔", "💭", "🧮", "📊", "💡"];
const THOUGHT_EVERY_MS = 1400;
const FEED_STAGGER_MS = 110;

interface FeedParticle {
  key: string;
  emoji: string;
  /** px offset from the stage's centre where it spawns, and its sideways drift. */
  x: number;
  dx: number;
  rot: number;
  size: number;
  delay: number;
}

/** Live-stream-style reaction feed: each reaction releases a handful of symbols that drift up
 *  with a little sway, staggered, then fade. Owns its particles so a burst keeps flying after
 *  the reaction itself ends (and overlapping bursts just stack). */
function EmojiFeed({ trigger }: { trigger: { id: number; emoji: string[]; count: number } | null }) {
  const [particles, setParticles] = useState<FeedParticle[]>([]);
  const lastId = useRef<number | null>(null);
  useEffect(() => {
    if (!trigger || trigger.id === lastId.current) return;
    lastId.current = trigger.id;
    const burst: FeedParticle[] = Array.from({ length: trigger.count }, (_, i) => ({
      key: `${trigger.id}-${i}`,
      emoji: trigger.emoji[Math.floor(Math.random() * trigger.emoji.length)],
      x: (Math.random() - 0.5) * 22,
      dx: (Math.random() - 0.5) * 36,
      rot: (Math.random() - 0.5) * 40,
      size: 14 + Math.round(Math.random() * 8),
      delay: i * FEED_STAGGER_MS + Math.random() * 60,
    }));
    setParticles((p) => [...p, ...burst]);
    const keys = new Set(burst.map((b) => b.key));
    const total = FEED_PARTICLE_MS + trigger.count * FEED_STAGGER_MS + 100;
    window.setTimeout(() => setParticles((p) => p.filter((x) => !keys.has(x.key))), total);
  }, [trigger]);

  return (
    <div className="pointer-events-none absolute left-1/2 top-1 h-0 w-0">
      {particles.map((p) => (
        <span
          key={p.key}
          className="mascot-feed absolute select-none leading-none drop-shadow"
          style={
            {
              left: p.x - p.size / 2,
              top: -p.size / 2,
              fontSize: p.size,
              animationDelay: `${p.delay}ms`,
              "--feed-dx": `${p.dx}px`,
              "--feed-rot": `${p.rot}deg`,
              "--feed-dur": `${FEED_PARTICLE_MS}ms`,
            } as CSSProperties
          }
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

/** A comic speech bubble beside Gus, vertically centred on him, tail pointing back at him; pops
 *  out from the tail end. A line can carry a smaller aside after "¦" ("Main line¦aside"). */
export function SpeechBubble({ line, side, reduced }: { line: string; side: "left" | "right"; reduced: boolean }) {
  const [main, aside] = line.split("¦").map((t) => t.trim());
  const right = side === "right";
  return (
    <div
      className={`pointer-events-none absolute top-1/2 z-[1] w-max max-w-[230px] -translate-y-1/2
                  ${right ? "left-full ml-3.5" : "right-full mr-3.5"}`}
    >
      <div
        className={`relative rounded-2xl border-2 border-black/80 bg-white px-3 py-1.5 text-[13px] font-semibold
                    leading-snug text-black shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]
                    dark:border-white/80 dark:bg-neutral-900 dark:text-white
                    ${reduced ? "" : right ? "mascot-bubble origin-left" : "mascot-bubble origin-right"}`}
      >
        {main}
        {aside && <span className="mt-0.5 block text-[10px] font-medium italic opacity-60">{aside}</span>}
        {/* Tail: a bordered square turned 45deg, half tucked behind the bubble's edge. */}
        <span
          aria-hidden
          className={`absolute top-1/2 h-3 w-3 border-2 border-black/80 bg-white dark:border-white/80 dark:bg-neutral-900
                      ${right ? "-left-[7px] border-r-0 border-t-0" : "-right-[7px] border-b-0 border-l-0"}`}
          style={{ transform: "translateY(-50%) rotate(45deg)" }}
        />
      </div>
    </div>
  );
}

/** The raccoon plus whatever it's doing: reaction motion, floating symbol, speech bubble, sleep.
 *  `bubbleSide` keeps the bubble on-screen (it opens away from the nearest edge). */
function MascotStage({
  active,
  sleeping,
  size,
  bubbleSide,
  backdrop = false,
  thinking = false,
}: {
  /** Mulling something over: a slow chin-scratch tilt, with 🤔💭🧮 drifting up now and then. */
  thinking?: boolean;
  /** Frosted squircle behind him, inside the motion wrapper so it hops/tilts/bobs with him. */
  backdrop?: boolean;
  active: ActiveReaction | null;
  sleeping: boolean;
  size: number;
  /** Which side of him the speech bubble sits on - away from the nearest screen edge. */
  bubbleSide: "left" | "right";
}) {
  const reduced = motionReduced();
  const def = active ? REACTIONS[active.kind] : null;
  const motionClass = reduced
    ? ""
    : def
      ? `mascot-m-${def.motion}`
      : thinking
        ? "mascot-thinking"
        : sleeping
          ? "mascot-sleeping"
          : "";
  // While thinking, release a single thought emoji every so often through the same feed.
  const [thought, setThought] = useState<{ id: number; emoji: string[] } | null>(null);
  useEffect(() => {
    if (!thinking || reduced) return;
    let n = 0;
    const tick = () => setThought({ id: -++n, emoji: [THOUGHTS[n % THOUGHTS.length]] });
    tick();
    const id = window.setInterval(tick, THOUGHT_EVERY_MS);
    return () => window.clearInterval(id);
  }, [thinking, reduced]);

  return (
    <div className="relative" style={{ width: size + (backdrop ? 12 : 0), height: size + (backdrop ? 12 : 0) }}>
      <div key={active?.id ?? "idle"} className={`mascot-motion ${motionClass}`}>
        {backdrop ? (
          <div className="mascot-bob">
            <div
              className="rounded-[30%] border border-black/5 bg-white/55 p-1.5 shadow-[0_6px_18px_-4px_rgb(0_0_0/0.35)]
                         backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/55"
            >
              <Mascot size={size} bob={false} />
            </div>
          </div>
        ) : (
          <Mascot size={size} />
        )}
      </div>

      {reduced ? (
        active &&
        active.emoji.length > 0 && (
          <div className="pointer-events-none absolute -top-2 right-0 select-none text-lg leading-none">
            {active.emoji[0]}
          </div>
        )
      ) : (
        <EmojiFeed
          trigger={
            active && active.emoji.length > 0
              ? { id: active.id, emoji: active.emoji, count: def?.burst ?? 4 }
              : thinking && thought
                ? { id: thought.id, emoji: thought.emoji, count: 1 }
                : null
          }
        />
      )}

      {(active?.kind === "milestone" || active?.kind === "gameWin") && !reduced && (
        <ConfettiBurst key={active.id} variant={active.kind === "gameWin" ? "rainbow" : "confetti"} />
      )}

      {sleeping && !active && (
        <div className="pointer-events-none absolute -top-3 right-0 text-xs font-bold text-[rgb(var(--accent))]">
          <span className={reduced ? "" : "mascot-zzz inline-block"}>z</span>
          <span className={reduced ? "" : "mascot-zzz inline-block [animation-delay:1s]"}>z</span>
          <span className={reduced ? "" : "mascot-zzz inline-block [animation-delay:2s]"}>z</span>
        </div>
      )}

      {active?.line && <SpeechBubble key={`b${active.id}`} line={active.line} side={bubbleSide} reduced={reduced} />}
    </div>
  );
}

const CORNER_CLASS: Record<MascotCorner, string> = {
  // bottom-right clears PostGrid's back-to-top / page pills (bottom-4 right-5).
  br: "bottom-16 right-5",
  bl: "bottom-3 left-4",
  tr: "top-3 right-4",
  tl: "top-3 left-4",
};

/** Persistent corner raccoon. Click = pet; drag = move to whichever corner it's dropped nearest
 *  (remembered); right-click = hide until restart. */
function Companion({
  active,
  sleeping,
  thinking,
  onPet,
}: {
  active: ActiveReaction | null;
  sleeping: boolean;
  thinking: boolean;
  /** Replaces petting (the Dashboard makes a click mean "tell me something else"). */
  onPet?: () => void;
}) {
  const corner = useSettingsStore((s) => s.mascotCorner);
  const setCorner = useSettingsStore((s) => s.setMascotCorner);
  const pet = useMascotStore((s) => s.pet);
  const dragged = useMascotStore((s) => s.dragged);
  const hide = useMascotStore((s) => s.hideForSession);
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Fade when the pointer comes close - window-level so it works without hovering him.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (dragStart.current) return;
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const isNear = Math.hypot(dx, dy) < NEAR_PX && !(dx === 0 && dy === 0);
      setNear((n) => (n === isNear ? n : isNear));
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = dragStart.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    s.moved = true;
    setDrag({ dx, dy });
  }
  function onPointerUp(e: React.PointerEvent) {
    const s = dragStart.current;
    dragStart.current = null;
    setDrag(null);
    if (!s) return;
    if (!s.moved) {
      (onPet ?? pet)();
      return;
    }
    dragged();
    // Snap to the corner of the grid area nearest the drop point.
    const host = ref.current?.offsetParent?.getBoundingClientRect();
    if (!host) return;
    const right = e.clientX > host.left + host.width / 2;
    const bottom = e.clientY > host.top + host.height / 2;
    setCorner(`${bottom ? "b" : "t"}${right ? "r" : "l"}` as MascotCorner);
  }

  return (
    <div
      ref={ref}
      role="button"
      aria-label={`${MASCOT_NAME} - click to pet, drag to move, right-click to hide`}
      title={`${MASCOT_NAME} · click to pet · drag to move · right-click to hide`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragStart.current = null;
        setDrag(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        hide();
      }}
      style={drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
      className={`absolute z-[6] touch-none select-none ${CORNER_CLASS[corner]}
                  ${drag ? "cursor-grabbing" : "cursor-grab"}
                  transition-opacity duration-200 ${near && !active && !drag ? "opacity-30" : "opacity-100"}`}
    >
      {/* Frosted squircle (pinned to him via `backdrop`) - keeps him readable over white posts. */}
      <MascotStage
        active={active}
        sleeping={sleeping}
        size={COMPANION_PX}
        bubbleSide={corner.endsWith("r") ? "left" : "right"}
        backdrop
        thinking={thinking}
      />
    </div>
  );
}

/** Nothing on screen until a reaction fires; then he peeks up from the bottom edge (on the
 *  companion corner's side), does it, and ducks away. */
function Cameo({ active }: { active: ActiveReaction | null }) {
  const corner = useSettingsStore((s) => s.mascotCorner);
  if (!active) return null;
  const def = REACTIONS[active.kind];
  const duration = def.durationMs + (active.line ? 1800 : 0) + 600;
  const right = corner.endsWith("r");
  return (
    <div
      key={active.id}
      className={`pointer-events-none absolute bottom-0 z-[6] overflow-visible ${right ? "right-6" : "left-6"}`}
    >
      <div
        className={motionReduced() ? "" : "mascot-peek"}
        style={{ "--mascot-dur": `${duration}ms` } as CSSProperties}
      >
        <MascotStage
          active={active}
          sleeping={false}
          size={CAMEO_PX}
          bubbleSide={right ? "left" : "right"}
        />
      </div>
    </div>
  );
}

/** Mounted inside the grid area (positioned parent). Picks companion / cameo / nothing from
 *  Settings; `suppressed` hides it while something else owns the grid (multi-select). The viewer,
 *  Games and other sheets are full-screen overlays above the grid, so they cover it already. */
export function MascotLayer({
  suppressed,
  inOverlay,
  onPet,
}: {
  suppressed?: boolean;
  inOverlay?: boolean;
  onPet?: () => void;
}) {
  const mode = useSettingsStore((s) => s.mascotMode);
  // Inside a sheet (Games), reactions should play live here rather than be held for the grid.
  const registerOverlayHost = useMascotStore((s) => s.registerOverlayHost);
  useEffect(() => (inOverlay ? registerOverlayHost() : undefined), [inOverlay, registerOverlayHost]);
  const active = useMascotStore((s) => s.active);
  const sleeping = useMascotStore((s) => s.sleeping);
  const thinking = useMascotStore((s) => s.thinking > 0);
  const hidden = useMascotStore((s) => s.hiddenForSession);
  // Only one Gus on screen: while a panel hosts its own (Games, Dashboard - including Pocket Gus
  // and Talk to Gus, whose host layer is suppressed for their big Gus), the grid's steps aside.
  const hostedElsewhere = useMascotStore((s) => !inOverlay && s.overlayHosts > 0);
  if (mode === "off" || suppressed || hostedElsewhere) return null;
  if (hidden) return <HiddenUndoPill />;
  return mode === "companion" ? (
    <Companion active={active} sleeping={sleeping} thinking={thinking} onPet={onPet} />
  ) : (
    <Cameo active={active} />
  );
}

/** "Gus hidden - Undo", shown in his corner for a few seconds after a right-click hide.
 *  Settings > Appearance > Mascot has a Restore for after it's gone. */
function HiddenUndoPill() {
  const corner = useSettingsStore((s) => s.mascotCorner);
  const restore = useMascotStore((s) => s.restore);
  const hiddenAt = useMascotStore((s) => s.hiddenAt) ?? 0;
  const remaining = hiddenAt + UNDO_VISIBLE_MS - Date.now();
  const [visible, setVisible] = useState(remaining > 0);
  useEffect(() => {
    if (remaining <= 0) return;
    const t = window.setTimeout(() => setVisible(false), remaining);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenAt]);
  if (!visible) return null;
  return (
    <div
      role="status"
      className={`absolute z-[6] flex items-center gap-2 rounded-full border border-black/10 bg-white/90 py-1 pl-3 pr-1
                  text-xs shadow-lg backdrop-blur-md animate-[fade-in_160ms_ease-out]
                  dark:border-white/10 dark:bg-neutral-900/90 ${CORNER_CLASS[corner]}`}
    >
      <span className="opacity-75">{MASCOT_NAME} hidden</span>
      <button
        type="button"
        onClick={restore}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-[rgb(var(--accent))]
                   hover:bg-[rgb(var(--accent))]/15"
      >
        <Undo2 size={13} />
        Undo
      </button>
    </div>
  );
}

/** Fires one reaction when mounted - drop it next to a game's verdict / win screen the same way
 *  `<ConfettiBurst />` is. Renders nothing. */
export function MascotCue({ kind }: { kind: ReactionKind }) {
  useEffect(() => {
    mascotReact(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
