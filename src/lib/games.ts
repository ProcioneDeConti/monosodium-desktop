// Shared pure logic for the Games launcher's post-based games (Higher or Lower, Artist/Species
// Guesser, Zoom Reveal, Rating Judge, Six Degrees, Odd One Out, Year Guesser, Tag Bingo). Tagdle keeps its own lib/tagdle.ts - the
// seeded PRNG / day key helpers are reused from there so every daily rolls over together.

import type { Post } from "../models/post";
import { hashString, seededRandom, type PoolTag } from "./tagdle";

export type GameId =
  | "tagdle"
  | "higherLower"
  | "artist"
  | "species"
  | "zoom"
  | "rating"
  | "sixDegrees"
  | "oddOneOut"
  | "yearGuess"
  | "bingo"
  | "gusPet"
  | "gusChat";

/** Rounds in one run of the quiz-style games (Artist/Species/Zoom/Rating). */
export const QUIZ_ROUNDS = 10;

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/** The URL a game shows for a post: still images only (videos make guessing games trivial or
 *  impossible), sample preferred over the full file so big originals don't stall a round. */
export function gameImageUrl(post: Post): string | null {
  if (!IMAGE_EXTS.has(post.file.ext.toLowerCase())) return null;
  return post.sample.url ?? post.file.url;
}

/** Fisher-Yates, non-mutating. */
export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `answer` plus up to `count - 1` distractors from `bank`, skipping anything in `exclude` (a
 *  post's own tags - a distractor the post also carries would be a second right answer). */
export function buildChoices(
  answer: string,
  bank: readonly string[],
  exclude: ReadonlySet<string>,
  count = 4,
  rand: () => number = Math.random,
): string[] {
  const pool = shuffle(
    [...new Set(bank)].filter((t) => t !== answer && !exclude.has(t)),
    rand,
  );
  return shuffle([answer, ...pool.slice(0, count - 1)], rand);
}

/** Artist-category tags that aren't actually an artist. */
const NON_ARTIST_TAGS = new Set([
  "conditional_dnp",
  "sound_warning",
  "unknown_artist",
  "unknown_artist_signature",
  "anonymous_artist",
  "third-party_edit",
  "epilepsy_warning",
  "avoid_posting",
  "jumpscare_warning",
  "ai_generated_artist",
  "e621_customer",
  "creator_unknown",
]);

/** The post's real artists (bookkeeping tags in the artist category dropped). */
export function realArtists(post: Post): string[] {
  return post.tags.artist.filter(isRealArtist);
}

export function isRealArtist(tag: string): boolean {
  return !NON_ARTIST_TAGS.has(tag);
}

/** Fallback species list for Species Guesser / Zoom Reveal, used only when the live list (see
 *  `leafSpecies`) can't be built - offline, or too few tags survive the filter. */
export const GAME_SPECIES = [
  "fox",
  "wolf",
  "domestic_dog",
  "domestic_cat",
  "rabbit",
  "dragon",
  "horse",
  "tiger",
  "lion",
  "raccoon",
  "red_panda",
  "bear",
  "deer",
  "hyena",
  "otter",
  "skunk",
  "mouse",
  "rat",
  "kangaroo",
  "shark",
  "lizard",
  "snake",
  "bat",
  "cheetah",
  "leopard",
  "snow_leopard",
  "lynx",
  "coyote",
  "goat",
  "sheep",
  "squirrel",
  "ferret",
  "badger",
  "hedgehog",
  "sergal",
  "protogen",
  "kobold",
  "gryphon",
  "unicorn",
  "dinosaur",
] as const;

/** Below this many posts a species is too obscure to be a fair guess. */
export const MIN_SPECIES_POSTS = 1000;

/** Species-category tags that aren't a species at all (implications can't catch these). */
const NON_SPECIES_TAGS = new Set(["unknown_species", "shiny_pokemon", "ambiguous_species", "hybrid"]);

/** The real species in a species-category pool: drops grouping tags - anything another species
 *  tag implies (`fox` -> `canine`, so `canine` is a group) - and tags under `minPosts`. */
export function leafSpecies(
  pool: readonly PoolTag[],
  implications: readonly { antecedent_name: string; consequent_name: string }[],
  minPosts = MIN_SPECIES_POSTS,
): string[] {
  const groups = new Set(implications.map((i) => i.consequent_name));
  return pool.filter((t) => t.category === 5 && t.post_count >= minPosts && !groups.has(t.name) && !NON_SPECIES_TAGS.has(t.name)).map((t) => t.name);
}

/** Species Guesser scoring: the blur clears over `revealMs`; an instant answer is worth 100, one
 *  at (or after) full reveal 10. */
export function speedPoints(elapsedMs: number, revealMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / revealMs));
  return Math.round(100 - 90 * t);
}

/** Zoom Reveal's zoom steps, most zoomed first. Points for a correct answer = steps left. */
export const ZOOM_LEVELS = [7, 4.5, 3, 2, 1.4, 1] as const;

