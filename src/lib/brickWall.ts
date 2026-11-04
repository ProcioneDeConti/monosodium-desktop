// Layout for the "For you" loading wall, laid like real masonry: equal-height courses built from
// the floor up. Each course is two halves growing outward from a joint in the middle (or from
// the avatar's edges, for courses the avatar cuts through), so joints stagger course to course.
//
// The rules that make the animation physically honest (components/ForYou/BrickWall.tsx):
//   - every brick enters from the outer edge of its own half and slides inward along its own
//     course - everything outward of a half's frontier is still empty, so nothing ever passes
//     through another brick; it only ever stops against (bumps) the one it lands next to;
//   - vertical bricks only ever start a half (against the middle joint or the avatar), spanning
//     two or three courses, so they're never in anyone's path;
//   - when a half can't take the next word, its leftover length is closed with blank "cut"
//     bricks, so courses end flush at the walls instead of ragged, and no gaps are left behind.
// Placement is incremental: nothing ever moves once placed. Pure.

import type { TasteCategory } from "./tasteProfile";
import { seededRandom } from "./random";

export { seededRandom };

export interface WallHole {
  /** Centre, in box coordinates (y down). */
  cx: number;
  cy: number;
  /** Keep-out radius (avatar radius + padding). */
  r: number;
}

export type BrickEntry = "left" | "right";

export interface Brick {
  /** Unique key (word name, or `~cut-N` for blank cut bricks). */
  id: string;
  /** Empty for cut bricks. */
  name: string;
  category: TasteCategory;
  /** Blank cut brick closing off the end of a course. */
  cut: boolean;
  fontPx: number;
  vertical: boolean;
  /** Courses tall: 1 for a normal brick, 2-3 for big and vertical ones. */
  span: number;
  /** Top-left, box coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Bottom course it sits in (0 = floor). */
  course: number;
  /** Which outer edge it slides in from. */
  entry: BrickEntry;
  /** Insertion order. */
  index: number;
}

export interface BrickSpec {
  name: string;
  category: TasteCategory;
  fontPx: number;
  /** May stand on end, if a half is just starting and the word fits. */
  allowVertical: boolean;
  /** Courses tall for a big (strong) word: 2 or 3, if it can start a half; 1/undefined = normal. */
  span?: number;
  /** Big words only: lowest course it may start in. Until the wall gets that high, addBrick
   *  returns null *without placing anything* - the caller keeps it queued and retries. */
  minCourse?: number;
}

/** Text width in px for a given font size. Injected so tests don't need a canvas. */
export type MeasureText = (text: string, fontPx: number) => number;

interface Half {
  /** -1 = left half (grows leftward, bricks enter from the left edge); +1 = right half. */
  dir: -1 | 1;
  /** Left half: right edge of the next brick. Right half: left edge of the next brick. */
  frontier: number;
  closed: boolean;
  count: number;
  /** Counted toward `halfStarts` yet. */
  started: boolean;
}

interface Course {
  /** Top edge, box coordinates. */
  y: number;
  /** What the two halves grow away from: a joint point, the avatar's chord, or a vertical. */
  split: [number, number];
  halves: [Half, Half];
}

export interface WallState {
  width: number;
  height: number;
  courseH: number;
  gap: number;
  hole: WallHole | null;
  courses: Course[];
  bricks: Brick[];
  /** Halves started so far - every third one starts with a vertical brick when it can. */
  halfStarts: number;
  cuts: number;
  /** Seeded PRNG - irregularity that's still deterministic for a given seed. */
  rand: () => number;
}

const PAD_X = 0.7;
/** Middle joint shifts left/right of centre on alternate courses (running bond), by a random
 *  amount in this range so the joints don't line up on a rigid grid. */
const STAGGER_MIN = 12;
const STAGGER_MAX = 50;
/** A half with less than this left, that can't take the next word, is closed off. */
const CLOSE_BELOW = 110;
/** Longest blank cut brick; longer leftovers are split into several. */
const MAX_CUT = 96;
const MIN_CUT = 8;

export function courseCount(height: number, courseH: number, gap: number): number {
  return Math.max(0, Math.floor((height + gap) / (courseH + gap)));
}

/** Half-width of the avatar keep-out across the band [y0, y1], or 0 if the band misses it. */
function chordHalf(hole: WallHole, y0: number, y1: number): number {
  const d = hole.cy < y0 ? y0 - hole.cy : hole.cy > y1 ? hole.cy - y1 : 0;
  return d >= hole.r ? 0 : Math.sqrt(hole.r * hole.r - d * d);
}

