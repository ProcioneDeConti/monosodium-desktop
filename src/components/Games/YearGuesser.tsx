import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { FIRST_YEAR, gameImageUrl, QUIZ_ROUNDS, uploadYear, yearPoints, yearRangeTag } from "../../lib/games";
import type { Site } from "../../models/site";
import { useGamesStore } from "../../state/gamesStore";
import {
  CenteredSpinner,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  NextButton,
  RoundActions,
  RunHeader,
  RunSummary,
  useDeckRound,
  useFavoritesUser,
  useListRound,
  usePostDeck,
  Verdict,
  type RoundResult,
} from "./common";

/** A post, a year slider: when was it uploaded? 100 points for the right year, 25 less per year
 *  off. Rounds pick a random year first and then a post from it, so every era turns up equally
 *  often - a plain random post is overwhelmingly recent. */
export function YearGuesser({ site }: { site: Site }) {
  const [run, setRun] = useState(0);
  const favUser = useFavoritesUser(site);
  return <YearRun key={`${run}:${favUser}`} site={site} favUser={favUser} onRestart={() => setRun(run + 1)} />;
}

function useYearSource(site: Site, years: string[], round: number, favUser: string | null): RoundResult {
  const deck = usePostDeck(site, `fav:${favUser}`, { enabled: !!favUser, accept: (p) => uploadYear(p) !== null });
  const fromFavorites = useDeckRound(deck, round, (p) => String(uploadYear(p)));
  const fromSearch = useListRound(site, years, round, QUIZ_ROUNDS, {
    key: "year",
    extraTags: "score:>=20",
    accept: (p) => uploadYear(p) !== null,
    enabled: !favUser,
  });
  return favUser ? fromFavorites : { data: fromSearch.data, isLoading: fromSearch.isLoading, error: fromSearch.error };
}

function YearRun({ site, favUser, onRestart }: { site: Site; favUser: string | null; onRestart: () => void }) {
  const bestKey = `yearGuess:${site}${favUser ? ":fav" : ""}`;
  const best = useGamesStore((s) => s.best[bestKey] ?? 0);
  const recordBest = useGamesStore((s) => s.recordBest);
  const [previousBest] = useState(best);
  const minYear = FIRST_YEAR[site] ?? 2007;
  const maxYear = new Date().getUTCFullYear();
  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = minYear; y <= maxYear; y++) out.push(yearRangeTag(y));
    return out;
  }, [minYear, maxYear]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [guess, setGuess] = useState(() => Math.round((minYear + maxYear) / 2));
  const [locked, setLocked] = useState(false);
  const query = useYearSource(site, years, round, favUser);

  if (query.error) return <ErrorNote error={query.error} />;
  if (round >= QUIZ_ROUNDS) {
    return <RunSummary score={score} max={QUIZ_ROUNDS * 100} previousBest={previousBest} onRestart={onRestart} />;
  }
  if (query.isLoading) return <CenteredSpinner label="Digging through the archives…" />;
  const post = query.data?.post;
  const actual = post ? uploadYear(post) : null;
  if (!post || actual === null) {
    return favUser ? <FavoritesExhausted /> : <p className="text-center text-sm">Couldn't find a post for this round.</p>;
  }
  const points = yearPoints(guess, actual);

  function lockIn() {
    setLocked(true);
    setScore(score + points);
  }

  function next() {
    const nextRound = round + 1;
    if (nextRound >= QUIZ_ROUNDS) recordBest(bestKey, score);
    setRound(nextRound);
    setLocked(false);
  }

  return (
    <div>
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} />
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold opacity-70">What year was this uploaded?</p>
        <GameImage url={gameImageUrl(post)!} className="h-[40vh] w-full max-w-xl" />
        <div className="w-full max-w-xl rounded-xl bg-neutral-900/80 px-4 py-3 backdrop-blur-sm">
          <div className="mb-1 flex items-baseline justify-center gap-3">
            <span className="text-3xl font-black tabular-nums">{guess}</span>
            {locked && (
              <span className="text-sm opacity-70">
                actual <span className="font-bold text-[rgb(var(--accent))]">{actual}</span>
              </span>
            )}
          </div>
          <input
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={guess}
            disabled={locked}
            onChange={(e) => setGuess(Number(e.target.value))}
            className="w-full accent-[rgb(var(--accent))]"
          />
          <div className="flex justify-between text-xs tabular-nums opacity-50">
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>
        </div>
        {!locked ? (
          <NextButton onClick={lockIn}>
            <CalendarClock size={16} /> Lock in {guess}
          </NextButton>
        ) : (
          <>
            <Verdict ok={points === 100}>
              {points === 100 ? "+100 pts" : `${Math.abs(guess - actual)} off, +${points} pts`}
            </Verdict>
            <RoundActions
              site={site}
              posts={[{ post }]}
              onNext={next}
              nextLabel={round + 1 >= QUIZ_ROUNDS ? "See results" : "Next"}
            />
          </>
        )}
      </div>
    </div>
  );
}
