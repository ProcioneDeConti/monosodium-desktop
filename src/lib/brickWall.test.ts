import { describe, expect, it } from "vitest";
import {
  addBrick,
  circleHitsRect,
  createWall,
  entryPath,
  fontForWeight,
  rectsOverlap,
  touching,
  type Brick,
} from "./brickWall";

// Monospace stand-in for canvas measureText.
const measure = (text: string, px: number) => text.length * px * 0.55;
const COURSE = 30;
const GAP = 4;

const NAMES = [
  "fluffy_artist", "renamon", "fox", "digimon", "canine", "loona", "helluva_boss", "wolf", "big_tail",
  "inner_ear_fluff", "some_painter", "dragon", "pokemon", "lucario", "scalie", "detailed_background",
  "smile", "blush", "nintendo", "krystal", "star_fox", "painterly", "sketch_master", "hyena", "sitting",
  "looking_at_viewer", "paws", "felid", "tiger", "eyewear", "hoodie", "night", "snow", "cozy", "tea",
  "forest", "avian", "owl", "cute_fangs", "markings",
];

function fill(count: number, withHole: boolean, width = 760, courses = 7) {
  const height = courses * COURSE + (courses - 1) * GAP;
  const hole = withHole ? { cx: width / 2, cy: height / 2, r: 57 } : null;
  const wall = createWall(width, height, hole, COURSE, GAP);
  for (let i = 0; i < count; i++) {
    addBrick(
      wall,
      {
        name: NAMES[i % NAMES.length] + (i >= NAMES.length ? `_${i}` : ""),
        category: "general",
        fontPx: 12 + (i % 9),
        allowVertical: i >= 3,
      },
      measure,
    );
  }
  return wall;
}

function courseTop(height: number, c: number): number {
  return height - (c + 1) * COURSE - c * GAP;
}

/** Whether brick `b` occupies course `c` (verticals occupy several). */
function covers(b: Brick, c: number, height: number): boolean {
  const top = courseTop(height, c);
  return b.y <= top && b.y + b.h >= top + COURSE;
}

