import { useEffect, useRef, useState } from "react";
import { motionReduced } from "../../lib/theme";

const DOTS = 8;

interface BurstProps {
  /** Bump this (e.g. a counter) to fire a burst. 0 = never fired. */
  trigger: number;
  color?: string;
  /** How far the dots fly, in px. */
  radius?: number;
}

/** A ring of dots that flies outward from the centre of its (relatively positioned) parent -
 *  the favourite "pop". Purely decorative; renders nothing between bursts. */
export function Burst({ trigger, color = "#f472b6", radius = 18 }: BurstProps) {
  const [active, setActive] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (trigger === 0 || motionReduced()) return;
    setActive(trigger);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActive(0), 600);
    return () => window.clearTimeout(timer.current);
  }, [trigger]);

  if (!active) return null;
  return (
    <span key={active} aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {Array.from({ length: DOTS }, (_, i) => {
        const angle = (i / DOTS) * Math.PI * 2;
        const r = radius * (i % 2 ? 0.75 : 1);
        return (
          <span
            key={i}
            className="burst-dot"
            style={
              {
                backgroundColor: color,
                "--dx": `${Math.cos(angle) * r}px`,
                "--dy": `${Math.sin(angle) * r}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </span>
  );
}

/** Tweens a displayed number toward `value` (~400ms ease-out) whenever it changes - the score
 *  counting up after a vote. Jumps straight there with motion reduced or on a new post. */
export function useAnimatedNumber(value: number, resetKey?: unknown): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const lastKey = useRef(resetKey);

  useEffect(() => {
    if (lastKey.current !== resetKey || motionReduced()) {
      lastKey.current = resetKey;
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 400);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(a + (value - a) * eased);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, resetKey]);

  return shown;
}

export interface ReactionFx {
  /** Bumped when the post becomes favourited - feed to <Burst trigger>. */
  favBurst: number;
  /** Bumped on any favourite change - key the heart icon wrapper on it to replay heart-pop. */
  heartKey: number;
  /** Bumped on any vote change; voteDir says which way to bounce. */
  voteKey: number;
  voteDir: 1 | -1;
}

/** Watches a post's favourite/vote state and reports changes as animation triggers. Changes that
 *  come with a different post id (navigating) don't count - only the user's own toggles. */
export function useReactionFx(postId: number, isFavorited: boolean, voteBy: number): ReactionFx {
  const prev = useRef({ postId, isFavorited, voteBy });
  const [fx, setFx] = useState<ReactionFx>({ favBurst: 0, heartKey: 0, voteKey: 0, voteDir: 1 });

  useEffect(() => {
    const p = prev.current;
    prev.current = { postId, isFavorited, voteBy };
    if (p.postId !== postId) return;
    if (p.isFavorited !== isFavorited) {
      setFx((f) => ({
        ...f,
        heartKey: f.heartKey + 1,
        favBurst: isFavorited ? f.favBurst + 1 : f.favBurst,
      }));
    }
    if (p.voteBy !== voteBy) {
      const dir: 1 | -1 = voteBy > 0 || (voteBy === 0 && p.voteBy < 0) ? 1 : -1;
      setFx((f) => ({ ...f, voteKey: f.voteKey + 1, voteDir: dir }));
    }
  }, [postId, isFavorited, voteBy]);

  return fx;
}
