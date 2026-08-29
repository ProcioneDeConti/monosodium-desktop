// Progressive, cancellable fetch of a user's favourites for the Dashboard analysis. Pages are
// fetched one at a time through the normal rate-limited API path (src-tauri/src/api.rs's
// `request()` -> the shared per-site governor, burst 2 then 1/sec), so this can never exceed
// e621's limit and it naturally slows when the app is used for anything else. Each page is folded
// into a streaming accumulator and discarded, so memory stays bounded no matter how many
// favourites are analysed.

import { useCallback, useEffect, useRef, useState } from "react";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import {
  addToFavAccumulator,
  createFavAccumulator,
  finalizeFavAccumulator,
  type FavoritesAnalysis,
} from "../lib/favoritesAnalysis";
import { errorMessage } from "../lib/errors";

export const FAV_PAGE_LIMIT = 320;

export interface ResolvedUser {
  id: number;
  name: string;
  favoriteCount: number | null;
  avatarId: number | null;
}

export type AnalysisPhase = "idle" | "fetching" | "done" | "error";

export interface FavoritesAnalysisState {
  phase: AnalysisPhase;
  name: string;
  favoriteCount: number | null;
  /** Effective post-count target; Infinity for "all" when the count isn't known up front. */
  target: number;
  fetched: number;
  requestsDone: number;
  /** 0 when unknown (an "all" run with no favourite-count hint). */
  requestsPlanned: number;
  elapsedMs: number;
  cancelled: boolean;
  error: string | null;
  result: {
    analysis: FavoritesAnalysis;
    sampled: number;
    name: string;
    avatarId: number | null;
  } | null;
}

const INITIAL: FavoritesAnalysisState = {
  phase: "idle",
  name: "",
  favoriteCount: null,
  target: 0,
  fetched: 0,
  requestsDone: 0,
  requestsPlanned: 0,
  elapsedMs: 0,
  cancelled: false,
  error: null,
  result: null,
};

/** Resolve a username or numeric id to a full profile (id, name, favourite count, avatar).
 *  Exported so the runner can resolve *before* showing its config, for an accurate estimate. */
export async function resolveUser(site: Site, ref: string): Promise<ResolvedUser> {
  const r = ref.trim();
  const u = /^\d+$/.test(r)
    ? await e621Api.getUser(site, Number(r))
    : await e621Api.getUserByName(site, r);
  if (!u) throw new Error(`No user named "${r}". Try their numeric ID.`);
  return { id: u.id, name: u.name, favoriteCount: u.favorite_count, avatarId: u.avatar_id };
}

export function useFavoritesAnalysis(site: Site) {
  const [state, setState] = useState<FavoritesAnalysisState>(INITIAL);
  const cancelRef = useRef(false);
  const runIdRef = useRef(0);
  const startedAtRef = useRef(0);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = true;
    runIdRef.current += 1;
    setState(INITIAL);
  }, []);

  // Cancel any in-flight run if the component goes away (bump the run id too, so its pending
  // awaits resolve into a no-op instead of setState-ing an unmounted component).
  useEffect(
    () => () => {
      cancelRef.current = true;
      runIdRef.current += 1;
    },
    [],
  );

  // Live elapsed ticker while fetching (pages can be ~1s+ apart).
  useEffect(() => {
    if (state.phase !== "fetching") return;
    const iv = setInterval(() => {
      setState((s) => (s.phase === "fetching" ? { ...s, elapsedMs: Date.now() - startedAtRef.current } : s));
    }, 500);
    return () => clearInterval(iv);
  }, [state.phase]);

  const run = useCallback(
    async (want: number | "all", opts: { user: ResolvedUser; includeDeleted: boolean }) => {
      cancelRef.current = false;
      const myRun = (runIdRef.current += 1);
      startedAtRef.current = Date.now();
      const alive = () => runIdRef.current === myRun;
      const user = opts.user;

      const fc = user.favoriteCount;
      const target =
        want === "all" ? fc ?? Number.POSITIVE_INFINITY : Math.min(want, fc ?? want);
      const requestsPlanned = Number.isFinite(target)
        ? Math.max(1, Math.ceil(target / FAV_PAGE_LIMIT))
        : 0;

      setState({
        ...INITIAL,
        phase: "fetching",
        name: user.name,
        favoriteCount: fc,
        target,
        requestsPlanned,
      });

      const acc = createFavAccumulator();
      let cursor: string | undefined;

      // `status:any` disables e621's default "hide deleted posts" filter, so favourites whose
      // post was later deleted are still counted (they keep their tags/score). Off by request.
      const tags = `fav:${user.name}${opts.includeDeleted ? " status:any" : ""}`;

      try {
        while (!cancelRef.current) {
          const resp = await e621Api.getPosts(site, tags, FAV_PAGE_LIMIT, cursor);
          if (!alive()) return;
          const room = want === "all" ? resp.posts.length : Math.max(0, want - acc.total);
          addToFavAccumulator(acc, resp.posts.slice(0, room));
          setState((s) => ({
            ...s,
            fetched: acc.total,
            requestsDone: s.requestsDone + 1,
            elapsedMs: Date.now() - startedAtRef.current,
          }));
          if (resp.posts.length < FAV_PAGE_LIMIT) break;
          if (want !== "all" && acc.total >= want) break;
          cursor = `b${resp.posts[resp.posts.length - 1].id}`;
        }
      } catch (e) {
        if (alive()) {
          setState((s) => ({ ...s, phase: "error", error: errorMessage(e, "Favourites fetch failed.") }));
        }
        return;
      }
      if (!alive()) return;

      setState((s) => ({
        ...s,
        phase: "done",
        cancelled: cancelRef.current,
        fetched: acc.total,
        elapsedMs: Date.now() - startedAtRef.current,
        result: {
          analysis: finalizeFavAccumulator(acc),
          sampled: acc.total,
          name: user.name,
          avatarId: user.avatarId,
        },
      }));
    },
    [site],
  );

  return { state, run, cancel, reset };
}
