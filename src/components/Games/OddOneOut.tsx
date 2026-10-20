import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { e621Api } from "../../api/client";
import { visiblePosts } from "../../lib/blacklist";
import {
  assembleOddRound,
  gameImageUrl,
  oddOneOutCandidates,
  oddOneOutFromPosts,
  QUIZ_ROUNDS,
  shuffle,
  type OddOneOutRound,
} from "../../lib/games";
import { displayTagName, filterPool } from "../../lib/tagdle";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import { useGamesStore } from "../../state/gamesStore";
import { useEffectiveBlacklist } from "../../state/settingsStore";
import { loadPool } from "../../state/tagdleStore";
import {
  CenteredSpinner,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  RoundActions,
  RunHeader,
  RunSummary,
  useFavoritesUser,
  useRatingFilter,
  Verdict,
} from "./common";

/** Tags tried per round before giving up - each miss is two more rate-limited searches. */
const ROUND_ATTEMPTS = 4;
/** Favorites fetched for a favorites-only run - rounds are then built locally, no more requests. */
const FAVORITES_SAMPLE = 320;

/** Four posts, three sharing a general tag: click the one that doesn't have it. */
export function OddOneOut({ site }: { site: Site }) {
  const [run, setRun] = useState(0);
  const favUser = useFavoritesUser(site);
  const blacklistEntries = useEffectiveBlacklist();
  const pool = useQuery({
    queryKey: ["game-pool", site, "general"],
    queryFn: () => loadPool(site, ["general"]),
    staleTime: Infinity,
  });
  const candidates = useMemo(
    () => (pool.data ? oddOneOutCandidates(filterPool(pool.data, blacklistEntries)) : null),
    [pool.data, blacklistEntries],
  );

  if (pool.error) return <ErrorNote error={pool.error} />;
  if (!candidates) return <CenteredSpinner label="Loading tags…" />;
  return (
    <OddRun
      key={`${run}:${favUser}`}
      site={site}
      candidates={candidates}
      favUser={favUser}
      onRestart={() => setRun(run + 1)}
    />
  );
}

