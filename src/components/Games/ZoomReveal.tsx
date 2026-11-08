import { useMemo, useState } from "react";
import { ScanSearch, ZoomOut } from "lucide-react";
import type { Site } from "../../models/site";
import { gameImageUrl, QUIZ_ROUNDS, ZOOM_LEVELS, zoomPoints, type RoundOutcome } from "../../lib/games";
import { sfx } from "./sfx";
import { useGamesStore } from "../../state/gamesStore";
import {
  CenteredSpinner,
  ChoiceGrid,
  ErrorNote,
  FavoritesExhausted,
  RoundActions,
  RoundUnavailable,
  RunHeader,
  RunSummary,
  Stamp,
  useFavoritesUser,
  useGameSpecies,
  Verdict,
} from "./common";
import { useSpeciesChoices, useSpeciesSource } from "./GuessGames";

const MAX_POINTS = zoomPoints(0);

/** Ten posts that start zoomed way in on a random spot. Each wrong guess (or a voluntary "Zoom
 *  out") pulls the camera back a step and costs a point. */
export function ZoomReveal({ site }: { site: Site }) {
  const [run, setRun] = useState(0);
  const favUser = useFavoritesUser(site);
  const list = useGameSpecies(site);
  if (!list) return <CenteredSpinner label="Building the species list… (first time takes ~15s)" />;
  return <ZoomRun key={`${favUser}:${run}`} site={site} list={list} favUser={favUser} onRestart={() => setRun(run + 1)} />;
}

function ZoomRun({
  site,
  list,
  favUser,
  onRestart,
}: {
  site: Site;
  list: string[];
  favUser: string | null;
  onRestart: () => void;
}) {
  const bestKey = favUser ? `zoom:fav:${site}` : `zoom:${site}`;
  const best = useGamesStore((s) => s.best[bestKey] ?? 0);
  const recordBest = useGamesStore((s) => s.recordBest);
  const [previousBest] = useState(best);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const [ruledOut, setRuledOut] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<RoundOutcome[]>([]);
  const query = useSpeciesSource(site, list, round, favUser);
  const post = query.data?.post;
  const answer = query.data?.answer ?? "";
  const choices = useSpeciesChoices(post, answer, list);
  // Somewhere off-centre but not in the extreme corners, where there's usually just background.
  const origin = useMemo(
    () => ({ x: 25 + Math.random() * 50, y: 20 + Math.random() * 45 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round],
  );

  if (round >= QUIZ_ROUNDS) {
    return <RunSummary score={score} max={QUIZ_ROUNDS * MAX_POINTS} previousBest={previousBest} results={results} onRestart={onRestart} />;
  }

  const lastLevel = level >= ZOOM_LEVELS.length - 1;

  function pick(choice: string) {
    if (picked) return;
    if (choice === answer) {
      setPicked(choice);
      setResults([...results, 1]);
      setScore(score + zoomPoints(level));
    } else if (lastLevel) {
      setPicked(choice);
      setResults([...results, 0]);
    } else {
      sfx.miss();
      sfx.whoosh();
      setRuledOut(new Set([...ruledOut, choice]));
      setLevel(level + 1);
    }
  }

  function next() {
    const nextRound = round + 1;
    if (nextRound >= QUIZ_ROUNDS) recordBest(bestKey, score);
    setRound(nextRound);
    setLevel(0);
    setRuledOut(new Set());
    setPicked(null);
  }

  /** No post for this round: it counts as a miss, so every round keeps its result tile. */
  function skip() {
    setResults([...results, 0]);
    next();
  }

  const zoom = picked ? 1 : ZOOM_LEVELS[level];

  return (
    <div>
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} results={results} />
      {query.error ? (
        <ErrorNote error={query.error} />
      ) : query.isLoading ? (
        <CenteredSpinner label="Finding a post…" />
      ) : !post ? (
        favUser ? (
          <FavoritesExhausted />
        ) : (
          <RoundUnavailable
            message="Couldn't find a usable post after several species - try allowing more ratings."
            onSkip={skip}
          />
        )
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold opacity-80">
            What species is this?
            {!picked && (
              <span
                key={level}
                className="game-sticker-sm game-anim flex animate-[game-pop-in_0.3s_ease-out] items-center gap-1 rounded-full bg-[rgb(var(--game))] px-2 py-0.5 text-xs font-black tabular-nums text-white"
              >
                <ScanSearch size={12} /> {zoomPoints(level)} pt{zoomPoints(level) === 1 ? "" : "s"}
              </span>
            )}
          </p>
          {/* No blurred backdrop here - it would show the whole picture's colours away. */}
          <div className="game-photo relative h-[46vh] w-full max-w-xl overflow-hidden rounded-lg bg-black/30">
            <img
              src={gameImageUrl(post)!}
              alt=""
              draggable={false}
              className={`h-full w-full transition-transform duration-500 ease-out ${picked ? "object-contain" : "object-cover"}`}
              style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
            />
            {!picked && <Viewfinder level={level} />}
            {picked && (
              <Stamp color={picked === answer ? "rgb(74 222 128)" : "rgb(248 113 113)"} tilt={-6} delay={0.25} size="text-3xl" silent>
                <span className="font-mono">{picked === answer ? "Match found" : "No match"}</span>
              </Stamp>
            )}
          </div>
          <ChoiceGrid choices={choices} answer={answer} picked={picked} disabled={ruledOut} onPick={pick} />
          {picked ? (
            <>
              <Verdict ok={picked === answer}>{picked === answer && `+${zoomPoints(level)}`}</Verdict>
              <RoundActions
                site={site}
                posts={[{ post }]}
                onNext={next}
                nextLabel={round + 1 >= QUIZ_ROUNDS ? "See results" : "Next"}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                sfx.whoosh();
                setLevel(level + 1);
              }}
              disabled={lastLevel}
              className="game-sticker-sm game-press flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-4 py-1.5 text-sm font-black text-white disabled:opacity-40"
            >
              <ZoomOut size={14} strokeWidth={2.5} /> Zoom out (-1 pt)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** CSI-style camera chrome over the zoomed photo: corner brackets, a crosshair, a readout of the
 *  zoom, static scanlines, and one scan sweep each time the camera pulls back. */
function Viewfinder({ level }: { level: number }) {
  const corner = "absolute h-7 w-7 border-green-400/90";
  return (
    <span className="pointer-events-none absolute inset-0 text-green-400">
      <span className="game-scanlines absolute inset-0" />
      <span key={level} className="game-scanbar game-anim absolute inset-x-0 top-0 h-1/4 animate-[game-scan_0.8s_ease-in_both] opacity-0" />
      <span className={`${corner} left-3 top-3 border-l-[3px] border-t-[3px]`} />
      <span className={`${corner} right-3 top-3 border-r-[3px] border-t-[3px]`} />
      <span className={`${corner} bottom-3 left-3 border-b-[3px] border-l-[3px]`} />
      <span className={`${corner} bottom-3 right-3 border-b-[3px] border-r-[3px]`} />
      <span className="absolute left-1/2 top-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-green-400/70" />
      <span className="absolute left-1/2 top-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 bg-green-400/70" />
      <span className="absolute left-5 top-5 rounded bg-black/60 px-1.5 font-mono text-xs font-bold">
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />
        ZOOM {ZOOM_LEVELS[level].toFixed(1)}×
      </span>
      <span className="absolute bottom-5 right-5 rounded bg-black/60 px-1.5 font-mono text-[10px] font-bold">
        {level === 0 ? "ENHANCING…" : `PULLBACK ${level}/${ZOOM_LEVELS.length - 1}`}
      </span>
    </span>
  );
}