describe("brickWall", () => {
  for (const withHole of [false, true]) {
    describe(withHole ? "with avatar" : "without avatar", () => {
      const wall = fill(40, withHole);

      it("lays bricks in equal-height courses, without overlaps, inside the box", () => {
        const tops = new Set(Array.from({ length: 10 }, (_, c) => courseTop(wall.height, c)));
        for (const b of wall.bricks) {
          expect(tops.has(b.y)).toBe(true);
          if (!b.vertical) expect(b.h).toBe(COURSE);
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(wall.width);
          expect(b.y).toBeGreaterThanOrEqual(0);
        }
        const bs = wall.bricks;
        for (let i = 0; i < bs.length; i++)
          for (let j = i + 1; j < bs.length; j++) expect(rectsOverlap(bs[i], bs[j])).toBe(false);
      });

      it("no brick's slide-in path crosses an earlier brick or the avatar", () => {
        const earlier: Brick[] = [];
        for (const b of wall.bricks) {
          const path = entryPath(wall, b);
          if (path.w > 0) {
            for (const o of earlier) expect(rectsOverlap(path, o)).toBe(false);
            if (wall.hole) expect(circleHitsRect(wall.hole, path)).toBe(false);
          }
          earlier.push(b);
        }
      });

      it("finished courses run flush to both walls", () => {
        const top = Math.max(...wall.bricks.map((b) => b.course));
        expect(top).toBeGreaterThan(2);
        for (let c = 0; c < top - 1; c++) {
          const row = wall.bricks.filter((b) => covers(b, c, wall.height));
          expect(Math.min(...row.map((b) => b.x))).toBeLessThanOrEqual(1);
          expect(Math.max(...row.map((b) => b.x + b.w))).toBeGreaterThanOrEqual(wall.width - 1);
        }
      });
    });
  }

  it("bricks slide in from their own half's side; the first ones butt the middle joint", () => {
    const wall = createWall(800, 100, null, COURSE, GAP);
    const placed = [0, 1, 2, 3].map(
      (i) => addBrick(wall, { name: `word${i}`, category: "general", fontPx: 14, allowVertical: false }, measure)!,
    );
    for (const b of placed) {
      expect(b.y + b.h).toBe(100);
      // Left-half bricks sit left of the joint and come from the left; right-half the reverse.
      expect(b.entry).toBe(b.x + b.w / 2 < 400 ? "left" : "right");
    }
    // The innermost bricks either side meet within the joint's stagger range of the centre.
    const inner = placed.map((b) => (b.entry === "left" ? b.x + b.w : b.x));
    expect(Math.min(...inner.map((x) => Math.abs(x - 400)))).toBeLessThanOrEqual(30);
  });

  it("keeps the round avatar clear and builds around it", () => {
    const wall = fill(40, true);
    const hole = wall.hole!;
    for (const b of wall.bricks) expect(circleHitsRect(hole, b)).toBe(false);
    const level = wall.bricks.filter((b) => !b.cut && b.y <= hole.cy && b.y + b.h >= hole.cy);
    expect(level.some((b) => b.x + b.w <= hole.cx)).toBe(true);
    expect(level.some((b) => b.x >= hole.cx)).toBe(true);
  });

  it("stands some bricks on end, spanning two or three whole courses", () => {
    const wall = fill(40, true);
    const vs = wall.bricks.filter((b) => b.vertical);
    expect(vs.length).toBeGreaterThanOrEqual(2);
    for (const v of vs) {
      expect([COURSE * 2 + GAP, COURSE * 3 + GAP * 2]).toContain(v.h);
      expect(v.w).toBe(COURSE);
    }
  });

  it("lays big words two or three courses tall, starting a half, with bigger text", () => {
    const wall = createWall(760, 9 * COURSE + 8 * GAP, null, COURSE, GAP);
    const big = addBrick(wall, { name: "top_artist", category: "artist", fontPx: 20, allowVertical: false, span: 3 }, measure)!;
    expect(big.span).toBe(3);
    expect(big.h).toBe(COURSE * 3 + GAP * 2);
    expect(big.fontPx).toBeGreaterThan(20);
    expect(big.y + big.h).toBe(wall.height);
    // It starts a half: its inner edge is at the middle joint.
    const inner = big.entry === "left" ? big.x + big.w : big.x;
    expect(Math.abs(inner - 380)).toBeLessThanOrEqual(30);
    // The courses it reaches into grow away from it - later bricks never overlap it.
    for (let i = 0; i < 30; i++)
      addBrick(wall, { name: `w${i}`, category: "general", fontPx: 14, allowVertical: true }, measure);
    for (const o of wall.bricks) if (o !== big) expect(rectsOverlap(o, big)).toBe(false);
  });

  it("shrinks a big word to fit, or lays it normally when it can't start a half", () => {
    // Halves here are ~195-245px: room for this word at 20px, but not at any big size.
    const wall = createWall(440, 9 * COURSE + 8 * GAP, null, COURSE, GAP);
    const huge = addBrick(wall, { name: "long_artist_name", category: "artist", fontPx: 20, allowVertical: false, span: 3 }, measure)!;
    expect(huge.span).toBe(1);
    expect(huge.fontPx).toBe(20);
  });

  it("a big word aimed at a higher row waits (placing nothing) until the wall gets there", () => {
    const wall = createWall(760, 9 * COURSE + 8 * GAP, null, COURSE, GAP);
    const spec = { name: "big_one", category: "artist" as const, fontPx: 20, allowVertical: false, span: 2, minCourse: 3 };
    expect(addBrick(wall, spec, measure)).toBeNull();
    expect(wall.bricks).toHaveLength(0);
    let big = null;
    for (let i = 0; i < 60 && !big; i++) {
      addBrick(wall, { name: `w${i}`, category: "general", fontPx: 14, allowVertical: false }, measure);
      big = addBrick(wall, spec, measure);
    }
    expect(big).not.toBeNull();
    expect(big!.span).toBe(2);
    expect(big!.course).toBeGreaterThanOrEqual(3);
  });

  it("balances big bricks between the left and right of the wall", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const wall = createWall(760, 9 * COURSE + 8 * GAP, null, COURSE, GAP, seed);
      for (let i = 0; i < 4; i++)
        addBrick(wall, { name: `big${i}`, category: "artist", fontPx: 20, allowVertical: false, span: 2 }, measure);
      const bigs = wall.bricks.filter((b) => b.span > 1);
      const left = bigs.filter((b) => b.entry === "left").length;
      expect(bigs.length).toBe(4);
      expect(left).toBe(2);
    }
  });

  it("never stands the first three words on end", () => {
    const wall = fill(3, false);
    expect(wall.bricks.some((b) => b.vertical)).toBe(false);
  });

  it("closes leftovers with blank cut bricks, with unique ids throughout", () => {
    const wall = fill(40, false);
    const cuts = wall.bricks.filter((b) => b.cut);
    expect(cuts.length).toBeGreaterThan(0);
    for (const c of cuts) {
      expect(c.name).toBe("");
      expect(c.id.startsWith("~cut-")).toBe(true);
      expect(c.w).toBeLessThanOrEqual(100);
    }
    expect(new Set(wall.bricks.map((b) => b.id)).size).toBe(wall.bricks.length);
  });

  it("never moves placed bricks when more are added", () => {
    const wall = fill(12, true);
    const snapshot = wall.bricks.map((b) => ({ ...b }));
    for (let i = 0; i < 12; i++)
      addBrick(wall, { name: `late_${i}`, category: "species", fontPx: 14, allowVertical: true }, measure);
    expect(wall.bricks.slice(0, snapshot.length)).toEqual(snapshot);
  });

  it("returns null once a brick can't fit", () => {
    const wall = createWall(100, 40, null, COURSE, GAP);
    expect(
      addBrick(wall, { name: "a_very_long_tag_name_indeed", category: "general", fontPx: 20, allowVertical: false }, measure),
    ).toBeNull();
  });

  it("font sizes scale 12-20px with weight", () => {
    expect(fontForWeight(1, 1)).toBe(20);
    expect(fontForWeight(0, 1)).toBe(12);
    expect(fontForWeight(5, 0)).toBe(12);
  });

  it("finds touching neighbours", () => {
    const wall = fill(12, false);
    const near = touching(wall.bricks, wall.bricks[0], GAP + 2);
    expect(near.length).toBeGreaterThan(0);
    expect(near).not.toContain(wall.bricks[0]);
  });
});