function makeHalves(split: [number, number], gap: number): [Half, Half] {
  const [a, b] = split;
  // A bare joint point gets half a mortar gap each side; a solid split (avatar, vertical) a
  // full gap.
  const g = a === b ? gap / 2 : gap;
  return [
    { dir: -1, frontier: a - g, closed: false, count: 0, started: false },
    { dir: 1, frontier: b + g, closed: false, count: 0, started: false },
  ];
}

export function createWall(
  width: number,
  height: number,
  hole: WallHole | null,
  courseH = 30,
  gap = 4,
  seed = 1,
): WallState {
  const rand = seededRandom(seed);
  const w = Math.max(1, Math.floor(width));
  const n = courseCount(height, courseH, gap);
  const courses: Course[] = [];
  for (let i = 0; i < n; i++) {
    const y = height - (i + 1) * courseH - i * gap;
    const offset = STAGGER_MIN + rand() * (STAGGER_MAX - STAGGER_MIN);
    const joint = Math.round(w / 2 + (i % 2 ? offset : -offset) / 2);
    const half = hole ? chordHalf(hole, y, y + courseH) : 0;
    const split: [number, number] =
      half > 0 ? [Math.floor(hole!.cx - half), Math.ceil(hole!.cx + half)] : [joint, joint];
    courses.push({ y, split, halves: makeHalves(split, gap) });
  }
  return { width: w, height, courseH, gap, hole, courses, bricks: [], halfStarts: 0, cuts: 0, rand };
}

/** Font size from weight relative to the strongest word: 12-20px (every word fits a course). */
export function fontForWeight(weight: number, maxWeight: number): number {
  const r = maxWeight > 0 ? Math.max(0, Math.min(1, weight / maxWeight)) : 0;
  return Math.round(12 + 8 * Math.sqrt(r));
}

function room(wall: WallState, h: Half): number {
  return h.dir === 1 ? wall.width - h.frontier : h.frontier;
}

/** x of a brick `w` wide laid at this half's frontier. */
function slotX(h: Half, w: number): number {
  return h.dir === 1 ? h.frontier : h.frontier - w;
}

function advance(wall: WallState, h: Half, w: number): void {
  h.frontier += h.dir * (w + wall.gap);
  h.count += 1;
}

function push(wall: WallState, b: Omit<Brick, "index">): Brick {
  const brick = { ...b, index: wall.bricks.length };
  wall.bricks.push(brick);
  return brick;
}

/** Close a half off with blank cut bricks out to the wall. */
function closeHalf(wall: WallState, ci: number, half: Half): void {
  if (half.closed) return;
  half.closed = true;
  const course = wall.courses[ci];
  const left = room(wall, half);
  if (left < MIN_CUT) return;
  const pieces = Math.ceil((left + wall.gap) / (MAX_CUT + wall.gap));
  const each = Math.floor((left - (pieces - 1) * wall.gap) / pieces);
  if (each < MIN_CUT) return;
  for (let i = 0; i < pieces; i++) {
    // The last piece absorbs rounding so the course ends exactly at the wall.
    const w = i === pieces - 1 ? Math.floor(room(wall, half)) : each;
    if (w < MIN_CUT) break;
    push(wall, {
      id: `~cut-${wall.cuts++}`,
      name: "",
      category: "general",
      cut: true,
      fontPx: 0,
      vertical: false,
      span: 1,
      x: slotX(half, w),
      y: course.y,
      w,
      h: wall.courseH,
      course: ci,
      entry: half.dir === 1 ? "right" : "left",
    });
    advance(wall, half, w);
  }
}

function circleHitsRect(hole: WallHole, r: Rect): boolean {
  const px = Math.max(r.x, Math.min(hole.cx, r.x + r.w));
  const py = Math.max(r.y, Math.min(hole.cy, r.y + r.h));
  return Math.hypot(px - hole.cx, py - hole.cy) < hole.r;
}

