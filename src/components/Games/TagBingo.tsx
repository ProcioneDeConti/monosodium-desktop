import { useEffect, useMemo, useState } from "react";
import { MascotCue } from "../Mascot/MascotLayer";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, SkipForward, Sparkles, Trophy } from "lucide-react";
import {
  BINGO_MISS_PENALTY,
  BINGO_SIZE,
  bingoCandidates,
  bingoCard,
  bingoDeckTags,
  bingoFits,
  bingoMissPenalty,
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
import {
  CenteredSpinner,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  GameToggle,
  NextButton,
  Stamp,
  useFavoritesUser,
  usePostDeck,
  ViewPostButton,
} from "./common";
import { sfx } from "./sfx";

type Mode = "daily" | "random";

/** A 3x3 card of tags and a stream of posts: claim a post (it fills every open square it fits),
 *  skip the rest.
 *  First line wins (or, in blackout mode, the whole card); fewer posts is better. Claiming a post
 *  that fits no open square costs an extra post (picking the wrong one of its squares doesn't). Every post dealt
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
      <div className="mb-4 flex justify-center gap-2">
        <GameToggle
          options={[
            { value: "daily", label: "Daily card" },
            { value: "random", label: "Random card" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <button
          type="button"
          onClick={() => {
            sfx.tap();
            setBlackout(!blackout);
          }}
          title="Blackout: fill the whole card, not just one line"
          className={`game-sticker-sm game-press rounded-full px-3.5 py-1 text-xs font-black transition-colors ${
            blackout ? "bg-[rgb(var(--game))] text-white" : "bg-neutral-900/90 text-white/60 hover:text-white"
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
          title={mode === "daily" ? `Daily · ${dayKey}` : "Random card"}
          // "bingo2": since a post fills every square it fits, older (pre-multi-fill) bests aren't comparable.
          bestKey={`bingo2:${blackout ? "blackout" : "line"}:${mode === "daily" ? `daily:${dayKey}` : "random"}:${site}${favUser ? ":fav" : ""}`}
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
  title,
  favUser,
  onRestart,
}: {
  site: Site;
  card: string[];
  blackout: boolean;
  title: string;
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
      // Clicking any square the post fits fills every open square it fits - no guessing which
      // one it "belongs" to.
      setClaims(claims.map((c, j) => (fits.includes(j) ? post : c)));
      sfx.daub();
      setMissed(null);
      setLastFits(null);
      setCount(count + 1);
    } else {
      setMissed(i);
      sfx.miss();
      setLastFits(fits);
      setCount(count + 1 + bingoMissPenalty(fits));
    }
    setPost(null);
  }

  function skip() {
    if (!post) return;
    sfx.whoosh();
    setMissed(null);
    setLastFits(bingoFits(card, post).filter((j) => !marked[j]));
    setCount(count + 1);
    setPost(null);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="game-sticker flex w-full items-center gap-3 rounded-2xl bg-neutral-900/90 px-3 py-2.5 text-sm">
        <span key={count} className="game-sticker-sm game-anim animate-[game-pop-in_0.3s_ease-out] rounded-lg bg-[rgb(var(--game))] px-2.5 py-0.5 font-black tabular-nums text-white">
          {count} <span className="text-xs font-bold opacity-70">posts</span>
        </span>
        <span className="text-xs opacity-60">
          Claiming a post that fits nothing costs +{BINGO_MISS_PENALTY}
        </span>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-bold text-yellow-400">
          <Trophy size={12} /> Best {best ?? "-"}
        </span>
      </div>

      {/* Post on the left (controls above, image frame filling the rest so its bottom lines up with
          the card's), card on the right, both one fixed height, so the whole game fits on one
          screen without scrolling (stacked on narrow windows). */}
      <div className="flex w-full flex-col gap-3 sm:h-[min(58vh,480px)] sm:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2">
          {line ? (
            <div className="game-sticker relative flex flex-col items-center gap-3 rounded-3xl bg-neutral-900/90 px-8 py-6 text-center">
              <ConfettiBurst variant="rainbow" />
              <MascotCue kind="gameWin" />
              <p className="text-xs font-black uppercase tracking-[0.25em] text-[rgb(var(--game))] brightness-150">
                {blackout ? "Whole card filled" : "Line complete"}
              </p>
              <p className="text-5xl font-black leading-none tabular-nums">
                {count}
                <span className="text-lg font-bold opacity-50"> posts</span>
              </p>
              {previousBest === undefined || count < previousBest ? (
                <span className="game-sticker-sm game-anim flex animate-[game-stamp_0.5s_0.5s_ease-out_both] items-center gap-1 rounded-full bg-yellow-400 px-3 py-1 text-xs font-black uppercase tracking-wider text-black [--stamp-tilt:-5deg]">
                  <Sparkles size={12} /> New best!
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-bold text-yellow-400">
                  <Trophy size={13} /> Best {previousBest}
                </span>
              )}
              <NextButton onClick={onRestart}>
                <RotateCcw size={16} strokeWidth={3} /> Play again
              </NextButton>
            </div>
          ) : post ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={skip}
                  className="game-sticker-sm game-press flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-4 py-1.5 text-sm
                         font-black text-white hover:bg-neutral-800"
                >
                  <SkipForward size={14} /> Skip
                </button>
                <span className="text-xs opacity-60">or click a square it fits - it fills all of them</span>
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
              <GameImage key={post.id} url={gameImageUrl(post)!} className="game-anim h-[34vh] w-full animate-[game-pop-in_0.3s_ease-out] sm:h-auto sm:min-h-0 sm:flex-1" />
            </>
          ) : deck.exhausted ? (
            <FavoritesExhausted />
          ) : (
            <CenteredSpinner label="Shuffling posts…" />
          )}
        </div>

        <BingoCard
          card={card}
          claims={claims}
          title={title}
          line={line}
          blackout={blackout}
          missed={missed}
          lastFits={lastFits}
          canClaim={!!post && !line}
          onClaim={claim}
        />
      </div>

      {line && (
        <div className="flex flex-wrap justify-center gap-2">
          {/* One button per post - a post that filled several squares lists them all. */}
          {[...new Set(claims.filter((c): c is Post => c !== null))].map((c) => (
            <ViewPostButton
              key={c.id}
              site={site}
              post={c}
              label={card
                .flatMap((tag, i) => (claims[i] === c ? [displayTagName(tag)] : []))
                .join(" + ")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A tiny deterministic wobble per square, so the dauber blots don't all land dead centre. */
function blotOffset(i: number): { x: number; y: number; r: number } {
  const h = (i * 2654435761) >>> 0;
  return { x: ((h % 13) - 6) / 2, y: (((h >>> 8) % 13) - 6) / 2, r: (h >>> 16) % 360 };
}

/** The printed card: a header band in the game's colour, cream paper squares, ink-blot daubs on
 *  claimed squares (the claiming post's thumbnail faintly under the ink), and a "BINGO!" stamp
 *  across the card when it's won. */
function BingoCard({
  card,
  claims,
  title,
  line,
  blackout,
  missed,
  lastFits,
  canClaim,
  onClaim,
}: {
  card: string[];
  claims: (Post | null)[];
  title: string;
  line: number[] | null;
  blackout: boolean;
  missed: number | null;
  lastFits: number[] | null;
  canClaim: boolean;
  onClaim: (i: number) => void;
}) {
  return (
    <div className="game-sticker relative flex h-[340px] w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-[#f6f1ea] sm:h-full sm:w-[min(44%,340px)]">
      <div className="game-tile-band flex items-center justify-between bg-[rgb(var(--game))] px-3 py-1.5 text-white">
        <span className="text-lg font-black italic tracking-wider">BINGO</span>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{title}</span>
      </div>
      <div
        className="grid min-h-0 flex-1 gap-1.5 p-2"
        style={{
          gridTemplateColumns: `repeat(${BINGO_SIZE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${BINGO_SIZE}, minmax(0, 1fr))`,
        }}
      >
        {card.map((tag, i) => {
          const claimed = claims[i];
          const marked = claimed !== null;
          const won = line?.includes(i) ?? false;
          const blot = blotOffset(i);
          return (
            <button
              key={i}
              type="button"
              disabled={!canClaim || marked}
              onClick={() => onClaim(i)}
              className={`relative flex min-h-0 items-center justify-center overflow-hidden rounded-lg border-2 p-1.5 text-center
                          text-xs font-black leading-tight text-neutral-900 transition-colors [text-shadow:none] ${
                            won
                              ? "border-yellow-500 bg-yellow-200"
                              : marked
                                ? "border-neutral-900/20 bg-white"
                                : missed === i
                                  ? "game-anim animate-[game-shake_0.45s_ease-in-out] border-red-500 bg-red-100"
                                  : lastFits?.includes(i)
                                    ? "border-dashed border-amber-500 bg-amber-50"
                                    : "border-neutral-900/20 bg-white enabled:hover:border-[rgb(var(--game))] enabled:hover:bg-[rgb(var(--game))]/10"
                          }`}
            >
              {claimed?.preview.url && (
                <img
                  src={claimed.preview.url}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover opacity-25 grayscale"
                />
              )}
              {marked && (
                <span
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  style={{ transform: `translate(${blot.x}px, ${blot.y}px) rotate(${blot.r}deg)` }}
                >
                  <span className="game-daub game-anim aspect-square w-[82%] max-w-[92px] animate-[game-daub_0.35s_ease-out_both] rounded-full" />
                </span>
              )}
              <span className="relative">{displayTagName(tag)}</span>
            </button>
          );
        })}
      </div>
      {line && (
        <Stamp color="rgb(250 204 21)" tilt={-14} delay={0.25} size="text-5xl">
          {blackout ? "Blackout!" : "Bingo!"}
        </Stamp>
      )}
    </div>
  );
}
