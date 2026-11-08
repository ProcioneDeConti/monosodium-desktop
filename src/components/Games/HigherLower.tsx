import { useEffect, useRef, useState } from "react";
import { MascotCue } from "../Mascot/MascotLayer";
import { ArrowDown, ArrowUp, Flame, Heart, ThumbsUp, Trophy } from "lucide-react";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import { gameImageUrl } from "../../lib/games";
import { useGamesStore } from "../../state/gamesStore";
import { ConfettiBurst } from "../Tagdle/Confetti";
import {
  CenteredSpinner,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  prefersReducedMotion,
  RoundActions,
  useFavoritesUser,
  usePostDeck,
  Verdict,
} from "./common";
import { sfx } from "./sfx";

type Stat = "score" | "favs";
type Guess = "higher" | "lower";

const STAT_VALUE: Record<Stat, (p: Post) => number> = {
  score: (p) => p.score.total,
  favs: (p) => p.fav_count,
};

const STAT_LABEL: Record<Stat, string> = { score: "score", favs: "favorites" };

/** How long the reveal's slot reel spins before it lands on the real number. */
const ROLL_MS = 900;

/** Streak milestones: the fire badge's wording as the run heats up. */
function streakTitle(streak: number): string | null {
  if (streak >= 15) return "Legendary nose!";
  if (streak >= 10) return "Unstoppable!";
  if (streak >= 5) return "On fire!";
  if (streak >= 3) return "Heating up";
  return null;
}

/** Endless: is the right post's score (or fav count) higher or lower than the left one's? Ties
 *  count as right. The revealed post slides over to become the next round's left side. */
