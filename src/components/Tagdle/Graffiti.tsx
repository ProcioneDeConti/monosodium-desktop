import { useLayoutEffect, useRef, useState } from "react";
// Open-licensed (OFL / Apache-2.0) graffiti-style fonts, bundled locally via Fontsource - safe to
// ship in a public release, unlike most "free for personal use" font-site downloads.
import "@fontsource/sedgwick-ave-display";
import "@fontsource/sedgwick-ave";
import "@fontsource/permanent-marker";
import "@fontsource/rubik-spray-paint";
import "@fontsource/rock-salt";
import { useSettingsStore } from "../../state/settingsStore";

/** The pool the wall draws from - a fresh random handful each time Tagdle opens. `\n` breaks a
 *  line onto two rows. */
const GRAFFITI_LINES: string[] = [
  "For a good time,\ncall knot!",
  "Beware of dog\n(he bites, but in a fun way).",
  "Show me your tail\nor get out.",
  "Sheath happens.",
  "No pants,\nno problem.",
  "Looking for\na bad dragon.",
  "Dirty fur,\ndon't care.",
  "Barking up the wrong tree?\nNever.",
  "Keep your paws to yourself\n(unless requested).",
  "Foxes do it\nwith more noise.",
  "Raccoon looking for trash\nand bad decisions.",
  "Hyenas laugh loudest\nin the dark.",
  "Claws out,\npants down.",
  "Tail wags, heart beats,\nclothes off.",
  "Big ears hear everything\nyou're whispering.",
  "Wolves don't ask\nfor permission.",
  "Stray dogs welcome.",
  "Bite marks are just\ntemporary tattoos.",
  "If you've got the fur,\nI've got the time.",
  "Catnip made me do it.",
  "Hot paws,\ncold beer.",
  "Less talking,\nmore growling.",
  "Furr-icious\nin the sheets.",
  "Shedding season is\nyear-round in this alley.",
  "Marking my territory.",
  "Wild in the streets,\nwilder in the sheets.",
  "Skunks smell like trouble\n(and we like it).",
  "Don't feed the beasts...\nunless it's liquor.",
  "Tail-first\ninto bad ideas.",
  "No collar,\nno rules.",
];

/** The raunchier set - only painted on the wall while adult mode is on, same as every other
 *  explicit thing in the app. */
const GRAFFITI_LINES_ADULT: string[] = [
  "Knot your average\nalleyway.",
  "Sniff first,\nask questions later.",
  "Mounted and ready.",
  "Looking for\na tight sheath.",
  "Breeding season\nnever ends.",
  "Take me\nby the scruff.",
  "Paws up,\nface down.",
  "Good boys get leashed;\nbad boys get cuffed.",
  "Spill the cummies.",
  "Foxes take it\nall the way.",
  "Throat goat\nof the pack.",
  "Bait, mate,\nrepeat.",
  "Tail raised,\ninvitation open.",
  "Dirty hyena\nneeds a hard fix.",
  "Marked, claimed,\nand used.",
  "Stray mutt looking\nto get filled.",
  "Heat cycle\nin full effect.",
  "Choke on the fur.",
  "Knot me\n'til I whimper.",
  "No leash, no limits,\nno lube.",
  "Rawhide isn't the only\nthing I chew on.",
  "Wet snout,\nsoaked sheets.",
  "Bad dragon\nin training.",
  "Ride the tailwind.",
  "Lick the salt\noff my hide.",
];

const FONTS = [
  "Sedgwick Ave Display",
  "Sedgwick Ave",
  "Permanent Marker",
  "Rubik Spray Paint",
  "Rock Salt",
  // Local files, @font-face in index.css.
  "A Dripping Marker",
  "Bored Schoolboy",
  "Don Graffiti",
  "Mostwasted",
  "Soup Leaf",
  "Thirsty Caps",
];
/** Characters a font has no glyph for (checked with fontTools) - a line containing any of them
 *  gets a different font, rather than a patchwork of fallback-font punctuation. */
const MISSING_GLYPHS: Record<string, string> = {
  "Bored Schoolboy": "!'(),-.;?\"",
  "Thirsty Caps": "'",
};

const fontsFor = (text: string) => FONTS.filter((font) => ![...(MISSING_GLYPHS[font] ?? "")].some((c) => text.includes(c)));

const COLORS = ["#ff5fa2", "#7fe7ff", "#ffe066", "#b6ff7a", "#c9a2ff", "#ffffff", "#ff8a5c", "#5cffc8"];

/** 5 or 6 tags per wall - enough to feel tagged-up without crowding the cards. */
const countForWall = () => 5 + Math.floor(Math.random() * 2);

/** Tries per tag when looking for a free spot; the least-overlapping one wins if none is clear. */
const PLACEMENT_TRIES = 120;
/** Breathing room kept around each tag, px. */
const GAP = 14;
/** Tags only go in the lower part of the wall (from this fraction of its height down), clear of
 *  the round header, the daily summary's score / emoji row / "puzzle is done" line. */
const TOP_CLEAR = 0.45;