/** Try to start a half of course `ci` with a vertical brick spanning two or three courses. */
function tryVertical(
  wall: WallState,
  ci: number,
  side: 0 | 1,
  label: string,
  spec: BrickSpec,
  measure: MeasureText,
): Brick | null {
  const H = wall.courseH;
  const g = wall.gap;
  for (const span of [2, 3]) {
    const uppers = wall.courses.slice(ci + 1, ci + span);
    if (uppers.length < span - 1) return null;
    // The courses it reaches into must not have started yet.
    if (uppers.some((c) => c.halves.some((h) => h.count > 0 || h.closed))) return null;
    const len = H * span + g * (span - 1);
    let px = 0;
    for (let p = spec.fontPx; p >= Math.max(11, spec.fontPx - 3); p--) {
      if (measure(label, p) + p * PAD_X * 2 <= len) {
        px = p;
        break;
      }
    }
    if (!px) continue;

    const half = wall.courses[ci].halves[side];
    const x = slotX(half, H);
    if (x < 0 || x + H > wall.width) return null;
    const top = uppers[uppers.length - 1].y;
    const rect = { x, y: top, w: H, h: len };
    if (wall.hole && circleHitsRect(wall.hole, rect)) continue;

    return laySpanning(wall, ci, side, uppers, rect, { ...spec, fontPx: px }, true);
  }
  return null;
}

/** Commit a brick that starts a half and reaches up into `uppers` (not yet started): those
 *  courses now grow away from it (plus the avatar's chord, if any). */
function laySpanning(
  wall: WallState,
  ci: number,
  side: 0 | 1,
  uppers: Course[],
  rect: Rect,
  spec: BrickSpec,
  vertical: boolean,
): Brick {
  const g = wall.gap;
  const half = wall.courses[ci].halves[side];
  half.started = true;
  for (const up of uppers) {
    const [a, b] = up.split;
    up.split = a === b ? [rect.x, rect.x + rect.w] : [Math.min(a, rect.x), Math.max(b, rect.x + rect.w)];
    up.halves = makeHalves(up.split, g);
  }
  advance(wall, half, rect.w);
  return push(wall, {
    id: spec.name,
    name: spec.name,
    category: spec.category,
    cut: false,
    fontPx: spec.fontPx,
    vertical,
    span: uppers.length + 1,
    ...rect,
    course: ci,
    entry: half.dir === 1 ? "right" : "left",
  });
}

/** Starting font size for a big brick `span` courses tall, and the smallest it may shrink to
 *  (to fit the half's room) before it drops a size instead. */
const BIG_FONT: Record<number, [number, number]> = { 2: [36, 26], 3: [56, 40] };

/** Try to start a half of course `ci` with a big brick `span` courses tall (falling back to a
 *  shorter span if it won't fit). */
function tryBig(
  wall: WallState,
  ci: number,
  side: 0 | 1,
  label: string,
  spec: BrickSpec,
  measure: MeasureText,
): Brick | null {
  const H = wall.courseH;
  const g = wall.gap;
  const half = wall.courses[ci].halves[side];
  for (let span = Math.min(3, spec.span ?? 1); span >= 2; span--) {
    const uppers = wall.courses.slice(ci + 1, ci + span);
    if (uppers.length < span - 1) continue;
    if (uppers.some((c) => c.halves.some((h) => h.count > 0 || h.closed))) continue;
    const [start, min] = BIG_FONT[span];
    const space = room(wall, half);
    for (let px = start; px >= min; px -= 2) {
      const w = Math.ceil(measure(label, px) + px * PAD_X * 2);
      if (w > space) continue;
      const x = slotX(half, w);
      const rect = { x, y: uppers[uppers.length - 1].y, w, h: H * span + g * (span - 1) };
      if (wall.hole && circleHitsRect(wall.hole, rect)) break;
      return laySpanning(wall, ci, side, uppers, rect, { ...spec, fontPx: px }, false);
    }
  }
  return null;
}

/** Lowest course with an open half (-1 once the wall is full). */
export function workingCourse(wall: WallState): number {
  return wall.courses.findIndex((c) => c.halves.some((h) => !h.closed));
}

/** Laying in course `ci` finishes everything two or more courses below it, so the wall never
 *  keeps holes underneath its working courses. */
function closeBelow(wall: WallState, ci: number): void {
  for (let j = 0; j < ci - 1; j++) {
    for (const half of wall.courses[j].halves) closeHalf(wall, j, half);
  }
}

/** Lay the next word: the lowest course with room, on whichever half is shorter so far. May
 *  also lay blank cut bricks (closing off halves it moves past). Returns the word's brick, or
 *  null once the wall is full for it. */
