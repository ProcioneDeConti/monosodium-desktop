import { useEffect, useMemo, useState } from "react";
import { BarChart3, Infinity as InfinityIcon, TriangleAlert, X } from "lucide-react";
import type { Site } from "../../models/site";
import { SITE_DISPLAY_NAME } from "../../models/site";
import {
  FAV_PAGE_LIMIT,
  resolveUser,
  useFavoritesAnalysis,
  type FavoritesAnalysisResult,
  type ResolvedUser,
} from "../../queries/useFavoritesAnalysis";
import {
  analysisGapRemaining,
  cacheAnalysis,
  getFreshAnalysis,
  markAnalysisStarted,
} from "../../state/favoritesAnalysisCache";
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

  // A recent completed analysis for this user (< 30 min) is shown from cache instead of
  // re-fetching; starting any analysis is gated to once per 30s - see
  // state/favoritesAnalysisCache.ts.
  const [seeded, setSeeded] = useState(() => getFreshAnalysis(site, userRef));
  const [now, setNow] = useState(() => Date.now());
  const gapRemaining = analysisGapRemaining(now);
  const gapSecs = Math.ceil(gapRemaining / 1000);

  // Persist a completed run to the 30-minute result cache, keyed by the resolved username.
  useEffect(() => {
    if (state.phase === "done" && state.result && state.result.sampled > 0) {
      cacheAnalysis(site, state.result.name, state.result);
    }
  }, [state.phase, state.result, site]);

  const liveResult =
    state.phase === "done" && state.result && state.result.sampled > 0 ? state.result : null;
  const shownResult: FavoritesAnalysisResult | null = liveResult ?? seeded?.result ?? null;

  // Tick once a second while not fetching, so the 30s start-gap countdown updates and clears.
  useEffect(() => {
    if (state.phase === "fetching") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  // Resolve the user up front (id, name, favourite count) so the estimate is real. Skipped when
  // a fresh cached result is being shown.
  const [resolved, setResolved] = useState<ResolvedUser | null>(known ?? null);
  const [resolving, setResolving] = useState(!known && !seeded);
  const [resolveError, setResolveError] = useState<string | null>(null);
  useEffect(() => {
    if (seeded) return;
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
      .then((u) => {
        if (cancelled) return;
        // If we typed an id/alt-casing that resolves to someone already cached, show that.
        const cached = getFreshAnalysis(site, u.name);
        if (cached) setSeeded(cached);
        else setResolved(u);
      })
      .catch((e) => !cancelled && setResolveError(errorMessage(e, "Could not find that user.")))
      .finally(() => !cancelled && setResolving(false));
    return () => {
      cancelled = true;
    };
  }, [site, userRef, known, seeded]);

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

  function analyzeAgain() {
    setSeeded(null);
    reset();
  }

  function startAnalysis() {
    if (!resolved || gapRemaining > 0) return;
    markAnalysisStarted();
    setNow(Date.now());
    void run(want, { user: resolved, includeDeleted });
  }

  // --- a shown result (fresh cache or a just-finished run) ---
  if (shownResult) {
    return (
      <div className="flex flex-col gap-3">
        {shownResult.cancelled && (
          <p className="rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Stopped early — analyzed {shownResult.sampled.toLocaleString()} favourites.
          </p>
        )}
        {shownResult.gap > 0 && shownResult.favoriteCount != null && (
          <p className="text-[11px] opacity-55">
            Analyzed {shownResult.sampled.toLocaleString()} of{" "}
            {shownResult.favoriteCount.toLocaleString()} favourites — the other{" "}
            {shownResult.gap.toLocaleString()}{" "}
            {shownResult.includeDeleted
              ? `point to posts that have been permanently removed from ${siteName}.`
              : `point to deleted posts (turn on "Include deleted posts" to count them).`}
          </p>
        )}
        {shownResult.includeDeleted && shownResult.analysis.deletedCount > 0 && (
          <p className="text-[11px] opacity-55">
            {shownResult.analysis.deletedCount.toLocaleString()} of these are deleted posts,
            included by their tags.
          </p>
        )}

        <FavoritesAnalysisView
          data={shownResult.analysis}
          sampled={shownResult.sampled}
          name={shownResult.name}
          avatarId={shownResult.avatarId}
          site={site}
          onSearchTag={onSearchTag}
        />

        <p className="text-[11px] opacity-45">This result is kept for 30 minutes.</p>
        <div className="flex items-center gap-2">
          <Button onClick={analyzeAgain} disabled={gapRemaining > 0}>
            Analyze again
          </Button>
          {gapRemaining > 0 && (
            <span className="text-xs opacity-55">wait ~{gapSecs}s (API courtesy)</span>
          )}
        </div>
      </div>
    );
  }

  // --- empty account ---
  if (state.phase === "done" && state.result && state.result.sampled === 0) {
    return (
      <div className="flex flex-col items-start gap-2 py-1">
        <p className="text-xs opacity-60">
          No favourites found for {state.result.name} — the account may have none, or its
          favourites may be private.
        </p>
        <Button onClick={analyzeAgain}>Try another</Button>
      </div>
    );
  }

  // --- looking up the user ---
  if (resolving) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs opacity-60">
        <Spinner size={14} />
        Looking up {userRef}…
      </div>
    );
  }
  if (resolveError) {
    return <p className="py-1 text-xs text-red-500">{resolveError}</p>;
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

  // --- config ---
  const name = resolved?.name ?? userRef;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs opacity-60">
        Fetch {name}'s favourites in pages of {FAV_PAGE_LIMIT} and break them down by rating, score,
        artist and more.
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
        that limit and will make it take longer. Results are kept for 30 minutes, and analyses can
        be started once every 30 seconds.
      </div>

      {state.phase === "error" && <p className="text-xs text-red-500">{errorMessage(state.error)}</p>}

      <div className="flex items-center gap-2">
        <Button
          icon={<BarChart3 size={13} />}
          disabled={!resolved || gapRemaining > 0}
          onClick={startAnalysis}
        >
          Start analysis
        </Button>
        {gapRemaining > 0 && (
          <span className="text-xs opacity-55">wait ~{gapSecs}s (API courtesy)</span>
        )}
      </div>
    </div>
  );
}
