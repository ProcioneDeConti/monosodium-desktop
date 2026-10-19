import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { Post, Rating } from "../../models/post";
import { RATING_TAG } from "../../models/post";
import type { Site } from "../../models/site";
import { gameImageUrl, QUIZ_ROUNDS } from "../../lib/games";
import { displayTagName } from "../../lib/tagdle";
import { useGamesStore } from "../../state/gamesStore";
import { useSettingsStore } from "../../state/settingsStore";
import {
  CenteredSpinner,
  ChoiceGrid,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  RoundActions,
  RunHeader,
  RunSummary,
  useFavoritesUser,
  usePostDeck,
  Verdict,
} from "./common";

const RATING_LABEL: Record<Rating, string> = { s: "Safe", q: "Questionable", e: "Explicit" };
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
    return <RunSummary score={score} max={QUIZ_ROUNDS} previousBest={previousBest} unit="correct" onRestart={onRestart} />;
  }
  if (!post && live.length === 0) return <FavoritesExhausted />;
  if (!post) return <CenteredSpinner label="Shuffling posts…" />;

  const answer = post.rating as Rating;

  function pick(choice: string) {
    if (picked) return;
    setPicked(choice);
    if (choice === answer) setScore(score + 1);
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
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} unit="correct" />
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold opacity-70">How is this post rated?</p>
        <GameImage
          url={gameImageUrl(post)!}
          className="h-[36vh] w-full max-w-xl"
          imgStyle={{ filter: picked ? "none" : "blur(28px)", transition: "filter 0.5s" }}
        />
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
        <ChoiceGrid
          choices={ratings}
          answer={answer}
          picked={picked}
          onPick={pick}
          label={(r) => RATING_LABEL[r as Rating]}
        />
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