export function HigherLower({ site }: { site: Site }) {
  const [stat, setStat] = useState<Stat>("score");
  const favUser = useFavoritesUser(site);
  return (
    <div>
      <div className="mb-4 flex justify-center">
        <div className="game-sticker-sm flex rounded-full bg-neutral-900/90 p-0.5">
          {(["score", "favs"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                sfx.tap();
                setStat(s);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-black transition-colors ${
                stat === s ? "bg-[rgb(var(--game))] text-white" : "opacity-60 hover:opacity-100"
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
  /** The reel has stopped - the verdict shows only then, so the number lands first. */
  const [rolled, setRolled] = useState(false);
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

  // Up/Down arrows guess while the round is open.
  const live = useRef<(g: Guess) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        live.current(e.key === "ArrowUp" ? "higher" : "lower");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (deck.error) return <ErrorNote error={deck.error} />;
  if ((!left || !right) && deck.exhausted) return <FavoritesExhausted />;
  if (!left || !right) return <CenteredSpinner label="Shuffling posts…" />;

  const value = STAT_VALUE[stat];
  const correct: Guess = value(right) >= value(left) ? "higher" : "lower";
  const tie = value(right) === value(left);
  const ok = guess !== null && (tie || guess === correct);
  const showVerdict = guess !== null && rolled;

  function pick(g: Guess) {
    if (guess || !left || !right) return;
    sfx.tap();
    setGuess(g);
    setRolled(false);
    const won = value(right) === value(left) || g === (value(right) >= value(left) ? "higher" : "lower");
    if (won) {
      setStreak(streak + 1);
      recordBest(bestKey, streak + 1);
    }
  }
  live.current = pick;

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
    setRolled(false);
  }

  // Shown streak waits for the reel, so the fire doesn't flare before the number lands.
  const shownStreak = guess !== null && !rolled && ok ? streak - 1 : streak;
  const title = streakTitle(shownStreak);
  const newBest = !ok && streak > runBest;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 text-sm">
        <StreakFire streak={shownStreak} />
        <span className="game-sticker-sm flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-3 py-1 font-bold text-yellow-400">
          <Trophy size={14} /> Best {Math.max(best, streak)}
        </span>
      </div>
      {title && (
        <span
          key={title}
          className="game-sticker-sm game-anim -mt-2 animate-[game-stamp_0.45s_ease-out_both] rounded-lg bg-orange-500 px-2.5 py-0.5 text-xs font-black uppercase tracking-widest text-white [--stamp-tilt:-3deg]"
        >
          {title}
        </span>
      )}
      <p className="game-sticker-sm rounded-full bg-neutral-900/90 px-3 py-1 text-sm font-semibold">
        {guess === null
          ? `Does the right post have a higher or lower ${STAT_LABEL[stat]}?`
          : !rolled
            ? "Sniffing…"
            : ok
              ? tie
                ? "A tie - counts!"
                : "Good nose!"
              : `Game over - final streak ${streak}${newBest ? " - new best!" : ""}`}
      </p>
      <div className="relative flex w-full items-stretch justify-center gap-4">
        <StatCard post={left} stat={stat} shown />
        <span className="game-sticker-sm absolute left-1/2 top-[38%] z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full bg-[rgb(var(--game))] text-sm font-black italic text-white">
          VS
        </span>
        <StatCard
          key={right.id}
          post={right}
          stat={stat}
          shown={guess !== null}
          rollFrom={value(left)}
          onRolled={() => setRolled(true)}
          highlight={showVerdict ? ok : null}
        />
      </div>
      {guess === null ? (
        <div className="flex gap-3">
          <GuessButton dir="higher" onClick={() => pick("higher")} />
          <GuessButton dir="lower" onClick={() => pick("lower")} />
        </div>
      ) : showVerdict ? (
        <>
          {newBest && <ConfettiBurst variant="rainbow" />}
          {newBest && <MascotCue kind="gameWin" />}
          <Verdict ok={ok}>{ok ? `Streak ${streak}` : `Final streak ${streak}`}</Verdict>
          <RoundActions
            site={site}
            posts={[
              { post: left, label: "View left post" },
              { post: right, label: "View right post" },
            ]}
            onNext={next}
            nextLabel={ok ? "Next" : "Play again"}
          />
        </>
      ) : null}
    </div>
  );
}

/** The streak badge: the flame grows with the streak and flares (one-shot) on each rise. */
function StreakFire({ streak }: { streak: number }) {
  const hot = streak >= 5;
  return (
    <span
      className={`game-sticker-sm flex items-center gap-1.5 rounded-full px-3 py-1 font-black transition-colors ${
        hot ? "bg-orange-500 text-white" : "bg-neutral-900/90 text-orange-400"
      }`}
      title={`${streak} in a row`}
    >
      <Flame
        key={streak}
        size={15 + Math.min(streak, 10) * 1.1}
        className={`${hot ? "fill-yellow-300" : streak > 0 ? "fill-orange-400/60" : ""} ${
          streak > 0 ? "game-anim animate-[game-flame_0.5s_ease-in-out_2]" : ""
        }`}
      />
      <span className="tabular-nums">{streak}</span>
    </span>
  );
}

function GuessButton({ dir, onClick }: { dir: Guess; onClick: () => void }) {
  const up = dir === "higher";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`game-sticker game-press flex items-center gap-2 rounded-full px-6 py-2.5 text-base font-black uppercase tracking-wide text-white ${
        up ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"
      }`}
    >
      {up ? <ArrowUp size={18} strokeWidth={3} /> : <ArrowDown size={18} strokeWidth={3} />}
      {up ? "Higher" : "Lower"}
      <kbd className="rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-bold">{up ? "↑" : "↓"}</kbd>
    </button>
  );
}

function StatCard({
  post,
  stat,
  shown,
  rollFrom,
  onRolled,
  highlight,
}: {
  post: Post;
  stat: Stat;
  shown: boolean;
  /** Spin the reveal from around this number (the other card's) - the right card only. */
  rollFrom?: number;
  onRolled?: () => void;
  highlight?: boolean | null;
}) {
  const url = gameImageUrl(post)!;
  const ring = highlight === true ? "ring-4 ring-green-500" : highlight === false ? "ring-4 ring-red-500" : "";
  const target = STAT_VALUE[stat](post);
  return (
    <div
      className={`game-sticker flex w-full max-w-[17rem] flex-col overflow-hidden rounded-2xl bg-neutral-900/90 transition-shadow ${ring}`}
    >
      <GameImage url={url} className="m-2 aspect-[4/5] rounded-xl" />
      <div className="flex flex-col items-center pb-3">
        <span className="game-sticker-sm min-w-[6.5rem] overflow-hidden rounded-lg bg-black/60 px-3 py-0.5 text-center text-2xl font-black tabular-nums">
          {rollFrom === undefined ? (
            target.toLocaleString()
          ) : shown ? (
            <SlotReel from={rollFrom} to={target} onDone={onRolled} />
          ) : (
            "???"
          )}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest opacity-50">{STAT_LABEL[stat]}</span>
      </div>
    </div>
  );
}

/** A slot-machine reveal: random numbers around `from`/`to` flick past (ticking, slowing down),
 *  then it lands on `to` with a little bounce. Instant under reduced motion. */
function SlotReel({ from, to, onDone }: { from: number; to: number; onDone?: () => void }) {
  const [shown, setShown] = useState<number | null>(null);
  const [landed, setLanded] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (prefersReducedMotion()) {
      setLanded(true);
      done.current?.();
      return;
    }
    const span = Math.max(10, Math.abs(to - from) * 1.5, Math.abs(to) * 0.6);
    const lo = Math.min(from, to) - span / 3;
    const timers: number[] = [];
    // Ticks spaced further apart as the reel slows: ease-out over ROLL_MS.
    let t = 0;
    let step = 40;
    while (t + step < ROLL_MS) {
      t += step;
      const at = t;
      timers.push(
        window.setTimeout(() => {
          setShown(Math.round(lo + Math.random() * span));
          sfx.tick(0.8 + (at / ROLL_MS) * 0.4);
        }, at),
      );
      step *= 1.18;
    }
    timers.push(
      window.setTimeout(() => {
        setShown(null);
        setLanded(true);
        sfx.pop();
        done.current?.();
      }, ROLL_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [from, to]);

  if (landed) {
    return (
      <span className="game-anim inline-block animate-[game-pop-in_0.3s_ease-out] text-white">{to.toLocaleString()}</span>
    );
  }
  return <span className="inline-block opacity-80 blur-[0.5px]">{(shown ?? from).toLocaleString()}</span>;
}