export function zoomPoints(level: number): number {
  return Math.max(0, ZOOM_LEVELS.length - level);
}

// --- Six Degrees -----------------------------------------------------------------------------

/** The endpoints a Six Degrees puzzle may use: well-populated species/copyright tags, so both ends
 *  have enough posts to link through. Characters are left out - most only ever appear alongside
 *  their own franchise, which made puzzles near-impossible. */
export function sixDegreesCandidates(pool: PoolTag[], minPosts = 3000): PoolTag[] {
  return pool.filter((t) => t.post_count >= minPosts && [3, 5].includes(t.category));
}

export interface SixDegreesPuzzle {
  start: string;
  target: string;
}

/** Two endpoints from different categories (species -> copyright reads better than wolf -> fox). */
export function pickSixDegrees(candidates: PoolTag[], rand: () => number): SixDegreesPuzzle | null {
  const sorted = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
  if (sorted.length < 2) return null;
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = sorted[Math.floor(rand() * sorted.length)];
    const b = sorted[Math.floor(rand() * sorted.length)];
    if (a.name === b.name) continue;
    if (attempt < 80 && a.category === b.category) continue;
    return { start: a.name, target: b.name };
  }
  return null;
}

export function dailySixDegrees(candidates: PoolTag[], site: string, dayKey: string): SixDegreesPuzzle | null {
  return pickSixDegrees(candidates, seededRandom(hashString(`six:${site}:${dayKey}`)));
}

export function sixDegreesShareText(site: string, dayKey: string, hops: number | null): string {
  return hops === null
    ? `Tag Hopper ${site} ${dayKey} - gave up`
    : `Tag Hopper ${site} ${dayKey} - ${hops} hop${hops === 1 ? "" : "s"}\n${"🔗".repeat(hops)}`;
}

/** The first real sentence or two of a wiki body as plain text, for Six Degrees' tag cards:
 *  headings, lists, sections and thumbnails skipped; links, wiki links and inline tags reduced
 *  to their text. Empty when there's no prose. */
