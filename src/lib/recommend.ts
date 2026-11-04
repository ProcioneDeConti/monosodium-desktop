// "For you" candidate generation + ranking. e621 search can't rank by overlap with a taste
// vector, so a handful of searches built from the profile's strongest tags only *gather*
// candidates; the actual ordering happens here, client-side. Pure (no I/O) - the fetch loop lives
// in queries/useForYou.ts.

import type { Post } from "../models/post";
import { gaussian, seededRandom } from "./random";
import { NOISE_TAGS, TASTE_CATEGORIES, type TasteProfile, type TasteTag } from "./tasteProfile";

/** e621's own per-query tag cap is 40; stay well under it. */
export const MAX_QUERY_TAGS = 24;
export const CANDIDATE_PAGE_LIMIT = 100;
/** How many suggestion searches one round runs. */
export const SOURCES_PER_ROUND = 6;
const RECENT_DAYS = 90;
const AVOID_IN_QUERY = 3;

export interface CandidateSource {
  key: string;
  query: string;
  /** Next numbered page (these searches all use non-id `order:`s, which e621 only pages by
   *  number - see queries/usePostsQuery.ts). */
  page: number;
  /** Random first page (1..MAX_START_PAGE) for a fresh pool each run; pages before it are only
   *  visited after wrapping around. */
  startPage: number;
  /** Has looped back to page 1 (and stops on reaching `startPage`). */
  wrapped: boolean;
  /** Any page fetched yet. */
  fetched: boolean;
  done: boolean;
}

/** Score-ordered searches start on a random page in 1..this, so each run draws on roughly the top
 *  MAX_START_PAGE x CANDIDATE_PAGE_LIMIT matches instead of always the same top page. */
export const MAX_START_PAGE = 3;

/** Update a source after fetching its current page (`received` posts). Returns true if the page
 *  should be retried *now* at page 1: the random start page came back empty on the very first
 *  fetch, i.e. a small search whose results all sit on earlier pages - the one case that costs an
 *  extra request. Otherwise a source that runs dry having started past page 1 loops back to page
 *  1 for later batches, so the pages it skipped are never lost. */
export function advanceSource(src: CandidateSource, received: number): boolean {
  const first = !src.fetched;
  src.fetched = true;
  if (received < CANDIDATE_PAGE_LIMIT) {
    if (src.startPage > 1 && !src.wrapped) {
      src.wrapped = true;
      src.page = 1;
      return first && received === 0;
    }
    src.done = true;
    return false;
  }
  src.page += 1;
  if (src.wrapped && src.page >= src.startPage) src.done = true;
  return false;
}

export interface QueryContext {
  targetName: string;
  /** settingsStore.ratingTagFilter() output, or null. */
  ratingFilter: string | null;
  /** Stable per refresh, for the `order:random` discovery source. */
  seed: number;
  now: Date;
  /** 0 for the first round; later rounds step down the tag ranking ("Suggest more" after the
   *  first round's searches run dry). */
  round?: number;
}

function orGroup(tags: string[]): string {
  return tags.length === 1 ? tags[0] : tags.map((t) => `~${t}`).join(" ");
}

function pick(tags: TasteTag[], start: number, count: number): string[] {
  return tags.slice(start, start + count).map((t) => t.name);
}

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Up to SOURCES_PER_ROUND searches. Every one excludes the target's own favourites and the
 *  profile's strongest avoid-tags, and carries the user's rating filter. */
