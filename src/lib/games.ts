// Shared pure logic for the Games launcher's post-based games (Higher or Lower, Artist/Species
// Guesser, Zoom Reveal, Rating Judge, Six Degrees). Tagdle keeps its own lib/tagdle.ts - the
// seeded PRNG / day key helpers are reused from there so every daily rolls over together.

import type { Post } from "../models/post";
import { hashString, seededRandom, type PoolTag } from "./tagdle";

export type GameId = "tagdle" | "higherLower" | "artist" | "species" | "zoom" | "rating" | "sixDegrees";

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
