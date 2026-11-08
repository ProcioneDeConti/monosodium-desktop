import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  FIRST_YEAR,
  gameImageUrl,
  QUIZ_ROUNDS,
  uploadYear,
  yearPoints,
  yearRangeTag,
  type RoundOutcome,
} from "../../lib/games";
import type { Site } from "../../models/site";
import { useGamesStore } from "../../state/gamesStore";
import {
  CenteredSpinner,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  NextButton,
  prefersReducedMotion,
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
import { sfx } from "./sfx";

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
  /** The clock has finished travelling to the real year - the verdict waits for it. */
  const [arrived, setArrived] = useState(false);
  const [results, setResults] = useState<RoundOutcome[]>([]);
  const query = useYearSource(site, years, round, favUser);

  if (query.error) return <ErrorNote error={query.error} />;
  if (round >= QUIZ_ROUNDS) {
    return <RunSummary score={score} max={QUIZ_ROUNDS * 100} previousBest={previousBest} results={results} onRestart={onRestart} />;
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
    setResults([...results, points / 100]);
    setScore(score + points);
  }

  function next() {
    const nextRound = round + 1;
    if (nextRound >= QUIZ_ROUNDS) recordBest(bestKey, score);
    setRound(nextRound);
    setLocked(false);
    setArrived(false);
  }

  return (
    <div>
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} results={results} />
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold opacity-70">What year was this uploaded?</p>
        <GameImage url={gameImageUrl(post)!} className="h-[40vh] w-full max-w-xl" photo settled={locked} />
        <div className="w-full max-w-xl rounded-xl bg-neutral-900/80 px-4 py-3 backdrop-blur-sm">
          <div className="mb-2 flex flex-col items-center gap-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] opacity-60">
              {!locked ? "Set the dial" : !arrived ? "Travelling…" : guess === actual ? "Arrived - right on time" : `You guessed ${guess}`}
            </span>
            {locked ? (
              <TimeTravel key={round} from={guess} to={actual} onArrive={() => setArrived(true)} />
            ) : (
              <FlipYear year={guess} />
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
            className="w-full accent-[rgb(var(--game))]"
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
        ) : !arrived ? null : (
          <>
            <Verdict ok={points === 100} close={points > 0}>
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

/** The year as four split-flap digits; a digit flips whenever its value changes. */
function FlipYear({ year, tone = "bg-neutral-800" }: { year: number; tone?: string }) {
  return (
    <span className="flex gap-1">
      {String(year)
        .split("")
        .map((d, i) => (
          <span
            key={`${i}:${d}`}
            className={`game-sticker-sm game-anim relative flex h-14 w-11 animate-[game-flip_0.28s_ease-out] items-center justify-center overflow-hidden rounded-lg font-mono text-4xl font-black tabular-nums text-white ${tone}`}
          >
            {d}
            {/* The flap's hinge line. */}
            <span className="absolute inset-x-0 top-1/2 h-px bg-black/50" />
          </span>
        ))}
    </span>
  );
}

/** After lock-in the clock rolls year by year from the guess to the real year (ticking, a bit
 *  slower near the end, ~1.5s in all), then lands in the game's colour. Instant under reduced motion. */
function TimeTravel({ from, to, onArrive }: { from: number; to: number; onArrive: () => void }) {
  const [year, setYear] = useState(from);
  const [landed, setLanded] = useState(false);
  const arrive = useRef(onArrive);
  arrive.current = onArrive;

  useEffect(() => {
    const land = () => {
      setYear(to);
      setLanded(true);
      sfx.whoosh();
      arrive.current();
    };
    if (from === to || prefersReducedMotion()) {
      land();
      return;
    }
    const dir = Math.sign(to - from);
    const steps = Math.abs(to - from);
    const timers: number[] = [];
    let t = 120;
    for (let i = 1; i < steps; i++) {
      const y = from + dir * i;
      // ~1.5s however far off the guess was; each step a little longer than the last.
      t += (1400 / steps) * (0.6 + (i / steps) * 0.8);
      timers.push(
        window.setTimeout(() => {
          setYear(y);
          sfx.tick(0.9 + (i / steps) * 0.3);
        }, t),
      );
    }
    timers.push(window.setTimeout(land, t + 220));
    return () => timers.forEach(clearTimeout);
  }, [from, to]);

  return <FlipYear year={year} tone={landed ? "bg-[rgb(var(--game))]" : "bg-neutral-800"} />;
}
