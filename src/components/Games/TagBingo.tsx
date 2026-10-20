import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, SkipForward, Trophy } from "lucide-react";
import {
  BINGO_MISS_PENALTY,
  BINGO_SIZE,
  bingoCandidates,
  bingoCard,
  bingoDeckTags,
  bingoFits,
  bingoWin,
  dailyBingoCard,
  gameImageUrl,
} from "../../lib/games";
import { displayTagName, filterPool, utcDayKey } from "../../lib/tagdle";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import { useGamesStore } from "../../state/gamesStore";
import { useEffectiveBlacklist } from "../../state/settingsStore";
import { loadPool } from "../../state/tagdleStore";
import { ConfettiBurst } from "../Tagdle/Confetti";
import { Button } from "../ui/Button";
import {
  CenteredSpinner,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  useFavoritesUser,
  usePostDeck,
  ViewPostButton,
} from "./common";

type Mode = "daily" | "random";

/** A 3x3 card of tags and a stream of posts: claim a post for a square it fits, skip the rest.
 *  First line wins (or, in blackout mode, the whole card); fewer posts is better. A wrong claim costs an extra post. Every post dealt
 *  carries at least one open square's tag, and after each one the squares it fit are shown, so
 *  it's a test of spotting tags rather than of luck. */
export function TagBingo({ site }: { site: Site }) {
  const [mode, setMode] = useState<Mode>("daily");
  const [blackout, setBlackout] = useState(false);
  const [run, setRun] = useState(0);
  const favUser = useFavoritesUser(site);
  const blacklistEntries = useEffectiveBlacklist();
  const pool = useQuery({
    queryKey: ["game-pool", site, "general+species"],
    queryFn: () => loadPool(site, ["general", "species"]),
    staleTime: Infinity,
  });
  const candidates = useMemo(
    () => (pool.data ? bingoCandidates(filterPool(pool.data, blacklistEntries)) : null),
    [pool.data, blacklistEntries],
  );
  const dayKey = useMemo(() => utcDayKey(), []);
  const card = useMemo(
    () =>
      candidates
        ? mode === "daily"
          ? dailyBingoCard(candidates, site, dayKey)
          : bingoCard(candidates, Math.random)
        : null,
    // `run` deals a fresh random card on "Play again".
    [candidates, mode, site, dayKey, run],
  );

  return (
    <div>
      <div className="mb-4 flex justify-center">
        <div className="flex rounded-full bg-neutral-900/75 p-0.5">
          {(["daily", "random"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                mode === m ? "bg-[rgb(var(--accent))] text-white shadow" : "opacity-60 hover:opacity-100"
              }`}
            >
              {m === "daily" ? "Daily card" : "Random card"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setBlackout(!blackout)}
          title="Blackout: fill the whole card, not just one line"
          className={`ml-2 rounded-full border px-3.5 py-1 text-xs font-semibold transition-colors ${
            blackout
              ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/20"
              : "border-white/15 opacity-60 hover:opacity-100"
          }`}
        >
          Blackout
        </button>
      </div>
      {pool.error ? (
        <ErrorNote error={pool.error} />
      ) : !card ? (
        <CenteredSpinner label="Printing your card…" />
      ) : (
        <BingoRun
          key={`${mode}:${blackout}:${run}:${favUser}`}
          site={site}
          card={card}
          blackout={blackout}
          bestKey={`bingo:${blackout ? "blackout" : "line"}:${mode === "daily" ? `daily:${dayKey}` : "random"}:${site}${favUser ? ":fav" : ""}`}
          favUser={favUser}
          onRestart={() => setRun(run + 1)}
        />
      )}
    </div>
  );
}

function BingoRun({
  site,
  card,
  bestKey,
  blackout,
  favUser,
  onRestart,
}: {
  site: Site;
  card: string[];
  blackout: boolean;
  bestKey: string;
  favUser: string | null;
  onRestart: () => void;
}) {
  const best = useGamesStore((s) => s.best[bestKey]);
  const recordLowest = useGamesStore((s) => s.recordLowest);
  const [previousBest] = useState(best);
  const [post, setPost] = useState<Post | null>(null);
  const [claims, setClaims] = useState<(Post | null)[]>(() => card.map(() => null));
  const [missed, setMissed] = useState<number | null>(null);
  /** The squares the previous post fit - shown after a skip or a wrong claim. */
  const [lastFits, setLastFits] = useState<number[] | null>(null);
  const [count, setCount] = useState(0);

  const marked = claims.map((c) => c !== null);
  const line = bingoWin(marked, blackout);
  const open = card.flatMap((_, i) => (marked[i] ? [] : [i]));
  // Re-searched as squares fill, so dealt posts keep fitting something still open.
  const deck = usePostDeck(site, `${bingoDeckTags(card, open)} ${favUser ? `fav:${favUser}` : "score:>=20"}`);

  useEffect(() => {
    if (post || line) return;
    const next = deck.draw();
    if (next) setPost(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, line, deck.draw, deck.version]);

  useEffect(() => {
    if (line) recordLowest(bestKey, count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line !== null]);

  if (deck.error) return <ErrorNote error={deck.error} />;

  function claim(i: number) {
    if (!post || line || marked[i]) return;
    const fits = bingoFits(card, post).filter((j) => !marked[j]);
    if (fits.includes(i)) {
      setClaims(claims.map((c, j) => (j === i ? post : c)));
      setMissed(null);
      setLastFits(null);
      setCount(count + 1);
    } else {
      setMissed(i);
      setLastFits(fits);
      setCount(count + 1 + BINGO_MISS_PENALTY);
    }
    setPost(null);
  }

  function skip() {
    if (!post) return;
    setMissed(null);
    setLastFits(bingoFits(card, post).filter((j) => !marked[j]));
    setCount(count + 1);
    setPost(null);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center gap-3 rounded-xl bg-neutral-900/80 px-3 py-2.5 text-sm backdrop-blur-sm">
        <span className="font-bold tabular-nums">
          {count} <span className="font-normal opacity-50">posts</span>
        </span>
        <span className="text-xs opacity-60">Wrong claims cost +{BINGO_MISS_PENALTY}</span>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-semibold text-yellow-400">
          <Trophy size={12} /> Best {best ?? "-"}
        </span>
      </div>

      {/* Post on the left (controls above, image frame filling the rest so its bottom lines up with
          the card's), card on the right, both one fixed height, so the whole game fits on one
          screen without scrolling (stacked on narrow windows). */}
      <div className="flex w-full flex-col gap-3 sm:h-[min(58vh,480px)] sm:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2">
          {line ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <p className="relative text-4xl font-black">
                <ConfettiBurst variant="rainbow" />
                {blackout ? "BLACKOUT!" : "BINGO!"}
              </p>
              <p className="text-sm opacity-70">
                {count} posts.{" "}
                {previousBest === undefined || count < previousBest ? "New best!" : `Best: ${previousBest}`}
              </p>
              <Button onClick={onRestart} icon={<RotateCcw size={14} />}>
                Play again
              </Button>
            </div>
          ) : post ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={skip}
                  className="flex items-center gap-1.5 rounded-full border border-white/15 bg-neutral-900/80 px-4 py-1.5 text-sm
                         font-semibold transition-colors hover:border-[rgb(var(--accent))]"
                >
                  <SkipForward size={14} /> Skip
                </button>
                <span className="text-xs opacity-60">or click a square this post fits</span>
              </div>
              {/* Always rendered (blank when there's nothing to say) so the layout never jumps. */}
              <p
                className={`min-h-[1.5rem] rounded-full px-3 py-1 text-center text-xs ${lastFits ? "bg-neutral-900/80" : ""}`}
              >
                {lastFits &&
                  (lastFits.length === 0 ? (
                    <span className="opacity-70">The last post didn't fit any open square.</span>
                  ) : (
                    <>
                      <span className="opacity-70">The last post fit: </span>
                      <span className="font-semibold text-amber-300">
                        {lastFits.map((j) => displayTagName(card[j])).join(", ")}
                      </span>
                    </>
                  ))}
              </p>
              <GameImage url={gameImageUrl(post)!} className="h-[34vh] w-full sm:h-auto sm:min-h-0 sm:flex-1" />
            </>
          ) : deck.exhausted ? (
            <FavoritesExhausted />
          ) : (
            <CenteredSpinner label="Shuffling posts…" />
          )}
        </div>

        <div
          className="grid h-[300px] w-full shrink-0 gap-2 sm:h-full sm:w-[min(44%,340px)]"
          style={{
            gridTemplateColumns: `repeat(${BINGO_SIZE}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${BINGO_SIZE}, minmax(0, 1fr))`,
          }}
        >
          {card.map((tag, i) => {
            const claimed = claims[i];
            const won = line?.includes(i) ?? false;
            const thumb = claimed?.preview.url;
            return (
              <button
                key={i}
                type="button"
                disabled={!post || !!line || marked[i]}
                onClick={() => claim(i)}
                className={`relative flex min-h-0 items-center justify-center overflow-hidden rounded-xl border-2 p-2 text-center
                          text-xs font-bold transition-colors ${
                            won
                              ? "border-yellow-400 bg-yellow-500/25"
                              : marked[i]
                                ? "border-green-500 bg-green-500/15"
                                : missed === i
                                  ? "border-red-500 bg-red-500/15"
                                  : lastFits?.includes(i)
                                    ? "border-dashed border-amber-400 bg-neutral-900/80"
                                    : "border-white/10 bg-neutral-900/80 enabled:hover:border-[rgb(var(--accent))] enabled:hover:bg-[rgb(var(--accent))]/10"
                          }`}
              >
                {thumb && (
                  <img
                    src={thumb}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover opacity-40"
                  />
                )}
                <span className="relative">
                  {displayTagName(tag)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {line && (
        <div className="flex flex-wrap justify-center gap-2">
          {claims.flatMap((c, i) =>
            c ? [<ViewPostButton key={c.id} site={site} post={c} label={displayTagName(card[i])} />] : [],
          )}
        </div>
      )}
    </div>
  );
}
