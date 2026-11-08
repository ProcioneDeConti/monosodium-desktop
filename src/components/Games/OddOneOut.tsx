import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Lightbulb, X } from "lucide-react";
import { e621Api } from "../../api/client";
import { visiblePosts } from "../../lib/blacklist";
import {
  assembleOddRound,
  gameImageUrl,
  oddOneOutCandidates,
  oddOneOutFromPosts,
  oddRelatedTags,
  ODD_HINT_POINTS,
  ODD_POINTS,
  QUIZ_ROUNDS,
  shuffle,
  type OddOneOutRound,
  type RoundOutcome,
} from "../../lib/games";
import { displayTagName, filterPool } from "../../lib/tagdle";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import { useGamesStore } from "../../state/gamesStore";
import { useEffectiveBlacklist } from "../../state/settingsStore";
import { loadPool } from "../../state/tagdleStore";
import { sfx } from "./sfx";
import {
  CenteredSpinner,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  RoundActions,
  RunHeader,
  RunSummary,
  Stamp,
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
  const bestKey = `oddOneOut2:${site}${favUser ? ":fav" : ""}`;
  const best = useGamesStore((s) => s.best[bestKey] ?? 0);
  const recordBest = useGamesStore((s) => s.recordBest);
  const [previousBest] = useState(best);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [hinted, setHinted] = useState(false);
  const [results, setResults] = useState<RoundOutcome[]>([]);

  const searched = useSearchedRound(site, candidates, round, !favUser);
  const fromFavs = useFavoritesRound(site, favUser, candidates, round);
  const current = favUser ? fromFavs : searched;

  if (current.error) return <ErrorNote error={current.error} />;
  if (round >= QUIZ_ROUNDS) {
    return <RunSummary score={score} max={QUIZ_ROUNDS * ODD_POINTS} previousBest={previousBest} results={results} onRestart={onRestart} />;
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
    const right = i === data!.odd;
    setPicked(i);
    setResults([...results, right ? (hinted ? 0.5 : 1) : 0]);
    if (right) {
      setScore(score + (hinted ? ODD_HINT_POINTS : ODD_POINTS));
      sfx.whoosh();
    }
  }

  function hint() {
    sfx.pop();
    setHinted(true);
  }

  function next() {
    const nextRound = round + 1;
    if (nextRound >= QUIZ_ROUNDS) recordBest(bestKey, score);
    setRound(nextRound);
    setPicked(null);
    setHinted(false);
  }

  const right = picked === data.odd;

  return (
    <div>
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} results={results} />
      <div className="flex flex-col items-center gap-4">
        <div className="flex min-h-8 flex-wrap items-center justify-center gap-2 text-sm font-semibold">
          {picked === null && !hinted && (
            <>
              <span className="opacity-70">Three of these share a tag. Which one doesn't?</span>
              <button
                type="button"
                onClick={hint}
                title={`Shows the shared tag - a right answer is then worth ${ODD_HINT_POINTS} instead of ${ODD_POINTS}`}
                className="game-sticker-sm game-press flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-black text-black"
              >
                <Lightbulb size={13} strokeWidth={2.5} /> Hint (half points)
              </button>
            </>
          )}
          {(picked !== null || hinted) && (
            <>
              <span className="opacity-70">{picked === null ? "They share" : "The shared tag was"}</span>
              <span
                key={data.tag}
                className="game-sticker-sm game-anim animate-[game-pop-in_0.35s_ease-out] rounded-full bg-[rgb(var(--game))] px-3 py-0.5 font-black text-white"
              >
                {displayTagName(data.tag)}
              </span>
              {picked === null && <span className="opacity-70">- which one doesn't?</span>}
            </>
          )}
        </div>
        <div className="grid w-full max-w-2xl grid-cols-2 gap-3">
          {data.posts.map((post, i) => {
            const isOdd = i === data.odd;
            const ring =
              picked === null
                ? "hover:ring-4 hover:ring-[rgb(var(--game))]"
                : isOdd
                  ? `ring-4 ${right ? "ring-green-500" : "ring-red-500"}`
                  : i === picked
                    ? "ring-4 ring-amber-400"
                    : "opacity-60";
            return (
              <button
                key={post.id}
                type="button"
                disabled={picked !== null}
                onClick={() => pick(i)}
                className={`game-sticker-sm game-press relative rounded-2xl transition-[opacity,box-shadow] ${ring} ${
                  picked !== null && isOdd && right ? "game-anim animate-[game-eject_0.7s_ease-in-out]" : ""
                } ${picked === i && !right ? "game-anim animate-[game-shake_0.45s_ease-in-out]" : ""}`}
              >
                <GameImage url={gameImageUrl(post)!} className="h-[26vh] w-full">
                  {picked !== null && !isOdd && (
                    <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">
                      <Check size={11} strokeWidth={3} className="text-green-400" /> {displayTagName(data.tag)}
                    </span>
                  )}
                  {picked !== null && isOdd && (
                    <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">
                      <X size={11} strokeWidth={3} className="text-red-400" /> no {displayTagName(data.tag)}
                    </span>
                  )}
                </GameImage>
                {picked !== null && isOdd && (
                  <Stamp color={right ? "rgb(74 222 128)" : "rgb(248 113 113)"} tilt={-12} delay={right ? 0.35 : 0.3} silent>
                    {right ? "Ejected!" : "Sus!"}
                  </Stamp>
                )}
                {picked === i && !right && (
                  <Stamp color="rgb(251 191 36)" tilt={8} size="text-xl" silent>
                    Innocent
                  </Stamp>
                )}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <>
            <Verdict ok={right}>{right ? `+${hinted ? ODD_HINT_POINTS : ODD_POINTS}${hinted ? " · with hint" : ""}` : undefined}</Verdict>
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
        // The odd post lacks the tag and its relatives (white_fur -> white_body too), so it doesn't
        // show the shared trait under another name.
        const related = oddRelatedTags(tag, candidates);
        const without = related.map((t) => `-${t}`).join(" ");
        const odd = usable((await e621Api.getPosts(site, `${without} ${base}`, 10)).posts).find(
          (p) => !related.some((t) => p.tags.general.includes(t)),
        );
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
