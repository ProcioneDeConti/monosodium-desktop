import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Church, Eye, ShieldAlert, Siren, X } from "lucide-react";
import type { Post, Rating } from "../../models/post";
import { RATING_TAG } from "../../models/post";
import type { Site } from "../../models/site";
import { gameImageUrl, QUIZ_ROUNDS, type RoundOutcome } from "../../lib/games";
import { displayTagName } from "../../lib/tagdle";
import { useGamesStore } from "../../state/gamesStore";
import { useSettingsStore } from "../../state/settingsStore";
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
  usePostDeck,
  Verdict,
} from "./common";
import { sfx } from "./sfx";

const RATING_LABEL: Record<Rating, string> = { s: "Safe", q: "Questionable", e: "Explicit" };

/** Each rating's button and verdict: Sunday School (halo), probation, Horny Jail (sirens). */
const RATING_THEME: Record<Rating, { tagline: string; icon: ReactNode; bg: string; stamp: string; ink: string }> = {
  s: { tagline: "Sunday School", icon: <Church size={18} strokeWidth={2.5} />, bg: "bg-sky-600 hover:bg-sky-500", stamp: "Sunday School", ink: "rgb(125 211 252)" },
  q: { tagline: "On probation", icon: <Eye size={18} strokeWidth={2.5} />, bg: "bg-amber-500 hover:bg-amber-400", stamp: "Probation", ink: "rgb(252 211 77)" },
  e: { tagline: "Horny Jail", icon: <Siren size={18} strokeWidth={2.5} />, bg: "bg-red-600 hover:bg-red-500", stamp: "Bonk! Horny Jail", ink: "rgb(248 113 113)" },
};
const ALL_RATINGS: Rating[] = ["s", "q", "e"];

/** How many general tags are listed as clues. */
const CLUE_TAGS = 30;

/** Blurred post + its tags: was it rated safe, questionable or explicit? Only offers the ratings
 *  the user has enabled, so it needs adult mode and at least two of them. */
export function RatingJudge({ site }: { site: Site }) {
  const adultModeEnabled = useSettingsStore((s) => s.adultModeEnabled);
  const enabledRatings = useSettingsStore((s) => s.enabledRatings);
  const ratings = adultModeEnabled ? ALL_RATINGS.filter((r) => enabledRatings.includes(r)) : [];
  const [run, setRun] = useState(0);
  const favUser = useFavoritesUser(site);

  if (ratings.length < 2) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm">
        <ShieldAlert size={28} className="opacity-50" />
        <p className="font-semibold">Horny Jail or Sunday School needs adult mode and at least two ratings enabled.</p>
        <p className="opacity-60">With only safe posts there's nothing to judge. You can change this in Settings.</p>
      </div>
    );
  }
  return (
    <RatingRun
      key={`${run}:${ratings.join("")}:${favUser}`}
      site={site}
      ratings={ratings}
      favUser={favUser}
      onRestart={() => setRun(run + 1)}
    />
  );
}

