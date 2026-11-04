import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  addBrick,
  createWall,
  courseCount,
  fontForWeight,
  touchesHole,
  touching,
  type Brick,
  type WallState,
} from "../../lib/brickWall";
import type { TasteTag } from "../../lib/tasteProfile";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { motionReduced } from "../../lib/theme";
import { Avatar } from "../ui/Avatar";

/** Exactly three courses tall (3 x 30 + 2 x 4 = 98px), so it sits flush in the wall: the
 *  courses just above and below it run straight across, and only the three it spans are cut. */
const AVATAR_R = 49;
const HOLE_R = AVATAR_R + 1;
const MAX_BRICKS = 48;
/** How many words the wall is sized for (useForYou's WALL_WORDS). */
const EXPECTED_WORDS = 40;
const GAP = 4;
const COURSE_H = 30;
/** Rough average brick length, for sizing the wall so the avatar ends up mid-wall. */
const AVG_BRICK_W = 100;

// Arrival rhythm: irregular, like someone actually laying them.
const INTERVAL_MIN_MS = 55;
const INTERVAL_MAX_MS = 190;

// Entrance: each brick appears a short way outside its slot (fading in), shoves inward along its
// own course - a path the layout guarantees is empty - and stops dead against its neighbour.
// It comes in a little crooked and straightens exactly as it seats; no positional overshoot.
const ENTRY_MIN_PX = 90;
const ENTRY_MAX_PX = 170;
const ENTRY_TILT_DEG = 7;
const FADE_PX = 45;
const SLIDE_V0 = 380;
const SLIDE_ACCEL = 2400;

// Settling: knocked bricks return to rest on a critically damped spring (no wobble back and forth).
const K = 170;
const C = 2 * Math.sqrt(K);
const BUMP = 120;
const BUMP_SPIN = 55; // deg/s
const AVATAR_BUMP = 80;
/** Impact speed that gives a 1x bump (faster hits push a little harder). */
const REF_IMPACT = 900;

// Big bricks: the strongest words (by weight relative to the top one) stand two or three courses
// tall with much larger text. Capped so the wall stays mostly ordinary bricks.
const BIG3_AT = 0.85;
const BIG2_AT = 0.55;
const MAX_BIG = 4;

// Hand-laid irregularity in each brick's resting pose.
const REST_TILT_DEG = 1.2;
const REST_DY_PX = 1;

interface Body {
  /** Offset from the resting pose. */
  ox: number;
  oy: number;
  rot: number;
  vx: number;
  vy: number;
  vr: number;
  /** Resting tilt (deg) and vertical nudge (px). */
  restRot: number;
  restDy: number;
  /** Entrance: tilt at the start, and the distance it slides. */
  entryTilt: number;
  entryDist: number;
  startAt: number;
  started: boolean;
  landed: boolean;
  speed: number;
  el: HTMLElement | null;
}