export function candidateQueries(profile: TasteProfile, ctx: QueryContext): CandidateSource[] {
  const r = ctx.round ?? 0;
  const by = Object.fromEntries(
    TASTE_CATEGORIES.map((c) => [c, profile.tags.filter((t) => t.category === c)]),
  ) as Record<(typeof TASTE_CATEGORIES)[number], TasteTag[]>;
  const charLike = [...by.character, ...by.copyright].sort((a, b) => b.weight - a.weight);

  const artistsA = pick(by.artist, r * 6, 3);
  const artistsB = pick(by.artist, r * 6 + 3, 3);
  const chars = pick(charLike, r * 4, 4);
  const species = pick(by.species, r * 2, 2);
  const general = pick(by.general, r * 5, 5);

  const suffix = [
    `-fav:${ctx.targetName}`,
    ...profile.avoid.slice(0, AVOID_IN_QUERY).map((t) => `-${t}`),
    ctx.ratingFilter ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const raw: [string, string[], string][] = [
    ["artists-a", artistsA.length ? [orGroup(artistsA)] : [], "order:score"],
    ["artists-b", artistsB.length ? [orGroup(artistsB)] : [], "order:score"],
    ["characters", chars.length ? [orGroup(chars)] : [], "order:score"],
    [
      "species-general",
      species.length && general.length >= 2 ? [species[0], general[0], general[1]] : [],
      "order:score",
    ],
    [
      "recent",
      general.length >= 2
        ? [orGroup(general.slice(0, 3)), ...(species[0] ? [species[0]] : []), `date:>=${isoDaysAgo(ctx.now, RECENT_DAYS)}`]
        : [],
      "order:score",
    ],
    [
      "discovery",
      general.length >= 4 || species.length >= 2
        ? [orGroup([...species.slice(1, 2), ...general.slice(3, 5)].filter(Boolean))]
        : [],
      `order:random randseed:${ctx.seed}`,
    ],
  ];

  const pageRand = seededRandom(ctx.seed * 31 + r + 1);
  const out: CandidateSource[] = [];
  for (const [key, body, order] of raw) {
    if (body.length === 0 || body[0] === "") continue;
    const query = [body.join(" "), suffix, order].filter(Boolean).join(" ");
    if (query.split(/\s+/).length > MAX_QUERY_TAGS) continue;
    // The random-order source is already fresh every run; the score-ordered ones get a random
    // starting page (stable for a given seed).
    const startPage = key === "discovery" ? 1 : 1 + Math.floor(pageRand() * MAX_START_PAGE);
    out.push({ key: `${key}#${r}`, query, page: startPage, startPage, wrapped: false, fetched: false, done: false });
  }
  return out;
}

/** Highest round that still yields any source for this profile (rotation stops there). */
export function hasRound(profile: TasteProfile, ctx: QueryContext, round: number): boolean {
  return candidateQueries(profile, { ...ctx, round }).length > 0;
}

export interface RankContext {
  /** The suggestions are for the signed-in user - their own votes/favourite flags apply. */
  isSelf: boolean;
  /** Post ids already shown this session (or already queued). */
  shown: Set<number>;
  /** Per-run randomness: shuffles the order a little each run (see SHUFFLE_SIGMA). Omit for a
   *  pure relevance order. */
  rand?: () => number;
}

/** Spread of the per-run shuffle: each score is scaled by e^(SHUFFLE_SIGMA x N(0,1)) before
 *  sorting - about +-45% typical - so strong matches still tend to lead, but the order (and so
 *  the first screenful) is different every run. */
export const SHUFFLE_SIGMA = 0.45;

function postTagNames(post: Post): string[] {
  const out: string[] = [];
  for (const c of TASTE_CATEGORIES) out.push(...(post.tags[c] ?? []));
  return out;
}

/** Σ weights of the post's tags / √(its tag count) - so a heavily-tagged post doesn't win just by
 *  carrying more tags - plus a small popularity prior. */
export function scorePost(post: Post, weights: Map<string, number>): number {
  const names = postTagNames(post);
  let sum = 0;
  for (const n of names) sum += weights.get(n) ?? 0;
  const norm = Math.sqrt(Math.max(1, names.length));
  return sum / norm + 0.15 * Math.log1p(Math.max(0, post.score?.total ?? 0));
}

export function weightMap(profile: TasteProfile): Map<string, number> {
  return new Map(profile.tags.map((t) => [t.name, t.weight]));
}

/** Filter + score + diversify a candidate batch. Returns the new posts in display order. */
export function rankCandidates(posts: Post[], profile: TasteProfile, ctx: RankContext): Post[] {
  const weights = weightMap(profile);
  const avoid = new Set(profile.avoid);
  const seen = new Set<number>();
  const scored: { post: Post; score: number }[] = [];
  for (const post of posts) {
    if (seen.has(post.id) || ctx.shown.has(post.id)) continue;
    seen.add(post.id);
    if (post.flags?.deleted) continue;
    if (ctx.isSelf && (post.is_favorited || post.vote_by === 1 || post.vote_by === -1)) continue;
    if (avoid.size > 0 && postTagNames(post).some((t) => avoid.has(t))) continue;
    const score = scorePost(post, weights);
    scored.push({ post, score: ctx.rand ? score * Math.exp(SHUFFLE_SIGMA * gaussian(ctx.rand)) : score });
  }
  scored.sort((a, b) => b.score - a.score);
  return diversify(scored.map((s) => s.post));
}

export const DIVERSITY_WINDOW = 12;
export const MAX_PER_ARTIST_IN_WINDOW = 2;

function artistsOf(post: Post): string[] {
  return post.tags.artist.filter((a) => !NOISE_TAGS.has(a));
}

/** Greedy re-order: keep score order, but a post whose artist already appears
 *  MAX_PER_ARTIST_IN_WINDOW times in the last DIVERSITY_WINDOW slots waits for a later slot. If
 *  nothing remaining fits, the best one goes in anyway (never drops posts). */
export function diversify(posts: Post[]): Post[] {
  const pool = [...posts];
  const out: Post[] = [];
  while (pool.length) {
    const window = out.slice(-(DIVERSITY_WINDOW - 1));
    const counts = new Map<string, number>();
    for (const p of window) for (const a of artistsOf(p)) counts.set(a, (counts.get(a) ?? 0) + 1);
    let idx = pool.findIndex((p) =>
      artistsOf(p).every((a) => (counts.get(a) ?? 0) < MAX_PER_ARTIST_IN_WINDOW),
    );
    if (idx < 0) idx = 0;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