function OddRun({
  site,
  candidates,
  favUser,
  onRestart,
}: {
  site: Site;
  candidates: string[];
  favUser: string | null;
  onRestart: () => void;
}) {
  const bestKey = `oddOneOut:${site}${favUser ? ":fav" : ""}`;
  const best = useGamesStore((s) => s.best[bestKey] ?? 0);
  const recordBest = useGamesStore((s) => s.recordBest);
  const [previousBest] = useState(best);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const searched = useSearchedRound(site, candidates, round, !favUser);
  const fromFavs = useFavoritesRound(site, favUser, candidates, round);
  const current = favUser ? fromFavs : searched;

  if (current.error) return <ErrorNote error={current.error} />;
  if (round >= QUIZ_ROUNDS) {
    return <RunSummary score={score} max={QUIZ_ROUNDS} previousBest={previousBest} unit="correct" onRestart={onRestart} />;
  }
  if (current.isLoading) return <CenteredSpinner label="Picking a tag…" />;
  const data = current.data;
  if (!data) {
    return favUser ? (
      <FavoritesExhausted />
    ) : (
      <p className="text-center text-sm">Couldn't find posts for this round - check your rating filter and blacklist.</p>
    );
  }

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    if (i === data!.odd) setScore(score + 1);
  }

  function next() {
    const nextRound = round + 1;
    if (nextRound >= QUIZ_ROUNDS) recordBest(bestKey, score);
    setRound(nextRound);
    setPicked(null);
  }

  return (
    <div>
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} unit="correct" />
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold opacity-70">
          {picked === null ? (
            "Three of these share a tag. Which one doesn't?"
          ) : (
            <>
              The shared tag was <span className="text-[rgb(var(--accent))]">{displayTagName(data.tag)}</span>
            </>
          )}
        </p>
        <div className="grid w-full max-w-2xl grid-cols-2 gap-2">
          {data.posts.map((post, i) => {
            const ring =
              picked === null
                ? "border-transparent hover:border-[rgb(var(--accent))]"
                : i === data.odd
                  ? "border-green-500"
                  : i === picked
                    ? "border-red-500"
                    : "border-transparent opacity-60";
            return (
              <button
                key={post.id}
                type="button"
                disabled={picked !== null}
                onClick={() => pick(i)}
                className={`rounded-2xl border-[3px] transition-all ${ring}`}
              >
                <GameImage url={gameImageUrl(post)!} className="h-[26vh] w-full">
                  {picked !== null && (i === data.odd || i === picked) && (
                    <span
                      className={`absolute right-2 top-2 rounded-full p-1 text-white ${i === data.odd ? "bg-green-500" : "bg-red-500"}`}
                    >
                      {i === data.odd ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                    </span>
                  )}
                </GameImage>
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <>
            <Verdict ok={picked === data.odd} />
            <RoundActions
              site={site}
              posts={data.posts.map((post, i) => ({ post, label: i === data.odd ? "Odd one" : `#${i + 1}` }))}
              onNext={next}
              nextLabel={round + 1 >= QUIZ_ROUNDS ? "See results" : "Next"}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** A round from two searches - three posts with a random candidate tag, one without it - with the
 *  next round prefetched while this one is played. */
function useSearchedRound(site: Site, candidates: string[], round: number, enabled: boolean) {
  const blacklistEntries = useEffectiveBlacklist();
  const ratingFilter = useRatingFilter();
  const [runId] = useState(() => Math.random());
  const used = useRef(new Set<string>());

  const usable = (posts: Post[]) => visiblePosts(posts, blacklistEntries, false).filter((p) => gameImageUrl(p));

  const options = (r: number) => ({
    queryKey: ["game-odd-round", site, runId, r, ratingFilter],
    staleTime: Infinity,
    queryFn: async (): Promise<OddOneOutRound | null> => {
      for (let attempt = 0; attempt < ROUND_ATTEMPTS; attempt++) {
        const fresh = candidates.filter((t) => !used.current.has(t));
        const tag = shuffle(fresh.length > 0 ? fresh : candidates)[0];
        used.current.add(tag);
        const base = `score:>=20 ${ratingFilter} order:random`.replace(/\s+/g, " ").trim();
        const shared = usable((await e621Api.getPosts(site, `${tag} ${base}`, 20)).posts).slice(0, 3);
        if (shared.length < 3) continue;
        const odd = usable((await e621Api.getPosts(site, `-${tag} ${base}`, 10)).posts)[0];
        if (odd) return assembleOddRound(tag, shared, odd);
      }
      return null;
    },
  });

  const current = useQuery({ ...options(round), enabled });
  useQuery({ ...options(round + 1), enabled: enabled && round + 1 < QUIZ_ROUNDS });
  return current;
}

/** Favorites-only rounds: one sample of the user's favorites, every round built from it locally. */
function useFavoritesRound(site: Site, favUser: string | null, candidates: string[], round: number) {
  const blacklistEntries = useEffectiveBlacklist();
  const ratingFilter = useRatingFilter();
  const sample = useQuery({
    queryKey: ["game-odd-favs", site, favUser, ratingFilter],
    enabled: !!favUser,
    staleTime: 0,
    queryFn: async () => {
      const query = `fav:${favUser} ${ratingFilter} order:random`.replace(/\s+/g, " ").trim();
      const res = await e621Api.getPosts(site, query, FAVORITES_SAMPLE);
      return visiblePosts(res.posts, blacklistEntries, false).filter((p) => gameImageUrl(p));
    },
  });
  const allowed = useMemo(() => new Set(candidates), [candidates]);
  const rounds = useRef<Record<number, OddOneOutRound | null>>({});
  const used = useRef(new Set<number>());
  if (sample.data && !(round in rounds.current)) {
    const built = oddOneOutFromPosts(sample.data, allowed, used.current);
    for (const p of built?.posts ?? []) used.current.add(p.id);
    rounds.current[round] = built;
  }
  return { data: rounds.current[round], isLoading: sample.isLoading, error: sample.error };
}
