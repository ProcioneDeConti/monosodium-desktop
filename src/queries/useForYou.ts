// "For you" pipeline: build (or load) a taste profile from a user's favourites, then gather and
// rank suggestions. Every request goes through the normal rate-limited `e621Api.getPosts` /
// `getTagsByNames` path, strictly one after another, so a run can never exceed e621's limit.
//
//   profiling  - fav:<name> pages (960 most recent, or all), plus the signed-in user's own
//                up/down votes, folded into lib/tasteProfile.ts; one tags.json lookup for idf.
//   gathering  - lib/recommend.ts's ~6 candidate searches, ranked client-side.
//   ready      - grid shown; `more()` pages every search further (rotating to the next-ranked
//                tag groups once they run dry).

import { useCallback, useEffect, useRef, useState } from "react";
import { e621Api } from "../api/client";
import type { Post } from "../models/post";
import type { Site } from "../models/site";
import { errorMessage } from "../lib/errors";
import { FAV_PAGE_LIMIT, fetchPostPages } from "../lib/favoritePages";
import {
  addToTaste,
  createTasteAccumulator,
  finalizeTaste,
  progressiveWords,
  tagNamesForLookup,
  type TasteMode,
  type TasteProfile,
  type TasteTag,
  type TasteTarget,
} from "../lib/tasteProfile";
import {
  advanceSource,
  CANDIDATE_PAGE_LIMIT,
  candidateQueries,
  countArtists,
  rankCandidates,
  type CandidateSource,
} from "../lib/recommend";
import {
  getTasteProfile,
  isProfileFresh,
  markProfileBuildStarted,
  profileGapRemaining,
  saveTasteProfile,
} from "../state/tasteProfileStore";
import { seededRandom } from "../lib/random";
import { useSettingsStore } from "../state/settingsStore";
import { subscribePostUpdates } from "./postCache";
import { useAccountStore } from "../state/accountStore";

export const RECENT_FAVORITES = 960;
const WALL_WORDS = 40;
/** "Suggest more" keeps paging until at least this many new posts arrive (or it runs dry). */
const MIN_NEW_PER_BATCH = 24;
const MAX_ROUNDS_PER_BATCH = 3;

export type ForYouPhase =
  | "idle"
  | "waiting"
  | "profiling"
  | "gathering"
  | "ready"
  | "empty"
  | "private"
  | "error";

export interface ForYouState {
  phase: ForYouPhase;
  target: TasteTarget | null;
  mode: TasteMode;
  isSelf: boolean;
  profile: TasteProfile | null;
  /** Words for the loading wall (strongest first). */
  words: TasteTag[];
  pagesDone: number;
  /** 0 = unknown up front. */
  pagesPlanned: number;
  sourcesDone: number;
  sourcesPlanned: number;
  posts: Post[];
  /** Bumped when "Suggest more" swaps in a fresh batch (the grid remounts at the top). */
  batch: number;
  loadingMore: boolean;
  exhausted: boolean;
  /** Profile build was stopped early and uses only what had been fetched. */
  partial: boolean;
  error: string | null;
}

export interface ForYouTargetInput extends TasteTarget {
  favoriteCount: number | null;
}

