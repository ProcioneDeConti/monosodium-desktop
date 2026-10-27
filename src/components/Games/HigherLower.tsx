import { useEffect, useState } from "react";
import { MascotCue } from "../Mascot/MascotLayer";
import { ArrowDown, ArrowUp, Flame, Heart, ThumbsUp, Trophy } from "lucide-react";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import { gameImageUrl } from "../../lib/games";
import { useGamesStore } from "../../state/gamesStore";
import { ConfettiBurst } from "../Tagdle/Confetti";
import { Button } from "../ui/Button";
import {
  CenteredSpinner,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  RoundActions,
  useFavoritesUser,
  usePostDeck,
} from "./common";

type Stat = "score" | "favs";
type Guess = "higher" | "lower";

const STAT_VALUE: Record<Stat, (p: Post) => number> = {
  score: (p) => p.score.total,
  favs: (p) => p.fav_count,
};

const STAT_LABEL: Record<Stat, string> = { score: "score", favs: "favorites" };

/** Endless: is the right post's score (or fav count) higher or lower than the left one's? Ties
 *  count as right. The revealed post slides over to become the next round's left side. */
export function HigherLower({ site }: { site: Site }) {
  const [stat, setStat] = useState<Stat>("score");
  const favUser = useFavoritesUser(site);
  return (
    <div>
      <div className="mb-4 flex justify-center">
        <div className="flex rounded-full bg-neutral-900/75 p-0.5">
          {(["score", "favs"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStat(s)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                stat === s ? "bg-[rgb(var(--accent))] text-white shadow" : "opacity-60 hover:opacity-100"
              }`}
            >
              {s === "score" ? <ThumbsUp size={12} /> : <Heart size={12} />}
              {s === "score" ? "Score" : "Favorites"}
            </button>
          ))}
        </div>
      </div>
      <HigherLowerRun key={`${stat}:${favUser}`} site={site} stat={stat} favUser={favUser} />
    </div>
  );
}

function HigherLowerRun({ site, stat, favUser }: { site: Site; stat: Stat; favUser: string | null }) {
  const bestKey = favUser ? `higherLower:${stat}:fav:${site}` : `higherLower:${stat}:${site}`;
  const best = useGamesStore((s) => s.best[bestKey] ?? 0);
  const recordBest = useGamesStore((s) => s.recordBest);
  // A spread of popularity, not just the front page - score:>=5 skips the zero-score noise.
  const deck = usePostDeck(site, favUser ? `fav:${favUser}` : "score:>=5");
  const [left, setLeft] = useState<Post | null>(null);
  const [right, setRight] = useState<Post | null>(null);
  const [guess, setGuess] = useState<Guess | null>(null);
  const [streak, setStreak] = useState(0);
  // The record as of this run's start (`best` updates live as the streak climbs), so game over
  // can tell whether the run beat it.
  const [runBest, setRunBest] = useState(best);

  // Deal whenever a slot is empty and the deck has something (re-runs as batches arrive).
  useEffect(() => {
    if (!left) {
      const a = deck.draw();
      if (a) setLeft(a);
    } else if (!right) {
      const b = deck.draw();
      if (b) setRight(b);
    }
  }, [left, right, deck.draw, deck.version]);

  if (deck.error) return <ErrorNote error={deck.error} />;
  if ((!left || !right) && deck.exhausted) return <FavoritesExhausted />;
  if (!left || !right) return <CenteredSpinner label="Shuffling posts…" />;

  const value = STAT_VALUE[stat];
  const correct: Guess = value(right) >= value(left) ? "higher" : "lower";
  const tie = value(right) === value(left);
  const ok = guess !== null && (tie || guess === correct);

  function pick(g: Guess) {
    if (guess || !left || !right) return;
    setGuess(g);
    const won = value(right) === value(left) || g === (value(right) >= value(left) ? "higher" : "lower");
    if (won) {
      setStreak(streak + 1);
      recordBest(bestKey, streak + 1);
    }
  }

  function next() {
    if (ok) {
      setLeft(right);
    } else {
      setLeft(null);
      setStreak(0);
      setRunBest(Math.max(runBest, streak));
    }
    setRight(null);
    setGuess(null);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1 font-bold text-orange-500">
          <Flame size={15} /> {streak}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-3 py-1 font-semibold text-yellow-600 dark:text-yellow-400">
          <Trophy size={14} /> Best {Math.max(best, streak)}
        </span>
      </div>
      <p className="rounded-full bg-neutral-900/80 px-3 py-1 text-sm font-semibold">
        {guess === null ? `Does the right post have a higher or lower ${STAT_LABEL[stat]}?` : null}
        {guess !== null && (
          <span className={`relative ${ok ? "text-green-400" : "text-red-400"}`}>
            {/* Small burst per right guess. It's endless, so the rainbow is for a run that beat
                the record. */}
            {ok && <ConfettiBurst />}
            {!ok && streak > runBest && <ConfettiBurst variant="rainbow" />}
            <MascotCue kind={ok ? "gameRight" : streak > runBest ? "gameWin" : "gameLose"} />
            {ok
              ? tie
                ? "A tie - counts!"
                : "Correct!"
              : `Game over - final streak ${streak}${streak > runBest ? " - new best!" : ""}`}
          </span>
        )}
      </p>
      <div className="flex w-full items-stretch justify-center gap-4">
        <StatCard post={left} stat={stat} shown />
        <StatCard post={right} stat={stat} shown={guess !== null} highlight={guess === null ? null : ok} />
      </div>
      {guess === null ? (
        <div className="flex gap-3">
          <Button onClick={() => pick("higher")} icon={<ArrowUp size={14} />} className="px-5 py-2 text-sm">
            Higher
          </Button>
          <Button onClick={() => pick("lower")} icon={<ArrowDown size={14} />} className="px-5 py-2 text-sm">
            Lower
          </Button>
        </div>
      ) : (
        <RoundActions
          site={site}
          posts={[
            { post: left, label: "View left post" },
            { post: right, label: "View right post" },
          ]}
          onNext={next}
          nextLabel={ok ? "Next" : "Play again"}
        />
      )}
    </div>
  );
}

function StatCard({
  post,
  stat,
  shown,
  highlight,
}: {
  post: Post;
  stat: Stat;
  shown: boolean;
  highlight?: boolean | null;
}) {
  const url = gameImageUrl(post)!;
  const ring = highlight === true ? "border-green-500" : highlight === false ? "border-red-500" : "border-transparent";
  return (
    <div
      className={`flex w-full max-w-[17rem] flex-col overflow-hidden rounded-2xl border-2 bg-neutral-900/80 backdrop-blur-sm shadow-lg ${ring}`}
    >
      <GameImage url={url} className="m-2 aspect-[4/5] rounded-xl" />
      <div className="flex flex-col items-center pb-3">
        <span className="text-2xl font-black tabular-nums">
          {shown ? STAT_VALUE[stat](post).toLocaleString() : "???"}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest opacity-50">{STAT_LABEL[stat]}</span>
      </div>
    </div>
  );
}
