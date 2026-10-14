// Tagdle: a "which tag has more posts?" game in the style of e621dle (teamstarfall/e621dle,
// itself after Rule34dle). Two modes - a Daily run of fixed rounds seeded from the UTC date, and
// Endless (play until the first wrong pick, best streak kept). Pure logic only; the pool fetch
// and persistence live in state/tagdleStore.ts, the UI in components/Tagdle/.

import type { BlacklistEntries } from "./blacklist";

export interface PoolTag {
  name: string;
  post_count: number;
  category: number;
}

export type TagdleCategory = "general" | "artist" | "copyright" | "character" | "species";

/** e621's numeric tag category ids for the categories the game draws from. Lore/meta/invalid are
 *  left out - they're bookkeeping tags, not something anyone has a feel for the size of. */
export const TAGDLE_CATEGORY_ID: Record<TagdleCategory, number> = {
  general: 0,
  artist: 1,
  copyright: 3,
  character: 4,
  species: 5,
};

export const ALL_TAGDLE_CATEGORIES = Object.keys(TAGDLE_CATEGORY_ID) as TagdleCategory[];

export const DAILY_ROUNDS = 10;

/** How far apart (in pool rank) the two tags of a pair may be. Pairing neighbours by rank keeps
 *  rounds close enough to be a guess rather than "obviously the 2M-post tag". */
const PAIR_RANK_WINDOW = 40;

export interface TagdlePair {
  left: PoolTag;
  right: PoolTag;
}

/** UTC calendar day, `YYYY-MM-DD` - the daily puzzle rolls over at 00:00 UTC for everyone. */
export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Deterministic 32-bit PRNG (mulberry32) so a seed always produces the same daily run. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash, for turning a day key + site into a PRNG seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Drops tags the user's blacklist would hide outright (a one-tag blacklist line), so the game
 *  never puts a blacklisted tag's name - or its sample image - on screen. */
export function filterPool(pool: PoolTag[], entries: BlacklistEntries): PoolTag[] {
  const banned = new Set(entries.filter((e) => e.length === 1).map((e) => e[0]));
  return pool.filter((t) => !banned.has(t.name.toLowerCase()));
}

/** Picks one pair from `pool` (any order) using `rand`: a random tag, plus a near neighbour by
 *  post-count rank with a different count, so there's always a right answer. `avoid` names are
 *  skipped where possible so a run doesn't repeat tags. */
export function pickPair(pool: PoolTag[], rand: () => number, avoid: Set<string> = new Set()): TagdlePair | null {
  const ranked = [...pool].sort((a, b) => b.post_count - a.post_count || a.name.localeCompare(b.name));
  if (ranked.length < 2) return null;
  for (let attempt = 0; attempt < 50; attempt++) {
    const i = Math.floor(rand() * ranked.length);
    const offset = 1 + Math.floor(rand() * PAIR_RANK_WINDOW);
    const j = rand() < 0.5 ? i - offset : i + offset;
    if (j < 0 || j >= ranked.length) continue;
    const a = ranked[i];
    const b = ranked[j];
    if (a.post_count === b.post_count) continue;
    if (attempt < 40 && (avoid.has(a.name) || avoid.has(b.name))) continue;
    return rand() < 0.5 ? { left: a, right: b } : { left: b, right: a };
  }
  return null;
}

/** The fixed rounds for one day's puzzle. Same pool + site + day => same pairs. */
export function dailyPairs(pool: PoolTag[], site: string, dayKey: string, rounds = DAILY_ROUNDS): TagdlePair[] {
  const rand = seededRandom(hashString(`${site}:${dayKey}`));
  const used = new Set<string>();
  const pairs: TagdlePair[] = [];
  for (let r = 0; r < rounds; r++) {
    const pair = pickPair(pool, rand, used);
    if (!pair) break;
    used.add(pair.left.name);
    used.add(pair.right.name);
    pairs.push(pair);
  }
  return pairs;
}

export type Side = "left" | "right";

export function correctSide(pair: TagdlePair): Side {
  return pair.left.post_count > pair.right.post_count ? "left" : "right";
}

/** Shareable result block: `Tagdle e621 2026-10-14 7/10` + one emoji per round. */
export function shareText(site: string, dayKey: string, results: boolean[]): string {
  const score = results.filter(Boolean).length;
  const grid = results.map((ok) => (ok ? "🟩" : "🟥")).join("");
  return `Tagdle ${site} ${dayKey} ${score}/${results.length}\n${grid}`;
}

/** Display name for a tag: underscores to spaces, like e621's own tag list. */
export function displayTagName(name: string): string {
  return name.replace(/_/g, " ");
}