const INITIAL: ForYouState = {
  phase: "idle",
  target: null,
  mode: "recent",
  isSelf: false,
  profile: null,
  words: [],
  pagesDone: 0,
  pagesPlanned: 0,
  sourcesDone: 0,
  sourcesPlanned: 0,
  posts: [],
  batch: 0,
  loadingMore: false,
  exhausted: false,
  partial: false,
  error: null,
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function plannedFavoritePages(mode: TasteMode, favoriteCount: number | null): number {
  if (favoriteCount == null) return mode === "recent" ? RECENT_FAVORITES / FAV_PAGE_LIMIT : 0;
  const want = mode === "recent" ? Math.min(RECENT_FAVORITES, favoriteCount) : favoriteCount;
  return Math.max(1, Math.ceil(want / FAV_PAGE_LIMIT));
}

export function useForYou(site: Site) {
  const [state, setState] = useState<ForYouState>(INITIAL);
  const runIdRef = useRef(0);
  const stopProfilingRef = useRef(false);
  // Gathering state lives in refs - it's only read by the fetch loop, never rendered.
  const sourcesRef = useRef<CandidateSource[]>([]);
  const roundRef = useRef(0);
  const shownRef = useRef(new Set<number>());
  const artistCountsRef = useRef(new Map<string, number>());
  const seedRef = useRef(0);
  /** Per-run shuffle source (seeded with seedRef), so every run's order is fresh. */
  const randRef = useRef<(() => number) | null>(null);
  const ctxRef = useRef<{ profile: TasteProfile; isSelf: boolean } | null>(null);

  useEffect(
    () => () => {
      runIdRef.current += 1;
    },
    [],
  );

  // Votes and favorites made from this grid/viewer patch the post here too - these posts live in
  // this hook's state, not the query cache, so the cache patch alone wouldn't reach them.
  useEffect(
    () =>
      subscribePostUpdates((postId, updater) =>
        setState((s) =>
          s.posts.some((p) => p.id === postId)
            ? { ...s, posts: s.posts.map((p) => (p.id === postId ? updater(p) : p)) }
            : s,
        ),
      ),
    [],
  );

  const queryCtx = (profile: TasteProfile, round: number) => ({
    targetName: profile.user.name,
    ratingFilter: useSettingsStore.getState().ratingTagFilter(),
    seed: seedRef.current,
    now: new Date(),
    round,
  });

  /** Page every live source once; rotate rounds when all are dry. Returns the new ranked posts. */
  const gatherBatch = useCallback(
    async (alive: () => boolean, onSource?: (done: number, planned: number) => void) => {
      const ctx = ctxRef.current;
      if (!ctx) return { posts: [] as Post[], exhausted: true };
      const out: Post[] = [];
      let exhausted = false;
      for (let i = 0; i < MAX_ROUNDS_PER_BATCH && out.length < MIN_NEW_PER_BATCH; i++) {
        let live = sourcesRef.current.filter((s) => !s.done);
        if (live.length === 0) {
          roundRef.current += 1;
          sourcesRef.current = candidateQueries(ctx.profile, queryCtx(ctx.profile, roundRef.current));
          live = sourcesRef.current;
          if (live.length === 0) {
            exhausted = true;
            break;
          }
        }
        const batch: Post[] = [];
        let failures = 0;
        for (const [n, src] of live.entries()) {
          try {
            // At most two passes: the second only when a random start page was empty (see
            // advanceSource).
            for (let attempt = 0; attempt < 2; attempt++) {
              const resp = await e621Api.getPosts(
                site,
                src.query,
                CANDIDATE_PAGE_LIMIT,
                src.page > 1 ? String(src.page) : undefined,
              );
              if (!alive()) return { posts: [], exhausted: false };
              batch.push(...resp.posts);
              if (!advanceSource(src, resp.posts.length)) break;
            }
          } catch {
            if (!alive()) return { posts: [], exhausted: false };
            failures += 1;
            src.done = true;
          }
          onSource?.(n + 1, live.length);
        }
        if (failures === live.length && out.length === 0 && i === 0) {
          throw new Error("Couldn't reach e621 to gather suggestions.");
        }
        const ranked = rankCandidates(batch, ctx.profile, {
          isSelf: ctx.isSelf,
          shown: shownRef.current,
          artistCounts: artistCountsRef.current,
          rand: randRef.current ?? undefined,
        });
        for (const p of ranked) shownRef.current.add(p.id);
        countArtists(ranked, artistCountsRef.current);
        out.push(...ranked);
      }
      return { posts: out, exhausted };
    },
    // queryCtx only reads stores/refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [site],
  );

  const gather = useCallback(
    async (profile: TasteProfile, isSelf: boolean, myRun: number) => {
      const alive = () => runIdRef.current === myRun;
      ctxRef.current = { profile, isSelf };
      roundRef.current = 0;
      shownRef.current = new Set();
      artistCountsRef.current = new Map();
      seedRef.current = Math.floor(Math.random() * 1_000_000);
      randRef.current = seededRandom(seedRef.current);
      sourcesRef.current = candidateQueries(profile, queryCtx(profile, 0));
      setState((s) => ({
        ...s,
        phase: "gathering",
        profile,
        words: s.words.length ? s.words : profile.tags.slice(0, WALL_WORDS),
        sourcesDone: 0,
        sourcesPlanned: sourcesRef.current.length,
      }));
      const { posts, exhausted } = await gatherBatch(alive, (done, planned) =>
        setState((s) => ({ ...s, sourcesDone: done, sourcesPlanned: planned })),
      );
      if (!alive()) return;
      setState((s) => ({
        ...s,
        phase: posts.length ? "ready" : "empty",
        posts,
        exhausted,
        // Swap the wall to the final (idf-weighted) words for any later rebuild display.
        words: profile.tags.slice(0, WALL_WORDS),
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gatherBatch],
  );

  const start = useCallback(
    async (target: ForYouTargetInput, mode: TasteMode, opts: { rebuild?: boolean } = {}) => {
      const myRun = (runIdRef.current += 1);
      const alive = () => runIdRef.current === myRun;
      stopProfilingRef.current = false;
      const me = useAccountStore.getState().accounts[site]?.username?.toLowerCase();
      const isSelf = !!me && me === target.name.toLowerCase();
      const user: TasteTarget = { id: target.id, name: target.name, avatarId: target.avatarId };

      setState({ ...INITIAL, phase: "profiling", target: user, mode, isSelf });

      try {
        const cached = getTasteProfile(site, target.name, mode);
        if (cached && isProfileFresh(cached) && !opts.rebuild) {
          setState((s) => ({ ...s, words: cached.tags.slice(0, WALL_WORDS) }));
          await gather(cached, isSelf, myRun);
          return;
        }

        const wait = profileGapRemaining();
        if (wait > 0) {
          setState((s) => ({ ...s, phase: "waiting" }));
          await sleep(wait);
          if (!alive()) return;
          setState((s) => ({ ...s, phase: "profiling" }));
        }
        markProfileBuildStarted();

        const favPages = plannedFavoritePages(mode, target.favoriteCount);
        setState((s) => ({ ...s, pagesPlanned: favPages ? favPages + (isSelf ? 2 : 0) + 1 : 0 }));

        const acc = createTasteAccumulator();
        const bump = (posts: Post[], signal: "fav" | "up" | "down") => {
          addToTaste(acc, posts, signal);
          const words = progressiveWords(acc, WALL_WORDS);
          setState((s) => ({ ...s, pagesDone: s.pagesDone + 1, words }));
        };

        await fetchPostPages({
          site,
          tags: `fav:${target.name}`,
          want: mode === "recent" ? RECENT_FAVORITES : "all",
          shouldStop: () => stopProfilingRef.current,
          alive,
          onPage: (p) => bump(p, "fav"),
        });
        if (!alive()) return;
        const partial = stopProfilingRef.current;

        if (acc.favCount === 0) {
          setState((s) => ({ ...s, phase: target.favoriteCount == null ? "private" : "empty" }));
          return;
        }

        if (isSelf && !partial) {
          for (const [tag, signal] of [
            [`votedup:${target.name}`, "up"],
            [`voteddown:${target.name}`, "down"],
          ] as const) {
            try {
              const resp = await e621Api.getPosts(site, tag, FAV_PAGE_LIMIT);
              if (!alive()) return;
              bump(resp.posts, signal);
            } catch {
              if (!alive()) return; // votes are a bonus signal - carry on without them
            }
          }
        }

        let tagInfos: Awaited<ReturnType<typeof e621Api.getTagsByNames>> = [];
        try {
          tagInfos = await e621Api.getTagsByNames(site, tagNamesForLookup(acc));
        } catch {
          /* fall back to the median idf for every tag */
        }
        if (!alive()) return;
        setState((s) => ({ ...s, pagesDone: s.pagesDone + 1 }));

        const profile = finalizeTaste(acc, tagInfos, {
          site,
          user,
          mode,
          usedVotes: isSelf && !partial,
          builtAt: Date.now(),
        });
        // A cancelled build is used for this session but not saved over a complete one.
        if (!partial) saveTasteProfile(profile);
        setState((s) => ({ ...s, partial }));
        await gather(profile, isSelf, myRun);
      } catch (e) {
        if (alive()) {
          setState((s) => ({ ...s, phase: "error", error: errorMessage(e, "Couldn't build suggestions.") }));
        }
      }
    },
    [site, gather],
  );

  /** Stop reading favourites and build from what's been fetched so far. */
  const stopProfiling = useCallback(() => {
    stopProfilingRef.current = true;
  }, []);

  const loadingMoreRef = useRef(false);
  /** Gather the next batch. `replace` (the "Suggest more" button) swaps it in for what's on
   *  screen; otherwise (infinite scroll) it's appended. Either way nothing already shown this
   *  run comes back. */
  const more = useCallback(async (opts: { replace?: boolean } = {}) => {
    if (loadingMoreRef.current || !ctxRef.current) return;
    loadingMoreRef.current = true;
    const myRun = runIdRef.current;
    const alive = () => runIdRef.current === myRun;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const { posts, exhausted } = await gatherBatch(alive);
      if (!alive()) return;
      setState((s) =>
        opts.replace && posts.length > 0
          ? { ...s, posts, batch: s.batch + 1, exhausted, loadingMore: false }
          : { ...s, posts: [...s.posts, ...posts], exhausted, loadingMore: false },
      );
    } catch (e) {
      if (alive()) {
        setState((s) => ({ ...s, loadingMore: false, error: errorMessage(e, "Couldn't load more.") }));
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [gatherBatch]);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    ctxRef.current = null;
    setState(INITIAL);
  }, []);

  return { state, start, stopProfiling, more, reset };
}