export function addBrick(wall: WallState, spec: BrickSpec, measure: MeasureText): Brick | null {
  const label = spec.name.replace(/_/g, " ");
  const w = Math.ceil(measure(label, spec.fontPx) + spec.fontPx * PAD_X * 2);

  // Big words want to start a half (the only place a multi-course brick can't block anyone's
  // path), in the working course or the one just above it - never floating higher than that.
  if ((spec.span ?? 1) > 1) {
    const working = workingCourse(wall);
    const min = spec.minCourse ?? 0;
    if (working >= 0 && min > working + 1) return null; // not high enough yet - deferred
    for (let ci = Math.max(working, min); ci >= 0 && ci <= working + 1 && ci < wall.courses.length; ci++) {
      const course = wall.courses[ci];
      if (ci > working) {
        // Needs something under its middle to stand on.
        const below = wall.courses[ci - 1];
        if (below.halves.some((h) => h.count === 0 && !h.closed)) continue;
      }
      // Balance big bricks across the wall: the side with fewer so far goes first (coin toss on
      // a tie) - otherwise they'd all pile up on whichever side happens to be tried first.
      const bigOn = (dir: number) =>
        wall.bricks.filter((b) => !b.cut && !b.vertical && b.span > 1 && (b.entry === "right") === (dir === 1)).length;
      const lead = bigOn(-1) - bigOn(1);
      const sides: (0 | 1)[] = lead < 0 ? [0, 1] : lead > 0 ? [1, 0] : wall.rand() < 0.5 ? [0, 1] : [1, 0];
      for (const side of sides) {
        const half = course.halves[side];
        if (half.closed || half.count > 0) continue;
        const big = tryBig(wall, ci, side, label, spec, measure);
        if (big) {
          closeBelow(wall, ci);
          return big;
        }
      }
    }
    // Aiming for a particular row and not past it yet: keep waiting for a half to start there
    // rather than settling for a normal brick.
    if (spec.minCourse != null && working >= 0 && working <= spec.minCourse + 1) return null;
  }

  for (let ci = 0; ci < wall.courses.length; ci++) {
    const course = wall.courses[ci];
    const open = ([0, 1] as const).filter((s) => !course.halves[s].closed);
    if (open.length === 0) continue;
    // Both sides should rise roughly together, but not in lockstep: a half that's two or more
    // bricks behind goes first; otherwise it's a coin toss.
    if (open.length === 2) {
      const diff = course.halves[0].count - course.halves[1].count;
      const first = diff <= -2 ? 0 : diff >= 2 ? 1 : wall.rand() < 0.5 ? 0 : 1;
      if (open[0] !== first) open.reverse();
    }

    for (const side of open) {
      const half = course.halves[side];
      if (half.count === 0 && !half.started) {
        half.started = true;
        wall.halfStarts += 1;
        if (spec.allowVertical && wall.halfStarts % 3 === 0) {
          const v = tryVertical(wall, ci, side, label, spec, measure);
          if (v) {
            closeBelow(wall, ci);
            return v;
          }
        }
      }
      if (w <= room(wall, half)) {
        // A sliver too thin for even a cut brick: stretch this one to meet the wall instead.
        const rest = room(wall, half) - w - wall.gap;
        const flush = rest < MIN_CUT;
        const bw = flush ? Math.floor(room(wall, half)) : w;
        const brick = push(wall, {
          id: spec.name,
          name: spec.name,
          category: spec.category,
          cut: false,
          fontPx: spec.fontPx,
          vertical: false,
          span: 1,
          x: slotX(half, bw),
          y: course.y,
          w: bw,
          h: wall.courseH,
          course: ci,
          entry: half.dir === 1 ? "right" : "left",
        });
        advance(wall, half, bw);
        if (flush) half.closed = true;
        closeBelow(wall, ci);
        return brick;
      }
    }
    // Neither half takes this word: close off any half that's nearly done.
    for (const side of open) {
      const half = course.halves[side];
      if (room(wall, half) < CLOSE_BELOW) closeHalf(wall, ci, half);
    }
  }
  return null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Swept area of a brick's slide-in (from its outer edge to its slot, along its own band). */
export function entryPath(wall: WallState, b: Rect & { entry: BrickEntry }): Rect {
  return b.entry === "left"
    ? { x: 0, y: b.y, w: b.x, h: b.h }
    : { x: b.x + b.w, y: b.y, w: wall.width - b.x - b.w, h: b.h };
}

/** Whether `r`, grown by `reach`, touches the avatar keep-out. */
export function touchesHole(hole: WallHole, r: Rect, reach: number): boolean {
  return circleHitsRect({ ...hole, r: hole.r + reach }, r);
}

export { circleHitsRect };

/** Bricks within `reach` px of `brick` (its neighbours to bump when it lands). */
export function touching(bricks: Brick[], brick: Rect, reach: number): Brick[] {
  const grown = { x: brick.x - reach, y: brick.y - reach, w: brick.w + reach * 2, h: brick.h + reach * 2 };
  return bricks.filter((b) => b !== brick && rectsOverlap(grown, b));
}