interface Tag {
  text: string;
  font: string;
  color: string;
  size: number;
  rotate: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function rollWall(adult: boolean): Tag[] {
  return shuffled(adult ? [...GRAFFITI_LINES, ...GRAFFITI_LINES_ADULT] : GRAFFITI_LINES)
    .slice(0, countForWall())
    // Real graffiti rarely bothers with punctuation: drop it from the end of every row.
    .map((line) => line.replace(/[.,;:!?]+(?=\n|$)/g, ""))
    .map((text) => {
      const longest = Math.max(...text.split("\n").map((l) => l.length));
      return {
        text,
        font: pick(fontsFor(text)),
        color: pick(COLORS),
        // Short tags shout, long ones are scrawled smaller.
        size: longest <= 12 ? 40 : longest <= 20 ? 32 : 26,
        rotate: Math.round((Math.random() * 2 - 1) * 10),
      };
    });
}

const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Bounding box of a w*h box rotated by `deg` about its centre. */
function rotatedSize(w: number, h: number, deg: number): [number, number] {
  const r = (Math.abs(deg) * Math.PI) / 180;
  return [w * Math.cos(r) + h * Math.sin(r), w * Math.sin(r) + h * Math.cos(r)];
}

/** Greedy scatter: biggest tags first, each at the random spot (of PLACEMENT_TRIES) that overlaps
 *  the already-placed tags and the raccoon's corner least - the first clear spot wins outright.
 *  Returns top-left corners as fractions of the wall, so a resize scales the layout instead of
 *  re-rolling it. */
function layout(sizes: [number, number][], wallW: number, wallH: number, keepOut: Rect[]): [number, number][] {
  const placed: Rect[] = [...keepOut];
  const out: [number, number][] = new Array(sizes.length);
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b][0] * sizes[b][1] - sizes[a][0] * sizes[a][1]);
  for (const i of order) {
    const [w, h] = sizes[i];
    let best: Rect = { x: 0, y: 0, w, h };
    let bestScore = Infinity;
    for (let t = 0; t < PLACEMENT_TRIES && bestScore > 0; t++) {
      // Bottom band only; a tag too tall for it just hugs the floor.
      const minY = Math.min(wallH * TOP_CLEAR, Math.max(0, wallH - h));
      const r = { x: Math.random() * Math.max(0, wallW - w), y: minY + Math.random() * Math.max(0, wallH - h - minY), w, h };
      const padded = { x: r.x - GAP, y: r.y - GAP, w: w + 2 * GAP, h: h + 2 * GAP };
      const score = placed.reduce((s, p) => s + overlapArea(padded, p), 0);
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    placed.push(best);
    out[i] = [best.x / wallW, best.y / wallH];
  }
  return out;
}

/** Spray-painted wall tags behind the game. Rolled once per mount, so reopening Tagdle repaints.
 *  Rendered hidden first so each tag can be measured in its real font, then laid out to avoid
 *  the others. */
export function Graffiti() {
  const adultModeEnabled = useSettingsStore((s) => s.adultModeEnabled);
  const [tags] = useState(() => rollWall(adultModeEnabled));
  const [positions, setPositions] = useState<[number, number][] | null>(null);
  const wall = useRef<HTMLDivElement>(null);
  const tagEls = useRef<(HTMLSpanElement | null)[]>([]);

  useLayoutEffect(() => {
    let cancelled = false;
    // Measure only once the fonts are in - fallback-font metrics would place the wrong boxes.
    void document.fonts.ready.then(() => {
      const el = wall.current;
      if (cancelled || !el) return;
      const { width, height } = el.getBoundingClientRect();
      const raw = tags.map((_, i) => [tagEls.current[i]?.offsetWidth ?? 0, tagEls.current[i]?.offsetHeight ?? 0]);
      const sizes = raw.map(([w, h], i) => rotatedSize(w, h, tags[i].rotate));
      // The raccoon's corner (see TagdlePanel - h-56 image, bottom-right).
      const raccoon: Rect = { x: width - 240, y: height - 240, w: 240, h: 240 };
      // layout() places each rotated bounding box; the element itself is the unrotated box
      // rotating about its centre, so shift it by half the size difference to sit inside.
      const boxes = layout(sizes, width, height, [raccoon]);
      setPositions(
        boxes.map(([fx, fy], i) => [
          fx + (sizes[i][0] - raw[i][0]) / 2 / width,
          fy + (sizes[i][1] - raw[i][1]) / 2 / height,
        ]),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [tags]);

  return (
    <div ref={wall} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {tags.map((g, i) => {
        const pos = positions?.[i];
        return (
          <span
            key={g.text}
            ref={(el) => {
              tagEls.current[i] = el;
            }}
            className="tagdle-eroded absolute max-w-[46%] whitespace-pre-line text-center leading-tight"
            style={{
              left: pos ? `${pos[0] * 100}%` : 0,
              top: pos ? `${pos[1] * 100}%` : 0,
              visibility: pos ? "visible" : "hidden",
              fontFamily: `"${g.font}", sans-serif`,
              fontSize: g.size,
              color: g.color,
              opacity: 0.75,
              transform: `rotate(${g.rotate}deg)`,
              textShadow: `0 0 6px ${g.color}88, 0 0 1px ${g.color}`,
              mixBlendMode: "screen",
            }}
          >
            {g.text}
          </span>
        );
      })}
    </div>
  );
}