function RatingRun({
  site,
  ratings,
  favUser,
  onRestart,
}: {
  site: Site;
  ratings: Rating[];
  favUser: string | null;
  onRestart: () => void;
}) {
  const bestKey = `rating:${site}:${ratings.join("")}${favUser ? ":fav" : ""}`;
  // Favorites skip the score floor - plenty of favorites sit below it.
  const base = favUser ? `fav:${favUser}` : "score:>=10";
  const best = useGamesStore((s) => s.best[bestKey] ?? 0);
  const recordBest = useGamesStore((s) => s.recordBest);
  const [previousBest] = useState(best);
  // One deck per rating so rounds are balanced - a plain random batch is mostly explicit.
  const decks = {
    s: usePostDeck(site, `${RATING_TAG.s} ${base}`, { useRatingSetting: false, enabled: ratings.includes("s") }),
    q: usePostDeck(site, `${RATING_TAG.q} ${base}`, { useRatingSetting: false, enabled: ratings.includes("q") }),
    e: usePostDeck(site, `${RATING_TAG.e} ${base}`, { useRatingSetting: false, enabled: ratings.includes("e") }),
  };
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [post, setPost] = useState<Post | null>(null);
  const [target, setTarget] = useState<Rating>(() => ratings[Math.floor(Math.random() * ratings.length)]);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<RoundOutcome[]>([]);
  const deck = decks[target];

  // Ratings that can still deal - in favorites mode one may run dry (e.g. no safe favorites).
  const live = ratings.filter((r) => !decks[r].exhausted);

  useEffect(() => {
    if (post || round >= QUIZ_ROUNDS) return;
    if (deck.exhausted) {
      if (live.length > 0) setTarget(live[Math.floor(Math.random() * live.length)]);
      return;
    }
    const next = deck.draw();
    if (next) setPost(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, round, deck.draw, deck.version, deck.exhausted]);

  const error = decks.s.error ?? decks.q.error ?? decks.e.error;
  if (error) return <ErrorNote error={error} />;
  if (round >= QUIZ_ROUNDS) {
    return <RunSummary score={score} max={QUIZ_ROUNDS} previousBest={previousBest} unit="correct" results={results} onRestart={onRestart} />;
  }
  if (!post && live.length === 0) return <FavoritesExhausted />;
  if (!post) return <CenteredSpinner label="Shuffling posts…" />;

  const answer = post.rating as Rating;

  function pick(choice: string) {
    if (picked) return;
    setPicked(choice);
    setResults([...results, choice === answer ? 1 : 0]);
    if (choice === answer) setScore(score + 1);
    // The verdict's own sound, under the shared right/wrong one.
    setTimeout(() => (answer === "e" ? sfx.siren() : answer === "s" ? sfx.halo() : sfx.pop()), 250);
  }

  function next() {
    const nextRound = round + 1;
    if (nextRound >= QUIZ_ROUNDS) recordBest(bestKey, score);
    setRound(nextRound);
    setTarget(ratings[Math.floor(Math.random() * ratings.length)]);
    setPost(null);
    setPicked(null);
  }

  return (
    <div>
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} unit="correct" results={results} />
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold opacity-70">How is this post rated?</p>
        <div className="relative w-full max-w-xl">
          {picked && answer === "s" && (
            <span className="pointer-events-none absolute inset-x-0 -top-4 z-20 flex justify-center">
              <span className="game-anim h-7 w-36 animate-[game-halo_0.7s_0.2s_ease-out_both] rounded-[50%] border-[5px] border-yellow-300 shadow-[0_0_18px_4px_rgb(253_224_71/0.7)]" />
            </span>
          )}
          <GameImage
            url={gameImageUrl(post)!}
            className="h-[36vh] w-full"
            photo
            settled={picked !== null}
            imgStyle={{ filter: picked ? "none" : "blur(28px)", transition: "filter 0.5s" }}
          >
            {picked && answer === "e" && (
              <span className="game-anim pointer-events-none absolute inset-0 animate-[game-siren_0.5s_0.2s_linear_3] mix-blend-screen" />
            )}
            {picked && (
              <Stamp color={RATING_THEME[answer].ink} tilt={answer === "e" ? -9 : 7} delay={0.3} size="text-3xl" silent>
                {RATING_THEME[answer].stamp}
              </Stamp>
            )}
          </GameImage>
        </div>
        <div className="flex max-w-xl flex-wrap justify-center gap-1 rounded-xl bg-neutral-900/80 p-2.5 backdrop-blur-sm">
          {post.tags.general.slice(0, CLUE_TAGS).map((t) => (
            <span key={t} className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
              {displayTagName(t)}
            </span>
          ))}
          {post.tags.general.length > CLUE_TAGS && (
            <span className="px-1 text-xs opacity-50">+{post.tags.general.length - CLUE_TAGS} more</span>
          )}
        </div>
        <RatingButtons ratings={ratings} answer={answer} picked={picked as Rating | null} onPick={pick} />
        {picked && (
          <>
            <Verdict ok={picked === answer} />
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

/** The three themed verdict buttons (number keys pick them). After a pick the right one pops and
 *  a wrong pick shakes. */
function RatingButtons({
  ratings,
  answer,
  picked,
  onPick,
}: {
  ratings: Rating[];
  answer: Rating;
  picked: Rating | null;
  onPick: (r: Rating) => void;
}) {
  const live = useRef({ ratings, onPick });
  live.current = { ratings, onPick };
  const open = picked === null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      const i = Number(e.key) - 1;
      const r = live.current.ratings[i];
      if (!Number.isInteger(i) || !r) return;
      e.preventDefault();
      sfx.tap();
      live.current.onPick(r);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex w-full max-w-xl gap-2.5">
      {ratings.map((r, i) => {
        const theme = RATING_THEME[r];
        const isAnswer = !open && r === answer;
        const isWrong = !open && r === picked && r !== answer;
        const state = open
          ? theme.bg
          : isAnswer
            ? `${theme.bg} game-anim animate-[game-pop-in_0.35s_ease-out] ring-4 ring-green-400`
            : isWrong
              ? `${theme.bg} game-anim animate-[game-shake_0.45s_ease-in-out] ring-4 ring-red-500`
              : `${theme.bg} opacity-35`;
        return (
          <button
            key={r}
            type="button"
            disabled={!open}
            onClick={() => {
              sfx.tap();
              onPick(r);
            }}
            className={`game-sticker game-press relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-3 py-2.5 text-white ${state}`}
          >
            <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-md bg-black/25 text-[10px] font-black">
              {isAnswer ? <Check size={12} strokeWidth={3.5} /> : isWrong ? <X size={12} strokeWidth={3.5} /> : i + 1}
            </span>
            {theme.icon}
            <span className="text-sm font-black uppercase tracking-wide">{RATING_LABEL[r]}</span>
            <span className="text-[10px] font-bold opacity-80">{theme.tagline}</span>
          </button>
        );
      })}
    </div>
  );
}
