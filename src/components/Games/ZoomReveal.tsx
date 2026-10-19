import { useMemo, useState } from "react";
import { ZoomOut } from "lucide-react";
import type { Site } from "../../models/site";
import { gameImageUrl, QUIZ_ROUNDS, ZOOM_LEVELS, zoomPoints } from "../../lib/games";
import { useGamesStore } from "../../state/gamesStore";
import { Button } from "../ui/Button";
import {
  CenteredSpinner,
  ChoiceGrid,
  ErrorNote,
  FavoritesExhausted,
  RoundActions,
  RunHeader,
  RunSummary,
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
    return <RunSummary score={score} max={QUIZ_ROUNDS * MAX_POINTS} previousBest={previousBest} onRestart={onRestart} />;
  }

  const lastLevel = level >= ZOOM_LEVELS.length - 1;

  function pick(choice: string) {
    if (picked) return;
    if (choice === answer) {
      setPicked(choice);
      setScore(score + zoomPoints(level));
    } else if (lastLevel) {
      setPicked(choice);
    } else {
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

  const zoom = picked ? 1 : ZOOM_LEVELS[level];

  return (
    <div>
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} />
      {query.error ? (
        <ErrorNote error={query.error} />
      ) : query.isLoading ? (
        <CenteredSpinner label="Finding a post…" />
      ) : !post ? (
        favUser ? (
          <FavoritesExhausted />
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-sm">
            Couldn't find a usable post after several species - try allowing more ratings.
            <Button onClick={next}>Skip</Button>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-semibold opacity-70">
            What species is this?{" "}
            {!picked && (
              <span className="opacity-60">
                ({zoomPoints(level)} pt{zoomPoints(level) === 1 ? "" : "s"})
              </span>
            )}
          </p>
          {/* No blurred backdrop here - it would show the whole picture's colours away. */}
          <div className="relative h-[46vh] w-full max-w-xl overflow-hidden rounded-xl bg-black/30">
            <img
              src={gameImageUrl(post)!}
              alt=""
              draggable={false}
              className={`h-full w-full transition-transform duration-500 ease-out ${picked ? "object-contain" : "object-cover"}`}
              style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
            />
            {!picked && (
              <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                {ZOOM_LEVELS[level]}×
              </span>
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
            <Button onClick={() => setLevel(level + 1)} disabled={lastLevel} icon={<ZoomOut size={14} />}>
              Zoom out (-1 pt)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
