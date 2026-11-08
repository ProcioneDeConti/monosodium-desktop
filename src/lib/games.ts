// Shared pure logic for the Games launcher's post-based games: Score Sniffer (higherLower),
// Whodunnit (artist), Who's That Floof (species), Enhance! (zoom), Horny Jail or Sunday School
// (rating), Tag Hopper (sixDegrees), Sus (oddOneOut), Time Machine (yearGuess) and Tag Bingo
// (bingo) - code ids keep the original working names. Tagdle keeps its own lib/tagdle.ts - the
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

/** Free time at the start of a Floof round before the speed bonus starts to drop: nobody can
 *  recognise a heavily blurred image and read four choices in under a second or two, so that
 *  time shouldn't cost anything. */
export const SPEED_GRACE_MS = 1500;

/** Species Guesser scoring for a correct answer: 50 for getting it right, plus a speed bonus of up
 *  to 50. The bonus holds full through the grace period, then eases off - gently at first, faster
 *  near the end (1 - u²) - reaching 0 at full reveal. So a quick, confident answer lands in the
 *  90s, a mid-blur one in the 80s, and even a last-second one is still worth 50. */
export function speedPoints(elapsedMs: number, revealMs: number): number {
  const span = Math.max(1, revealMs - SPEED_GRACE_MS);
  const u = Math.min(1, Math.max(0, (elapsedMs - SPEED_GRACE_MS) / span));
  return Math.round(50 + 50 * (1 - u * u));
}

/** A round's outcome for the run header's segments and the summary tiles: 1 = right, 0 = wrong,
 *  in between = partly right (Time Machine's near misses). */
export type RoundOutcome = number;

/** Longest run of fully-right rounds. */
export function longestStreak(results: RoundOutcome[]): number {
  let best = 0;
  let run = 0;
  for (const r of results) {
    run = r >= 1 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Fully-right rounds at the end of `results` - the live streak. */
export function currentStreak(results: RoundOutcome[]): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] >= 1; i--) n++;
  return n;
}

export interface RunGrade {
  letter: "S" | "A" | "B" | "C" | "D" | "F";
  title: string;
}

/** Letter grade + a short cheer for a finished run's score out of `max`. */
export function runGrade(score: number, max: number): RunGrade {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 1) return { letter: "S", title: "Flawless!" };
  if (pct >= 0.8) return { letter: "A", title: "Superstar!" };
  if (pct >= 0.6) return { letter: "B", title: "Nice work!" };
  if (pct >= 0.4) return { letter: "C", title: "Not bad!" };
  if (pct > 0) return { letter: "D", title: "Rough run!" };
  return { letter: "F", title: "Ouch!" };
}

/** Tile emoji for one round. */
function outcomeEmoji(r: RoundOutcome): string {
  return r >= 1 ? "🟩" : r > 0 ? "🟨" : "🟥";
}

/** Shareable block for a finished quiz run, e.g.
 *
 *  ```
 *  🎮 Whodunnit · e621
 *  8/10 correct · Grade A
 *  🟩🟩🟥🟩🟩
 *  🟩🟩🟩🟥🟩
 *  🔥 Best streak: 5
 *  ```
 *  Rows of five; the streak line is dropped when it would only repeat the score (none, or all). */
export function runShareText(
  game: string,
  site: string,
  score: number,
  max: number,
  unit: string,
  results: RoundOutcome[],
): string {
  const tiles = results.map(outcomeEmoji);
  const rows: string[] = [];
  for (let i = 0; i < tiles.length; i += 5) rows.push(tiles.slice(i, i + 5).join(""));
  const streak = longestStreak(results);
  const lines = [`🎮 ${game} · ${site}`, `${score}/${max} ${unit} · Grade ${runGrade(score, max).letter}`, ...rows];
  if (streak > 1 && streak < results.length) lines.push(`🔥 Best streak: ${streak}`);
  return lines.join("\n");
}

/** How the launcher reads a game's saved bests: the key's first segment, an optional extra check
 *  on the segments, whether lower is better, and how to word the number. */
const LAUNCHER_BESTS: Partial<
  Record<GameId, { prefix: string; filter?: (parts: string[]) => boolean; lower?: boolean; label: (n: number) => string }>
