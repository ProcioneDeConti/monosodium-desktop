import { useEffect, useMemo, useState } from "react";
import { BarChart3, Infinity as InfinityIcon, TriangleAlert, X } from "lucide-react";
import type { Site } from "../../models/site";
import { SITE_DISPLAY_NAME } from "../../models/site";
import {
  FAV_PAGE_LIMIT,
  resolveUser,
  useFavoritesAnalysis,
  type ResolvedUser,
} from "../../queries/useFavoritesAnalysis";
import { formatDuration } from "../../lib/formatBytes";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { FavoritesAnalysisView } from "./FavoritesAnalysisView";

interface FavoritesAnalysisRunnerProps {
  site: Site;
  /** Username or numeric id to analyse. */
  userRef: string;
  /** Skips the lookup when the caller already has the profile (the signed-in user). */
  known?: ResolvedUser;
  onSearchTag: (tag: string) => void;
}

/** Rough wall-clock estimate: the shared limiter does 2 immediately then 1/sec, plus ~1s of
 *  request+parse latency each. Deliberately a little generous. */
function estimateSeconds(requests: number): number {
  return Math.max(requests, Math.round(Math.max(0, requests - 2) + requests * 1.3));
}

export function FavoritesAnalysisRunner({
  site,
  userRef,
  known,
  onSearchTag,
}: FavoritesAnalysisRunnerProps) {
  const { state, run, cancel, reset } = useFavoritesAnalysis(site);
  const [countText, setCountText] = useState("640");
  const [wantAll, setWantAll] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(true);

  // Resolve the user up front (id, name, favourite count) so the estimate is real.
  const [resolved, setResolved] = useState<ResolvedUser | null>(known ?? null);
  const [resolving, setResolving] = useState(!known);
  const [resolveError, setResolveError] = useState<string | null>(null);
  useEffect(() => {
    if (known) {
      setResolved(known);
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolveError(null);
    setResolved(null);
    resolveUser(site, userRef)
      .then((u) => !cancelled && setResolved(u))
      .catch((e) => !cancelled && setResolveError(errorMessage(e, "Could not find that user.")))
      .finally(() => !cancelled && setResolving(false));
    return () => {
      cancelled = true;
    };
  }, [site, userRef, known]);

  const parsedCount = Math.max(1, Math.floor(Number(countText) || 0));
  const want: number | "all" = wantAll ? "all" : parsedCount;
  const knownCount = resolved?.favoriteCount ?? null;

  const previewTarget = wantAll
    ? knownCount
    : knownCount != null
      ? Math.min(parsedCount, knownCount)
      : parsedCount;
  const previewReqs =
    previewTarget != null ? Math.max(1, Math.ceil(previewTarget / FAV_PAGE_LIMIT)) : null;
  const previewEta = previewReqs != null ? estimateSeconds(previewReqs) : null;
  const heavy = (previewReqs ?? 0) > 4;

  const remaining = useMemo(() => {
    if (state.requestsPlanned <= 0) return null;
    return estimateSeconds(Math.max(0, state.requestsPlanned - state.requestsDone));
  }, [state.requestsPlanned, state.requestsDone]);

  const siteName = SITE_DISPLAY_NAME[site];

  // --- looking up the user ---
  if (state.phase === "idle" && resolving) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs opacity-60">
        <Spinner size={14} />
        Looking up {userRef}…
      </div>
    );
  }
  if (state.phase === "idle" && resolveError) {
    return <p className="py-1 text-xs text-red-500">{resolveError}</p>;
  }

  // --- config ---
  if (state.phase === "idle" || state.phase === "error") {
    const name = resolved?.name ?? userRef;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs opacity-60">
          Fetch {name}'s favourites in pages of {FAV_PAGE_LIMIT} and break them down by rating,
          score, artist and more.
          {knownCount != null ? (
            <>
              {" "}
              This account has <span className="font-semibold opacity-100">{knownCount.toLocaleString()}</span>{" "}
              favourites.
            </>
          ) : (
            <> The favourite count isn't shown for this account (it may be set to private).</>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="opacity-70">Analyze</span>
            <input
              type="number"
              min={1}
              value={countText}
              disabled={wantAll}
              onChange={(e) => setCountText(e.target.value)}
              className="w-28 rounded-[var(--radius-sm)] border border-black/10 bg-white/60 px-2 py-1 text-sm
                         outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:opacity-40
                         dark:border-white/10 dark:bg-black/30"
            />
            <span className="opacity-70">favourites</span>
          </label>
          <Button
            icon={<InfinityIcon size={13} />}
            onClick={() => setWantAll((v) => !v)}
            className={wantAll ? "!bg-[rgb(var(--accent))]/20 !text-[rgb(var(--accent))]" : ""}
          >
            ALL
          </Button>
        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
            className="accent-[rgb(var(--accent))]"
          />
          <span className="opacity-75">
            Include deleted posts (they keep their tags — this is also what makes the count line up)
          </span>
        </label>

        <div
          className={`rounded-[var(--radius-sm)] border px-3 py-2 text-xs ${
            heavy
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-black/10 bg-black/[0.03] opacity-70 dark:border-white/10 dark:bg-white/[0.04]"
          }`}
        >
          {heavy && <TriangleAlert size={13} className="mr-1 inline align-[-2px]" />}
          {previewReqs != null ? (
            <>
              ≈ {previewReqs.toLocaleString()} request{previewReqs === 1 ? "" : "s"} · about{" "}
              <span className="font-semibold">{formatDuration(previewEta! * 1000)}</span>.
            </>
          ) : (
            <>Runs until it's done or you cancel.</>
          )}{" "}
          e621's rate limit is respected automatically; browsing or searching while it runs shares
          that limit and will make it take longer.
        </div>

        {state.phase === "error" && (
          <p className="text-xs text-red-500">{errorMessage(state.error)}</p>
        )}

        <div>
          <Button
            icon={<BarChart3 size={13} />}
            disabled={!resolved}
            onClick={() => resolved && void run(want, { user: resolved, includeDeleted })}
          >
            Start analysis
          </Button>
        </div>
      </div>
    );
  }

  // --- fetching ---
  if (state.phase === "fetching") {
    const pct =
      state.requestsPlanned > 0
        ? Math.min(100, (state.requestsDone / state.requestsPlanned) * 100)
        : null;
    return (
      <div className="flex flex-col gap-3 py-1">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">Analyzing {state.name}'s favourites…</span>
          <span className="tabular-nums text-xs opacity-55">{formatDuration(state.elapsedMs)}</span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className={`h-full rounded-full bg-[rgb(var(--accent))] ${
              pct != null ? "transition-[width] duration-300" : "animate-pulse"
            }`}
            style={{ width: pct != null ? `${pct}%` : "100%" }}
          />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
          <span className="tabular-nums">
            {state.fetched.toLocaleString()}
            {state.requestsPlanned > 0 && Number.isFinite(state.target)
              ? ` / ${state.target.toLocaleString()}`
              : ""}{" "}
            favourites
          </span>
          <span className="tabular-nums">
            {state.requestsDone.toLocaleString()}
            {state.requestsPlanned > 0 ? ` / ${state.requestsPlanned.toLocaleString()}` : ""} requests
          </span>
          {remaining != null && state.requestsDone > 0 && (
            <span className="tabular-nums">≈ {formatDuration(remaining * 1000)} left</span>
          )}
        </div>

        <div>
          <Button icon={<X size={13} />} onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // --- done ---
  if (state.phase === "done" && state.result) {
    if (state.result.sampled === 0) {
      return (
        <div className="flex flex-col items-start gap-2 py-1">
          <p className="text-xs opacity-60">
            No favourites found for {state.result.name} — the account may have none, or its
            favourites may be private.
          </p>
          <Button onClick={reset}>Try another</Button>
        </div>
      );
    }

    const wasFullRun = wantAll || (state.favoriteCount != null && parsedCount >= state.favoriteCount);
    const gap =
      !state.cancelled && wasFullRun && state.favoriteCount != null
        ? state.favoriteCount - state.result.sampled
        : 0;

    return (
      <div className="flex flex-col gap-3">
        {state.cancelled && (
          <p className="rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Stopped early — analyzed {state.result.sampled.toLocaleString()} favourites.
          </p>
        )}
        {gap > 0 && (
          <p className="text-[11px] opacity-55">
            Analyzed {state.result.sampled.toLocaleString()} of{" "}
            {state.favoriteCount!.toLocaleString()} favourites — the other {gap.toLocaleString()}{" "}
            {includeDeleted
              ? `point to posts that have been permanently removed from ${siteName}.`
              : `point to deleted posts (turn on "Include deleted posts" to count them).`}
          </p>
        )}
        {includeDeleted && state.result.analysis.deletedCount > 0 && (
          <p className="text-[11px] opacity-55">
            {state.result.analysis.deletedCount.toLocaleString()} of these are deleted posts,
            included by their tags.
          </p>
        )}
        <FavoritesAnalysisView
          data={state.result.analysis}
          sampled={state.result.sampled}
          name={state.result.name}
          avatarId={state.result.avatarId}
          site={site}
          onSearchTag={onSearchTag}
        />
        <div>
          <Button onClick={reset}>Analyze again</Button>
        </div>
      </div>
    );
  }

  return null;
}
