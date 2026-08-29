// Client-side rollups of a user's favourites, for the User Dashboard's "Favorites analysis".
// e621 exposes none of this. Built as a streaming accumulator so a progressive page-by-page fetch
// (queries/useFavoritesAnalysis.ts) never has to hold every Post in memory at once - it folds
// each page in and discards it.

import { extensionOf, type Post } from "../models/post";

export interface Bar {
  label: string;
  count: number;
  /** A representative post's thumbnail URL (raw CDN), used as a faded background on the share
   *  card. For artists: the highest-scored favourited post by them. For tags: a random favourite
   *  carrying that tag. Undefined outside the top artist/tag lists. */
  image?: string;
}

export interface FavoritesAnalysis {
  total: number;
  /** How many of the sampled favourites point to a since-deleted post. */
  deletedCount: number;
  ratings: Bar[];
  fileTypes: Bar[];
  scoreBuckets: Bar[];
  avgScore: number;
  medianScore: number;
  topArtists: Bar[];
  topTags: Bar[];
  byYear: Bar[];
  highestScore: number;
}

const RATING_LABEL: Record<string, string> = {
  s: "Safe",
  q: "Questionable",
  e: "Explicit",
};

function scoreBucket(score: number): string {
  if (score <= 0) return "≤ 0";
  if (score < 25) return "1–24";
  if (score < 50) return "25–49";
  if (score < 100) return "50–99";
  if (score < 250) return "100–249";
  if (score < 500) return "250–499";
  return "500+";
}

const SCORE_BUCKET_ORDER = ["≤ 0", "1–24", "25–49", "50–99", "100–249", "250–499", "500+"];

/** Tags that are technically artist/species/meta tags but aren't meaningful "who / what" signal -
 *  excluded from the artist and character/series tallies so they don't crowd out real results. */
const EXCLUDED_TAGS = new Set(["sound_warning", "conditional_dnp"]);

export interface FavAccumulator {
  total: number;
  deleted: number;
  ratings: Map<string, number>;
  fileTypes: Map<string, number>;
  buckets: Map<string, number>;
  artists: Map<string, number>;
  tags: Map<string, number>;
  years: Map<string, number>;
  scoreSum: number;
  scores: number[];
  highestScore: number;
  /** Per artist: the highest-scored favourited post's thumbnail URL (+ that score). */
  artistBest: Map<string, { url: string; score: number }>;
  /** Per character/copyright/species tag: up to a few favourited-post thumbnail URLs. */
  tagThumbs: Map<string, string[]>;
}

const TAG_THUMB_RESERVOIR = 8;

export function createFavAccumulator(): FavAccumulator {
  return {
    total: 0,
    deleted: 0,
    ratings: new Map(),
    fileTypes: new Map(),
    buckets: new Map(),
    artists: new Map(),
    tags: new Map(),
    years: new Map(),
    scoreSum: 0,
    scores: [],
    highestScore: 0,
    artistBest: new Map(),
    tagThumbs: new Map(),
  };
}

function inc(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

export function addToFavAccumulator(acc: FavAccumulator, posts: Post[]): void {
  for (const post of posts) {
    acc.total += 1;
    if (post.flags?.deleted) acc.deleted += 1;
    inc(acc.ratings, RATING_LABEL[post.rating] ?? post.rating);
    inc(acc.fileTypes, extensionOf(post));

    const score = post.score?.total ?? 0;
    acc.scoreSum += score;
    acc.scores.push(score);
    if (score > acc.highestScore) acc.highestScore = score;
    inc(acc.buckets, scoreBucket(score));

    const thumb = post.preview?.url ?? post.sample?.url ?? undefined;

    for (const a of post.tags.artist) {
      if (EXCLUDED_TAGS.has(a)) continue;
      inc(acc.artists, a);
      if (thumb) {
        const cur = acc.artistBest.get(a);
        if (!cur || score > cur.score) acc.artistBest.set(a, { url: thumb, score });
      }
    }
    for (const t of [...post.tags.character, ...post.tags.copyright, ...post.tags.species]) {
      if (EXCLUDED_TAGS.has(t)) continue;
      inc(acc.tags, t);
      if (thumb) {
        const arr = acc.tagThumbs.get(t);
        if (!arr) acc.tagThumbs.set(t, [thumb]);
        else if (arr.length < TAG_THUMB_RESERVOIR) arr.push(thumb);
      }
    }

    const year = post.created_at?.slice(0, 4);
    if (year && /^\d{4}$/.test(year)) inc(acc.years, year);
  }
}

function tallyTop(
  counts: Map<string, number>,
  limit: number,
  imageFor?: (label: string) => string | undefined,
): Bar[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count, image: imageFor?.(label) }));
}

export function finalizeFavAccumulator(acc: FavAccumulator): FavoritesAnalysis {
  const scores = [...acc.scores].sort((a, b) => a - b);
  const avgScore = acc.total ? acc.scoreSum / acc.total : 0;
  const medianScore = scores.length
    ? scores.length % 2
      ? scores[(scores.length - 1) / 2]
      : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
    : 0;

  return {
    total: acc.total,
    deletedCount: acc.deleted,
    ratings: ["Safe", "Questionable", "Explicit"]
      .filter((r) => acc.ratings.has(r))
      .map((label) => ({ label, count: acc.ratings.get(label)! })),
    fileTypes: tallyTop(acc.fileTypes, 6),
    scoreBuckets: SCORE_BUCKET_ORDER.filter((b) => acc.buckets.has(b)).map((label) => ({
      label,
      count: acc.buckets.get(label)!,
    })),
    avgScore: Math.round(avgScore),
    medianScore: Math.round(medianScore),
    topArtists: tallyTop(acc.artists, 15, (l) => acc.artistBest.get(l)?.url),
    topTags: tallyTop(acc.tags, 20, (l) => {
      const arr = acc.tagThumbs.get(l);
      return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
    }),
    byYear: [...acc.years.keys()].sort().map((label) => ({ label, count: acc.years.get(label)! })),
    highestScore: acc.highestScore,
  };
}

/** Convenience one-shot: accumulate `posts` and finalize. */
export function analyzeFavorites(posts: Post[]): FavoritesAnalysis {
  const acc = createFavAccumulator();
  addToFavAccumulator(acc, posts);
  return finalizeFavAccumulator(acc);
}