> = {
  higherLower: { prefix: "higherLower", label: (n) => `Best streak ${n}` },
  artist: { prefix: "artist", label: (n) => `Best ${n}/${QUIZ_ROUNDS}` },
  species: { prefix: "species", label: (n) => `Best ${n} pts` },
  zoom: { prefix: "zoom", label: (n) => `Best ${n} pts` },
  rating: { prefix: "rating", label: (n) => `Best ${n}/${QUIZ_ROUNDS}` },
  sixDegrees: { prefix: "sixDegrees", lower: true, label: (n) => `Best ${n} hop${n === 1 ? "" : "s"}` },
  oddOneOut: { prefix: "oddOneOut2", label: (n) => `Best ${n} pts` },
  yearGuess: { prefix: "yearGuess", label: (n) => `Best ${n} pts` },
  bingo: {
    prefix: "bingo2",
    filter: (p) => p[1] === "line" && p[2] === "random",
    lower: true,
    label: (n) => `Best line in ${n} posts`,
  },
};

/** The launcher tile's "your best" line for a game on `site`: the best across its modes and
 *  difficulties, leaving out Favorites-only runs (a different, personal pool). Null if never
 *  played. Game best keys are `<game>:...` with the site as one of the segments. */
export function launcherBest(id: GameId, best: Record<string, number>, site: string): string | null {
  const spec = LAUNCHER_BESTS[id];
  if (!spec) return null;
  let pick: number | undefined;
  for (const [key, value] of Object.entries(best)) {
    const parts = key.split(":");
    if (parts[0] !== spec.prefix || !parts.includes(site) || parts.includes("fav")) continue;
    if (spec.filter && !spec.filter(parts)) continue;
    if (pick === undefined || (spec.lower ? value < pick : value > pick)) pick = value;
  }
  // A 0 high score means "played, never scored" - not worth a badge.
  if (pick === undefined || (!spec.lower && pick <= 0)) return null;
  return spec.label(pick);
}

/** "a" or "an" for a tag read aloud ("an otter", "a unicorn"): by sound for the usual
 *  you-sounding u/eu/one words, otherwise by the first letter. */
export function indefiniteArticle(word: string): "a" | "an" {
  const w = word.toLowerCase();
  if (/^(uni|use|usu|uti|ura|eu|ewe|one)/.test(w)) return "a";
  return /^[aeiou]/.test(w) ? "an" : "a";
}

/** Score Sniffer's game-over share line, e.g. "🐶 Score Sniffer · e621\n🔥 Streak 12 (score)". */
export function streakShareText(game: string, site: string, stat: string, streak: number, best: number): string {
  const lines = [`🐶 ${game} · ${site}`, `🔥 Streak ${streak} (${stat})`];
  if (streak > best) lines.push("🏆 New best!");
  else lines.push(`🏆 Best ${best}`);
  return lines.join("\n");
}