export function wikiSummary(body: string, maxLength = 240): string {
  const lines = body.replace(/\r/g, "").split(/\n+/);
  const prose = lines.find((l) => {
    const t = l.trim();
    return t.length > 0 && !/^(h\d\.|\*|\[\/?(section|quote|code|table)|thumb #|!post #)/i.test(t);
  });
  if (!prose) return "";
  const text = prose
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, (_, page: string) => page.replace(/_/g, " "))
    .replace(/"([^"]+)":\[?[^\s\]]+\]?/g, "$1")
    .replace(/\{\{([^}]+)\}\}/g, "$1")
    .replace(/\[\/?[a-z]+(=[^\]]*)?\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

/** Tag Hopper endpoints for a favorites-only game: species/copyright tags that appear on at least
 *  `minCount` of the sampled favorites, with that count standing in for post_count. */
export function favoriteEndpoints(posts: readonly Post[], minCount = 3): PoolTag[] {
  const counts = new Map<string, PoolTag>();
  for (const post of posts) {
    for (const [names, category] of [
      [post.tags.species, 5],
      [post.tags.copyright, 3],
    ] as const) {
      for (const name of names) {
        const entry = counts.get(name) ?? { name, post_count: 0, category };
        entry.post_count++;
        counts.set(name, entry);
      }
    }
  }
  return [...counts.values()].filter((t) => t.post_count >= minCount);
}

// --- Odd One Out -----------------------------------------------------------------------------

/** General tags an Odd One Out round may hinge on: the pool by size minus its top `skip` (`solo`,
 *  `hi_res` - on half the site, so they'd be on the odd post too often to read as "shared").
 *  Rank-based rather than a post-count band so it scales to e6AI's much smaller counts. */
export function oddOneOutCandidates(pool: readonly PoolTag[], skip = 40): string[] {
  return [...pool]
    .filter((t) => t.category === 0)
    .sort((a, b) => b.post_count - a.post_count || a.name.localeCompare(b.name))
    .slice(skip)
    .map((t) => t.name);
}

export interface OddOneOutRound {
  tag: string;
  /** Three posts with `tag`, one without, shuffled; `odd` is the index of the one without. */
  posts: Post[];
  odd: number;
}

/** Builds a round from posts already in hand (favorites-only runs, which can't afford two searches
 *  per round against a small collection): a general tag from `allowed` that at least three unused
 *  posts carry and at least one doesn't. Used posts are skipped. Null when nothing fits. */
export function oddOneOutFromPosts(
  posts: readonly Post[],
  allowed: ReadonlySet<string>,
  used: ReadonlySet<number>,
  rand: () => number = Math.random,
): OddOneOutRound | null {
  const fresh = posts.filter((p) => !used.has(p.id));
  const withTag = new Map<string, Post[]>();
  for (const post of fresh) {
    for (const tag of post.tags.general) {
      if (!allowed.has(tag)) continue;
      const list = withTag.get(tag) ?? [];
      list.push(post);
      withTag.set(tag, list);
    }
  }
  const tags = shuffle(
    [...withTag.keys()].filter((t) => withTag.get(t)!.length >= 3 && withTag.get(t)!.length < fresh.length).sort(),
    rand,
  );
  const tag = tags[0];
  if (!tag) return null;
  const shared = shuffle(withTag.get(tag)!, rand).slice(0, 3);
  const without = shuffle(fresh.filter((p) => !p.tags.general.includes(tag)), rand)[0];
  return assembleOddRound(tag, shared, without, rand);
}

/** Shuffles three tag-sharing posts and the odd one into a round. */
export function assembleOddRound(tag: string, shared: Post[], odd: Post, rand: () => number = Math.random): OddOneOutRound {
  const posts = shuffle([...shared, odd], rand);
  return { tag, posts, odd: posts.indexOf(odd) };
}

// --- Year Guesser ----------------------------------------------------------------------------

/** First upload year per site - the year slider's floor. */
export const FIRST_YEAR: Record<string, number> = { e621: 2007, e6ai: 2022 };

/** A post's upload year (UTC), or null when the API left created_at out. */
export function uploadYear(post: Post): number | null {
  if (!post.created_at) return null;
  const year = new Date(post.created_at).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

/** The `date:` search term covering one calendar year. */
export function yearRangeTag(year: number): string {
  return `date:${year}-01-01..${year}-12-31`;
}

/** Year Guesser scoring: 100 for the right year, 25 less per year off, never below 0. */
export function yearPoints(guess: number, actual: number): number {
  return Math.max(0, 100 - 25 * Math.abs(guess - actual));
}

// --- Tag Bingo -------------------------------------------------------------------------------

export const BINGO_SIZE = 3;

/** Every winning line (rows, columns, both diagonals) as square indexes. */
export const BINGO_LINES: number[][] = (() => {
  const n = BINGO_SIZE;
  const range = [...Array(n).keys()];
  return [
    ...range.map((r) => range.map((c) => r * n + c)),
    ...range.map((c) => range.map((r) => r * n + c)),
    range.map((i) => i * n + i),
    range.map((i) => i * n + (n - 1 - i)),
  ];
})();

/** The first completed line, or null. `marked` is indexed like the card. */
export function bingoLine(marked: readonly boolean[]): number[] | null {
  return BINGO_LINES.find((line) => line.every((i) => marked[i])) ?? null;
}

/** The winning squares: any line normally, the whole card in blackout mode. Null until won. */
export function bingoWin(marked: readonly boolean[], blackout: boolean): number[] | null {
  if (!blackout) return bingoLine(marked);
  return marked.every(Boolean) ? marked.map((_, i) => i) : null;
}

/** Tags you can't judge by looking (file/medium/meta-ish general tags, body-part counts):
 *  unfair as bingo squares, since the player only sees the picture. */
const NON_VISUAL_TAG =
  /(^|_)(text|dialogue|signature|watermark|url|artist_name|background|res|media|artwork|fingers|toes|digits|number|date|character_name|logo|border|edit|comic|sketch|monochrome|greyscale|version|meme)(_|$)|\(artwork\)|^\d|_(by|at)_/;

/** Bingo square candidates: general/species tags common enough to turn up within a few dozen random
 *  posts and recognisable from the picture alone. Sorted by size, the top `skip` are dropped
 *  (`mammal`, `anthro` - a free square in all but name) and the next `take` kept. */
export function bingoCandidates(pool: readonly PoolTag[], skip = 25, take = 150): string[] {
  return [...pool]
    .filter((t) => (t.category === 0 || t.category === 5) && !NON_VISUAL_TAG.test(t.name))
    .sort((a, b) => b.post_count - a.post_count || a.name.localeCompare(b.name))
    .slice(skip, skip + take)
    .map((t) => t.name);
}

/** The squares (indexes) a post fits - a general or species tag on it. */
export function bingoFits(card: readonly string[], post: Post): number[] {
  const tags = new Set([...post.tags.general, ...post.tags.species]);
  return card.flatMap((tag, i) => (tags.has(tag) ? [i] : []));
}

/** The search for a bingo deck: posts carrying at least one of the still-open squares' tags (an
 *  OR search), so most posts dealt fit something. */
export function bingoDeckTags(card: readonly string[], open: readonly number[]): string {
  return open.map((i) => `~${card[i]}`).join(" ");
}

/** A card: BINGO_SIZE² distinct tags (no free square - on a 3x3 card it made a line too easy).
 *  Null if there aren't enough. */
export function bingoCard(candidates: readonly string[], rand: () => number): string[] | null {
  const squares = BINGO_SIZE * BINGO_SIZE;
  const picked = shuffle([...new Set(candidates)].sort(), rand).slice(0, squares);
  return picked.length < squares ? null : picked;
}

export function dailyBingoCard(candidates: readonly string[], site: string, dayKey: string): string[] | null {
  return bingoCard(candidates, seededRandom(hashString(`bingo:${site}:${dayKey}`)));
}

/** Posts counted against a wrong claim, on top of the post itself. */
export const BINGO_MISS_PENALTY = 1;