const NEUTRAL = new Set(["general", "lore", "meta"]);

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Rows the big words aim for: MAX_BIG positions spread evenly from the floor to a few courses
 *  below the top, handed out in random order (so the biggest isn't always at the bottom). */
function bigTargets(courses: number): number[] {
  const top = Math.max(0, courses - 3);
  const rows = Array.from({ length: MAX_BIG }, (_, i) =>
    Math.round((i * top) / Math.max(1, MAX_BIG - 1)),
  );
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows;
}

/** Centre of the middle course (counting from the floor), so the avatar spans whole courses. */
function avatarCy(boxH: number): number {
  const n = courseCount(boxH, COURSE_H, GAP);
  const c = Math.floor(n / 2);
  return boxH - (c + 1) * COURSE_H - c * GAP + COURSE_H / 2;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, px: number): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * px * 0.6;
  measureCtx.font = `700 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  return measureCtx.measureText(text).width;
}

function writeTransform(b: Brick, body: Body): void {
  if (!body.el) return;
  body.el.style.transform =
    `translate(${b.x + body.ox}px, ${b.y + body.restDy + body.oy}px) rotate(${body.restRot + body.rot}deg)`;
}

/** Things worth a remark as the wall goes up (Gus's live commentary - see ForYouPanel). */
export type WallEvent =
  | { type: "first"; word: string }
  | { type: "big"; word: string }
  | { type: "vertical"; word: string }
  | { type: "avatarBump"; word: string }
  | { type: "raccoon"; word: string }
  | { type: "count"; count: number }
  | { type: "topCourse"; word: string };

const RACCOON_WORDS = /raccoon|procyon|procione|red_panda|gus/i;
/** Landed-word counts that get a progress remark. */
const COUNT_MARKS = new Set([12, 25, 38]);

interface BrickWallProps {
  words: TasteTag[];
  avatarUrl: string | null;
  name: string;
  caption: ReactNode;
  onEvent?: (e: WallEvent) => void;
}

/** The "For you" loading screen: the profile's top tags are laid as bricks, each shoved into
 *  place against its neighbour, building a wall around the target user's avatar. Layout is
 *  lib/brickWall.ts (incremental - placed bricks never move); this owns only the motion, driven
 *  from one rAF loop that writes transforms straight to the DOM (no per-frame renders). */
export function BrickWall({ words, avatarUrl, name, caption, onEvent }: BrickWallProps) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const landedWordsRef = useRef(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const wallRef = useRef<WallState | null>(null);
  const triedRef = useRef(new Set<string>());
  const bodiesRef = useRef(new Map<string, Body>());
  const nextStartRef = useRef(0);
  const bigTargetsRef = useRef<number[] | null>(null);
  const bigAssignedRef = useRef(0);
  const pendingBigRef = useRef<{ word: TasteTag; span: number; minCourse: number }[]>([]);
  const avatarRef = useRef({ ox: 0, oy: 0, vx: 0, vy: 0, s: 0.4, vs: 0, el: null as HTMLElement | null });
  const rafRef = useRef<number | null>(null);
  const reducedRef = useRef(motionReduced());
  const [bricks, setBricks] = useState<Brick[]>([]);

  // Size the wall once from the space available (a fixed box keeps placed bricks stable).
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return false;
      // Width first, then just enough courses for EXPECTED_WORDS plus the avatar's cut-out, so
      // the avatar ends up set into the middle of the wall.
      const w = Math.round(Math.max(320, Math.min(r.width - 48, 760)));
      const maxCourses = courseCount(Math.max(200, r.height - 110), COURSE_H, GAP);
      // +3: one for the avatar's cut-out, two for the room the big bricks take.
      const want = Math.ceil((EXPECTED_WORDS * AVG_BRICK_W) / w) + 3;
      const courses = Math.max(6, Math.min(maxCourses, want));
      setBox({ w, h: courses * COURSE_H + (courses - 1) * GAP });
      return true;
    };
    if (measure()) return;
    const ro = new ResizeObserver(() => {
      if (measure()) ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** A landed brick knocks its touching neighbours (and the avatar) away from its centre. */
  const bump = useCallback((wall: WallState, b: Brick, strength: number): boolean => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    for (const n of touching(wall.bricks, b, GAP + 2)) {
      const nb = bodiesRef.current.get(n.id);
      if (!nb?.landed) continue;
      const dx = n.x + n.w / 2 - cx;
      const dy = n.y + n.h / 2 - cy;
      const len = Math.hypot(dx, dy) || 1;
      nb.vx += (dx / len) * BUMP * strength;
      nb.vy += (dy / len) * BUMP * strength * 0.5;
      // Knocked out of true a little: a side hit spins it, top/bottom hits barely.
      nb.vr += Math.sign(dx || 1) * BUMP_SPIN * strength * (Math.abs(dx) / len) * rnd(0.6, 1.2);
    }
    if (wall.hole && touchesHole(wall.hole, b, GAP + 6)) {
      const a = avatarRef.current;
      const dx = wall.hole.cx - cx;
      const dy = wall.hole.cy - cy;
      const len = Math.hypot(dx, dy) || 1;
      a.vx += (dx / len) * AVATAR_BUMP * strength;
      a.vy += (dy / len) * AVATAR_BUMP * strength * 0.5;
      a.vs -= 0.35 * strength;
      return true;
    }
    return false;
  }, []);

  /** Tell the panel about anything remarkable this landing did (most specific first). */
  const reportLanding = useCallback((wall: WallState, b: Brick, hitAvatar: boolean) => {
    const emit = onEventRef.current;
    landedWordsRef.current += 1;
    const count = landedWordsRef.current;
    if (!emit) return;
    if (count === 1) emit({ type: "first", word: b.name });
    else if (RACCOON_WORDS.test(b.name)) emit({ type: "raccoon", word: b.name });
    else if (b.span > 1 && !b.vertical) emit({ type: "big", word: b.name });
    else if (hitAvatar && b.span > 1) emit({ type: "avatarBump", word: b.name });
    else if (hitAvatar && Math.random() < 0.5) emit({ type: "avatarBump", word: b.name });
    else if (b.vertical) emit({ type: "vertical", word: b.name });
    else if (COUNT_MARKS.has(count)) emit({ type: "count", count });
    else if (b.course >= wall.courses.length - 1) emit({ type: "topCourse", word: b.name });
  }, []);

  const step = useCallback(() => {
    if (rafRef.current != null) return;
    let last = performance.now();
    const tick = (now: number) => {
      const wall = wallRef.current;
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      let active = false;

      for (const b of wall?.bricks ?? []) {
        const body = bodiesRef.current.get(b.id);
        if (!body?.el) continue;
        if (!body.started) {
          active = true;
          if (now < body.startAt) continue;
          body.started = true;
        }

        if (!body.landed) {
          // Shove straight at the slot; arrive exactly, never past it. Tilt and opacity both
          // follow the distance left, so it's square and solid exactly as it seats.
          body.speed += SLIDE_ACCEL * dt;
          const dist = Math.abs(body.ox);
          const move = body.speed * dt;
          if (move >= dist) {
            body.ox = body.rot = 0;
            body.landed = true;
            body.el.style.opacity = "1";
            const mass = b.vertical ? 1 : 1 + 0.6 * (b.span - 1);
            const hitAvatar = bump(wall!, b, Math.min(1.4, Math.max(0.5, body.speed / REF_IMPACT)) * mass);
            if (!b.cut) reportLanding(wall!, b, hitAvatar);
          } else {
            body.ox -= Math.sign(body.ox) * move;
            const left = Math.abs(body.ox) / body.entryDist;
            body.rot = body.entryTilt * left;
            body.el.style.opacity = String(Math.min(1, (body.entryDist - Math.abs(body.ox)) / FADE_PX));
          }
          active = true;
          writeTransform(b, body);
          continue;
        }

        body.vx += (-K * body.ox - C * body.vx) * dt;
        body.vy += (-K * body.oy - C * body.vy) * dt;
        body.vr += (-K * body.rot - C * body.vr) * dt;
        body.ox += body.vx * dt;
        body.oy += body.vy * dt;
        body.rot += body.vr * dt;
        const resting =
          Math.abs(body.ox) < 0.2 && Math.abs(body.oy) < 0.2 && Math.abs(body.rot) < 0.05 &&
          Math.abs(body.vx) < 3 && Math.abs(body.vy) < 3 && Math.abs(body.vr) < 1;
        if (resting) body.ox = body.oy = body.rot = body.vx = body.vy = body.vr = 0;
        else active = true;
        writeTransform(b, body);
      }

      const a = avatarRef.current;
      a.vs += (-K * (a.s - 1) - C * a.vs) * dt;
      a.s += a.vs * dt;
      a.vx += (-K * a.ox - C * a.vx) * dt;
      a.vy += (-K * a.oy - C * a.vy) * dt;
      a.ox += a.vx * dt;
      a.oy += a.vy * dt;
      const aRest =
        Math.abs(a.s - 1) < 0.002 && Math.abs(a.vs) < 0.02 &&
        Math.abs(a.ox) < 0.2 && Math.abs(a.oy) < 0.2 && Math.abs(a.vx) < 3 && Math.abs(a.vy) < 3;
      if (aRest) {
        a.s = 1;
        a.vs = a.ox = a.oy = a.vx = a.vy = 0;
      } else active = true;
      if (a.el) a.el.style.transform = `translate(${a.ox}px, ${a.oy}px) scale(${a.s})`;

      rafRef.current = active ? requestAnimationFrame(tick) : null;
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [bump, reportLanding]);

  // New words -> new bricks, queued at an irregular rhythm; already-placed bricks keep their slots.
  useEffect(() => {
    if (!box) return;
    if (!wallRef.current) {
      wallRef.current = createWall(
        box.w,
        box.h,
        { cx: box.w / 2, cy: avatarCy(box.h), r: HOLE_R },
        COURSE_H,
        GAP,
        Math.floor(Math.random() * 2 ** 31),
      );
    }
    const wall = wallRef.current;
    const reduced = reducedRef.current;
    const maxWeight = Math.max(0, ...words.map((w) => w.weight));
    if (!bigTargetsRef.current) bigTargetsRef.current = bigTargets(wall.courses.length);
    let added = 0;
    const wordCount = () => wall.bricks.filter((b) => !b.cut).length;

    /** Lay one word (big words may defer: null with nothing placed) and queue everything it laid
     *  - blank cut bricks closing off lower courses, then the word - for its entrance. */
    const place = (word: TasteTag, span: number, minCourse?: number): Brick | null => {
      const before = wall.bricks.length;
      const b = addBrick(
        wall,
        {
          name: word.name,
          category: word.category,
          fontPx: fontForWeight(word.weight, maxWeight),
          allowVertical: wordCount() >= 3,
          span,
          minCourse,
        },
        measureText,
      );
      for (const nb of wall.bricks.slice(before)) {
        const outward = nb.entry === "left" ? -1 : 1;
        const edgeRoom = nb.entry === "left" ? nb.x : box.w - nb.x - nb.w;
        const dist = Math.min(edgeRoom + 30, rnd(ENTRY_MIN_PX, ENTRY_MAX_PX));
        const now = performance.now();
        nextStartRef.current =
          Math.max(now, nextStartRef.current) + (nb.cut ? 0.5 : 1) * rnd(INTERVAL_MIN_MS, INTERVAL_MAX_MS);
        bodiesRef.current.set(nb.id, {
          ox: reduced ? 0 : outward * dist,
          oy: 0,
          rot: 0,
          vx: 0,
          vy: 0,
          vr: 0,
          restRot: rnd(-1, 1) * (nb.cut ? REST_TILT_DEG / 2 : nb.vertical ? REST_TILT_DEG * 0.6 : REST_TILT_DEG),
          restDy: Math.round(rnd(-REST_DY_PX, REST_DY_PX)),
          // Leading edge dips toward the wall it's being shoved along.
          entryTilt: reduced ? 0 : -outward * rnd(ENTRY_TILT_DEG * 0.5, ENTRY_TILT_DEG),
          entryDist: Math.max(1, dist),
          startAt: nextStartRef.current,
          started: false,
          landed: reduced,
          speed: SLIDE_V0,
          el: null,
        });
        added += 1;
      }
      return b;
    };

    /** Big words waiting for the wall to reach their row go in as soon as it does. `force`
     *  places any still waiting wherever the wall is now. */
    const flushBig = (force: boolean) => {
      const queue = pendingBigRef.current;
      for (let i = 0; i < queue.length; ) {
        const p = queue[i];
        if (wordCount() >= MAX_BRICKS) return;
        const b = place(p.word, p.span, force ? undefined : p.minCourse);
        if (b || force) queue.splice(i, 1);
        else i++;
      }
    };

    for (const word of words) {
      if (wordCount() >= MAX_BRICKS) break;
      if (triedRef.current.has(word.name)) continue;
      triedRef.current.add(word.name);
      const ratio = maxWeight > 0 ? word.weight / maxWeight : 0;
      const wantSpan = ratio >= BIG3_AT ? 3 : ratio >= BIG2_AT ? 2 : 1;
      const targets = bigTargetsRef.current;
      if (wantSpan > 1 && bigAssignedRef.current < targets.length) {
        // Spread the big words up the wall instead of piling them all at the bottom (they're
        // the strongest, so they'd otherwise be laid first): each waits for its own row.
        pendingBigRef.current.push({ word, span: wantSpan, minCourse: targets[bigAssignedRef.current++] });
      } else {
        place(word, 1);
      }
      flushBig(false);
    }
    // Out of words for now: anything still waiting goes in wherever the wall has got to.
    flushBig(true);
    if (added > 0) setBricks([...wall.bricks]);
  }, [words, box]);

  // Kick the loop after new bricks mount (their refs are attached by then).
  useEffect(() => {
    if (bricks.length === 0) return;
    if (reducedRef.current) {
      for (const b of bricks) {
        const body = bodiesRef.current.get(b.id);
        if (body?.el && !body.started) {
          body.started = true;
          writeTransform(b, body);
          body.el.style.opacity = "1";
        }
      }
      return;
    }
    step();
  }, [bricks, step]);

  // The avatar pops in once the box exists.
  useEffect(() => {
    if (!box) return;
    if (reducedRef.current) {
      avatarRef.current.s = 1;
      if (avatarRef.current.el) avatarRef.current.el.style.transform = "none";
    } else step();
  }, [box, step]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return (
    <div ref={hostRef} className="flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden">
      {box && (
        <div
          className="relative border-b-2 border-black/15 dark:border-white/15"
          style={{ width: box.w, height: box.h }}
        >
          {bricks.map((b) => {
            const style = TAG_CATEGORY_STYLE[b.category];
            const neutral = NEUTRAL.has(b.category);
            return (
              <span
                key={b.id}
                ref={(el) => {
                  const body = bodiesRef.current.get(b.id);
                  if (body && el && body.el !== el) {
                    body.el = el;
                    if (!body.started) writeTransform(b, body);
                  }
                }}
                title={b.cut ? undefined : b.name}
                className={`absolute left-0 top-0 flex select-none items-center justify-center overflow-hidden whitespace-nowrap
                            rounded-[var(--radius-sm)] font-bold leading-none opacity-0 shadow-sm will-change-transform
                            ${reducedRef.current ? "transition-opacity duration-300" : ""}
                            ${b.cut ? "bg-black/[.06] dark:bg-white/[.06]" : neutral ? "bg-black/10 dark:bg-white/15" : ""}`}
                style={{
                  width: b.w,
                  height: b.h,
                  fontSize: b.fontPx,
                  ...(neutral || b.cut ? {} : { backgroundColor: style.chipBg, color: style.chipFg }),
                }}
              >
                <span
                  style={b.vertical ? { writingMode: "vertical-rl", transform: "rotate(180deg)" } : undefined}
                >
                  {b.cut ? null : b.name.replace(/_/g, " ")}
                </span>
              </span>
            );
          })}

          <div
            ref={(el) => {
              avatarRef.current.el = el;
              if (el && avatarRef.current.s !== 1) el.style.transform = `scale(${avatarRef.current.s})`;
            }}
            className="absolute rounded-full ring-2 ring-[rgb(var(--accent))] shadow-lg will-change-transform"
            style={{
              left: box.w / 2 - AVATAR_R,
              top: avatarCy(box.h) - AVATAR_R,
              width: AVATAR_R * 2,
              height: AVATAR_R * 2,
            }}
          >
            <Avatar url={avatarUrl} name={name} size={AVATAR_R * 2} />
          </div>
        </div>
      )}
      <div className="flex flex-col items-center gap-2 text-sm">{caption}</div>
    </div>
  );
}