/** A short cheer for a correct Floof answer, by points earned. */
export function speedLabel(points: number): string {
  if (points >= 98) return "Lightning!";
  if (points >= 90) return "Speedy!";
  if (points >= 75) return "Nice!";
  return "Got it!";
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

/** General tags an Odd One Out round may hinge on: visual ones only (the same filters as Bingo's
 *  squares - no text/meta/resolution tags, nothing usually left untagged, no taxonomy jargon or
 *  judgement calls), the pool by size minus its top `skip` (`solo`, `hi_res` - on half the site, so
 *  they'd be on the odd post too often to read as "shared") and capped at `take`, so the tag is
 *  common enough to be something you'd notice. Rank-based rather than a post-count band so it
 *  scales to e6AI's much smaller counts. */
export function oddOneOutCandidates(pool: readonly PoolTag[], skip = 40, take = 250): string[] {
  return [...pool]
    .filter((t) => t.category === 0 && isFairVisualTag(t.name))
    .sort((a, b) => b.post_count - a.post_count || a.name.localeCompare(b.name))
    .slice(skip, skip + take)
    .map((t) => t.name);
}

/** Most related tags excluded from the odd post's search (each is one more search term). */
const ODD_RELATED_MAX = 12;

/** `tag` plus the candidates in its Bingo family (`white_fur` -> `white_body`, `hat` -> `headwear`):
 *  the odd post must carry none of them, or it'd show the shared trait under another name. */
export function oddRelatedTags(tag: string, candidates: readonly string[]): string[] {
  const family = bingoFamily(tag);
  const members = family === tag ? [] : (FAMILY_MEMBERS.get(family) ?? []);
  const related = new Set([tag, ...members, ...candidates.filter((t) => t !== tag && bingoFamily(t) === family)]);
  return [...related].slice(0, ODD_RELATED_MAX);
}

/** Odd One Out scoring: right answer, and right answer after taking the hint. */
export const ODD_POINTS = 10;
export const ODD_HINT_POINTS = 5;

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
  const related = oddRelatedTags(tag, [...allowed]);
  const shared = shuffle(withTag.get(tag)!, rand).slice(0, 3);
  const without = shuffle(fresh.filter((p) => !related.some((t) => p.tags.general.includes(t))), rand)[0];
  // Every post lacking the tag carries a relative of it - try the next tag rather than a muddy round.
  if (!without) {
    const rest = new Set(allowed);
    rest.delete(tag);
    return rest.size > 0 ? oddOneOutFromPosts(posts, rest, used, rand) : null;
  }
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

/** Tags that are unfair as squares even though they're visual:
 *  - near-universal details that taggers often leave off (you can see the teeth, but the post
 *    isn't tagged `teeth`, so a correct-looking claim misses);
 *  - e621 taxonomy/clothing jargon (`felid`, `topwear`) - the plain member of the family
 *    (`domestic_cat`, `shirt`) stays in;
 *  - judgements rather than things you can point at (`ambiguous_gender`, `looking_pleasured`);
 *  (`young*` tags are dropped separately by YOUNG_TAG.) */
const UNFAIR_BINGO_TAG = new Set([
  // often present, often untagged
  "teeth", "claws", "tuft", "biped", "standing", "navel", "eyebrows", "eyelashes", "markings",
  "black_nose", "pawpads", "paws", "fangs", "vein", "feet", "belly", "tongue", "open_mouth",
  "narrowed_eyes", "wide_hips", "thick_thighs", "sweat", "saliva", "heart_symbol", "spreading",
  "holding_object", "furniture", "plant", "solo_focus",
  // jargon / clades
  "felid", "felis", "canis", "canid", "equid", "scalie", "mythological_scalie",
  "mythological_creature", "lagomorph", "leporid", "humanoid", "humanoid_genitalia",
  "animal_genitalia", "penile", "topwear", "bottomwear", "legwear", "headgear", "handwear",
  "anthro_on_anthro", "interspecies", "bovid", "pantherine", "mythological_equine", "hybrid",
  "canine_genitalia", "accessory", "countershading", "toe_claws", "hyper", "gynomorph",
  "equine_genitalia", "animal_humanoid", "not_furry", "pupils", "pose", "glistening",
  "slightly_chubby",
  // judgement calls
  "ambiguous_gender", "intersex", "looking_pleasured", "size_difference", "dominant", "submissive",
  "seductive", "femboy", "fluffy", "orgasm",
]);

/** `young`, `young_anthro`, ... - excluded outright, not left to the player's blacklist. */
const YOUNG_TAG = /(^|_)young(_|$)/;

/** Groups of tags that overlap so much that two on one card make it unclear which square a post
 *  belongs to. A card takes at most one tag per family. */
const BINGO_FAMILIES: readonly (readonly string[])[] = [
  ["feline", "domestic_cat", "lion", "tiger"],
  ["canine", "domestic_dog", "wolf", "fox"],
  ["equine", "horse", "pony"],
  ["rabbit", "bunny"],
  ["reptile", "lizard", "snake"],
  ["big_breasts", "huge_breasts", "hyper_breasts"],
  ["big_penis", "huge_penis", "humanoid_penis", "animal_penis", "canine_penis", "veiny_penis",
    "erection", "knot", "foreskin"],
  ["big_balls", "huge_balls"],
  ["big_butt", "huge_butt"],
  ["muscular", "muscular_male", "muscular_anthro", "muscular_female", "abs", "pecs"],
  ["penetration", "penile_penetration", "male_penetrating", "male_penetrating_female",
    "female_penetrated", "male_penetrated", "anthro_penetrated", "vaginal", "vaginal_penetration",
    "anal", "anal_penetration", "oral", "fellatio", "penis_in_vagina", "male_penetrating_male",
    "anthro_penetrating", "anthro_penetrating_anthro", "from_behind_position", "masturbation"],
  ["cum", "cum_inside", "cum_in_vagina", "ejaculation"],
  ["footwear", "shoes"],
  ["headwear", "hat"],
  ["eyewear", "glasses"],
  ["piercing", "ear_piercing", "jewelry"],
  ["spread_legs", "presenting", "on_back", "lying"],
];

/** Fair to build a visual round on: not meta/text-ish, not usually left untagged, not jargon or
 *  a judgement call, never `young*`. Shared by Bingo squares and Odd One Out tags. */
function isFairVisualTag(name: string): boolean {
  return !NON_VISUAL_TAG.test(name) && !UNFAIR_BINGO_TAG.has(name) && !YOUNG_TAG.test(name);
}

const FAMILY_MEMBERS = new Map<string, readonly string[]>(BINGO_FAMILIES.map((group, i) => [`family:${i}`, group]));

const FAMILY_OF = new Map(BINGO_FAMILIES.flatMap((group, i) => group.map((t) => [t, `family:${i}`] as const)));

/** The family a square tag belongs to - `white_body` and `white_fur` share one (same colour), as
 *  does each explicit group above; anything else is its own family. */
export function bingoFamily(tag: string): string {
  const colour = /^([a-z]+)_(body|fur|scales|feathers)$/.exec(tag);
  if (colour) return `colour:${colour[1]}`;
  return FAMILY_OF.get(tag) ?? tag;
}

/** Bingo square candidates: general/species tags common enough to turn up within a few dozen random
 *  posts and recognisable from the picture alone. Sorted by size, the top `skip` are dropped
 *  (`mammal`, `anthro` - a free square in all but name) and the next `take` kept. */
export function bingoCandidates(pool: readonly PoolTag[], skip = 25, take = 150): string[] {
  return [...pool]
    .filter(
      (t) => (t.category === 0 || t.category === 5) && isFairVisualTag(t.name),
    )
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

/** A card: BINGO_SIZE² distinct tags, at most one per `bingoFamily` (no free square - on a 3x3
 *  card it made a line too easy). Null if there aren't enough. */
export function bingoCard(candidates: readonly string[], rand: () => number): string[] | null {
  const squares = BINGO_SIZE * BINGO_SIZE;
  const families = new Set<string>();
  const picked: string[] = [];
  for (const tag of shuffle([...new Set(candidates)].sort(), rand)) {
    const family = bingoFamily(tag);
    if (families.has(family)) continue;
    families.add(family);
    picked.push(tag);
    if (picked.length === squares) return picked;
  }
  return null;
}

export function dailyBingoCard(candidates: readonly string[], site: string, dayKey: string): string[] | null {
  return bingoCard(candidates, seededRandom(hashString(`bingo:${site}:${dayKey}`)));
}

/** The saved best key for a Bingo run. "bingo2": since a post fills every square it fits, older
 *  (pre-multi-fill) bests aren't comparable. `dayKey` null for a random card. */
export function bingoBestKey(site: string, blackout: boolean, dayKey: string | null, fav: boolean): string {
  return `bingo2:${blackout ? "blackout" : "line"}:${dayKey ? `daily:${dayKey}` : "random"}:${site}${fav ? ":fav" : ""}`;
}

/** Today's daily Bingo result for the launcher: the fewest posts a line took on today's card
 *  (not Favorites only - that's a different deck), or undefined if it hasn't been won today. */
export function bingoDailyBest(best: Record<string, number>, site: string, dayKey: string): number | undefined {
  return best[bingoBestKey(site, false, dayKey, false)];
}

/** Shareable block for a finished card - the card as squares (🟨 the winning line, 🟩 other
 *  claimed squares, ⬜ open), no tags, so it doesn't spoil the daily:
 *
 *  ```
 *  🎯 Tag Bingo · e621 · 2026-11-08
 *  Line in 7 posts
 *  🟨🟩⬜
 *  ⬜🟨⬜
 *  🟩⬜🟨
 *  ```
 */
export function bingoShareText(
  site: string,
  dayKey: string | null,
  count: number,
  blackout: boolean,
  marked: readonly boolean[],
  line: readonly number[],
): string {
  const head = `🎯 Tag Bingo · ${site} · ${dayKey ?? "random card"}`;
  const rows: string[] = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    let row = "";
    for (let c = 0; c < BINGO_SIZE; c++) {
      const i = r * BINGO_SIZE + c;
      row += line.includes(i) && !blackout ? "🟨" : marked[i] ? "🟩" : "⬜";
    }
    rows.push(row);
  }
  return [head, `${blackout ? "Blackout" : "Line"} in ${count} post${count === 1 ? "" : "s"}`, ...rows].join("\n");
}

/** Posts counted against a wrong claim, on top of the post itself. */
export const BINGO_MISS_PENALTY = 1;

/** Extra posts charged for a wrong claim: none if the post did fit some other open square (you
 *  spotted a match, just picked the wrong one - the post is spent either way), the full penalty
 *  if it fit nothing open and Skip was the right call. `openFits` = `bingoFits` minus marked. */
export function bingoMissPenalty(openFits: readonly number[]): number {
  return openFits.length > 0 ? 0 : BINGO_MISS_PENALTY;
}
