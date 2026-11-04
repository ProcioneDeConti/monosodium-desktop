// "For you" taste profile: a weighted tag vector built from a user's favourites (plus, for the
// signed-in user only, their up/down votes). Pure - fed page by page from lib/favoritePages.ts
// the same way the Dashboard's FavAccumulator is, then finalized against site-wide tag counts so
// rare tags (a niche artist, a specific character) outweigh near-universal ones (`solo`, `anthro`).

import type { Post } from "../models/post";
import type { Site } from "../models/site";
import type { TagInfo } from "../models/wiki";
import { EXCLUDED_TAGS } from "./favoritesAnalysis";

export type TasteCategory = "artist" | "character" | "copyright" | "species" | "general";
export const TASTE_CATEGORIES: TasteCategory[] = [
  "artist",
  "character",
  "copyright",
  "species",
  "general",
];

export type TasteSignal = "fav" | "up" | "down";
const SIGNAL_WEIGHT: Record<"fav" | "up", number> = { fav: 1, up: 0.5 };

/** Placeholder / housekeeping names that say nothing about taste. */
export const NOISE_TAGS = new Set([
  ...EXCLUDED_TAGS,
  "unknown_artist",
  "anonymous_artist",
  "unknown_artist_signature",
  "third-party_edit",
  "avoid_posting",
  "artist_request",
  "invalid_tag",
]);

/** Rough site-wide post count for the idf term. Only its order of magnitude matters. */
export const SITE_POSTS = 5_500_000;

/** Per-category multiplier on the final weight: general tags are plentiful and individually
 *  weak signals, so they're damped to keep them from drowning out artists/characters. */
export const CATEGORY_FACTOR: Record<TasteCategory, number> = {
  artist: 1.2,
  character: 1,
  copyright: 0.8,
  species: 0.9,
  general: 0.6,
};

export const PROFILE_TAG_LIMIT = 150;
export const TAG_LOOKUP_LIMIT = 320;

interface TagTally {
  category: TasteCategory;
  /** Weighted positive count (fav = 1, upvote = 0.5). */
  pos: number;
  /** Raw number of downvoted posts carrying the tag. */
  down: number;
}

export interface TasteAccumulator {
  /** Weighted positive samples (the normaliser). */
  positives: number;
  downPosts: number;
  /** Raw favourite count, for the "built from N favourites" note. */
  favCount: number;
  tags: Map<string, TagTally>;
}

export function createTasteAccumulator(): TasteAccumulator {
  return { positives: 0, downPosts: 0, favCount: 0, tags: new Map() };
}

export function addToTaste(acc: TasteAccumulator, posts: Post[], signal: TasteSignal): void {
  for (const post of posts) {
    if (signal === "down") acc.downPosts += 1;
    else {
      acc.positives += SIGNAL_WEIGHT[signal];
      if (signal === "fav") acc.favCount += 1;
    }
    for (const category of TASTE_CATEGORIES) {
      for (const name of post.tags[category] ?? []) {
        if (NOISE_TAGS.has(name)) continue;
        let t = acc.tags.get(name);
        if (!t) {
          t = { category, pos: 0, down: 0 };
          acc.tags.set(name, t);
        }
        if (signal === "down") t.down += 1;
        else t.pos += SIGNAL_WEIGHT[signal];
      }
    }
  }
}

/** The names worth one batched `tags.json` lookup: the most frequent positive tags. */
export function tagNamesForLookup(acc: TasteAccumulator, limit = TAG_LOOKUP_LIMIT): string[] {
  return [...acc.tags.entries()]
    .filter(([, t]) => t.pos > 0)
    .sort((a, b) => b[1].pos - a[1].pos)
    .slice(0, limit)
    .map(([name]) => name);
}

export interface TasteTag {
  name: string;
  category: TasteCategory;
  weight: number;
}

export type TasteMode = "recent" | "all";

export interface TasteTarget {
  id: number;
  name: string;
  avatarId: number | null;
}

export interface TasteProfile {
  site: Site;
  user: TasteTarget;
  mode: TasteMode;
  /** Favourites the profile was built from. */
  sampled: number;
  /** Whether the user's own up/down votes fed into it (signed-in user only). */
  usedVotes: boolean;
  builtAt: number;
  /** Positive weights, strongest first. */
  tags: TasteTag[];
  /** Tags the user consistently downvotes - posts carrying them are never suggested. */
  avoid: string[];
}

function idf(postCount: number): number {
  return Math.max(0.1, Math.log(SITE_POSTS / Math.max(1, postCount)));
}

function median(xs: number[]): number {
  if (xs.length === 0) return idf(1000);
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** tf (share of positive samples carrying the tag) × idf × category factor. Tags seen only once
 *  in a sizeable sample are dropped as noise. Downvote-dominated tags go to `avoid`. */
export function finalizeTaste(
  acc: TasteAccumulator,
  tagInfos: TagInfo[],
  meta: Omit<TasteProfile, "tags" | "avoid" | "sampled">,
): TasteProfile {
  const counts = new Map(tagInfos.map((t) => [t.name, t.post_count]));
  const fallbackIdf = median([...counts.values()].map(idf));
  const n = Math.max(1, acc.positives);
  const minPos = n >= 20 ? 2 : 1;

  const tags: TasteTag[] = [];
  const avoid: string[] = [];
  for (const [name, t] of acc.tags) {
    if (acc.downPosts > 0 && t.down >= 2) {
      const downRate = t.down / acc.downPosts;
      const posRate = t.pos / n;
      if (downRate >= 0.05 && downRate > 3 * posRate) {
        avoid.push(name);
        continue;
      }
    }
    if (t.pos < minPos) continue;
    const c = counts.get(name);
    const w = (t.pos / n) * (c != null ? idf(c) : fallbackIdf) * CATEGORY_FACTOR[t.category];
    if (w > 0) tags.push({ name, category: t.category, weight: w });
  }
  tags.sort((a, b) => b.weight - a.weight);
  return {
    ...meta,
    sampled: acc.favCount,
    tags: tags.slice(0, PROFILE_TAG_LIMIT),
    avoid,
  };
}

/** Cheap pre-idf word list for the loading animation while pages are still arriving: raw
 *  frequency, with general tags damped hard (without idf, `solo`/`female` would top it). */
export function progressiveWords(acc: TasteAccumulator, limit: number): TasteTag[] {
  const n = Math.max(1, acc.positives);
  return [...acc.tags.entries()]
    .filter(([, t]) => t.pos > 0)
    .map(([name, t]) => ({
      name,
      category: t.category,
      weight: (t.pos / n) * (t.category === "general" ? 0.3 : CATEGORY_FACTOR[t.category]),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}
