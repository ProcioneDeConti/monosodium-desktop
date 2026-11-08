import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MascotCue } from "../Mascot/MascotLayer";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, CornerDownLeft, ExternalLink, Flame, Trophy, X } from "lucide-react";
import { e621Api } from "../../api/client";
import { visiblePosts } from "../../lib/blacklist";
import {
  currentStreak,
  gameImageUrl,
  longestStreak,
  runGrade,
  runShareText,
  type RoundOutcome,
} from "../../lib/games";
import { openPostWindow } from "../../lib/postWindow";
import { displayTagName, hashString } from "../../lib/tagdle";
import type { Post } from "../../models/post";
import { SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { useAccountStore } from "../../state/accountStore";
import { loadGameSpecies, useGamesStore } from "../../state/gamesStore";
import { useEffectiveBlacklist, useSettingsStore } from "../../state/settingsStore";
import { ConfettiBurst } from "../Tagdle/Confetti";
import { Spinner } from "../ui/Spinner";
import { sfx } from "./sfx";

/** Which game is on screen - set by GamesPanel, read by the run summary's share text. */
export interface GameMeta {
  name: string;
  site: Site;
}
export const GameMetaContext = createContext<GameMeta | null>(null);

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Runs `effect` once per mount, even under StrictMode's double-invoked effects - for one-shot
 *  sounds that would otherwise play twice in dev. */
function useOnce(effect: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** `value`, animated from its previous value over `ms` (ease-out) - for scores ticking up.
 *  Animates only while it changes; instant under reduced motion. */
function useCountUp(value: number, ms = 650): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (prefersReducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const v = Math.round(from + (value - from) * (1 - (1 - p) ** 3));
      current.current = v;
      setShown(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return shown;
}

/** Tile colour for a round outcome. */
function outcomeClass(r: RoundOutcome): string {
  return r >= 1 ? "bg-green-500" : r > 0 ? "bg-amber-400" : "bg-red-500";
}

/** The user's rating filter as a tag string ("" when every rating is allowed). */
export function useRatingFilter(): string {
  return useSettingsStore((s) => s.ratingTagFilter)() ?? "";
}

/** An endless shuffled supply of usable posts for `tags`: `order:random` batches of 75, blacklist-
 *  and image-filtered, never repeating a post, refilled in the background (one rate-limited request
 *  per batch) when it runs low. `draw()` returns undefined while a refill is still in flight;
 *  the hook re-renders once posts arrive. `seen` is every accepted post so far (Artist Guesser
 *  draws its distractor names from it). */
export function usePostDeck(
  site: Site,
  tags: string,
  {
    accept,
    useRatingSetting = true,
    enabled = true,
  }: {
    accept?: (post: Post) => boolean;
    /** false when `tags` already pins a rating (Rating Judge's per-rating decks). */
    useRatingSetting?: boolean;
    enabled?: boolean;
  } = {},
) {
  const blacklistEntries = useEffectiveBlacklist();
  const userRatingFilter = useRatingFilter();
  const ratingFilter = useRatingSetting ? userRatingFilter : "";
  const query = `${tags} ${ratingFilter} order:random`.replace(/\s+/g, " ").trim();
  const queue = useRef<Post[]>([]);
  const seen = useRef<Post[]>([]);
  const seenIds = useRef(new Set<number>());
  const fetching = useRef(false);
  // Set when a refill found nothing new (a small favorites collection, used up). Stops further
  // refills - otherwise every draw on an empty queue would fire another request.
  const dry = useRef(false);
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const [error, setError] = useState<unknown>(null);

  const refill = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    let found = 0;
    try {
      // A batch can filter down to nothing (heavy blacklist, all videos) - try a few times.
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await e621Api.getPosts(site, query, 75);
        const fresh = visiblePosts(res.posts, blacklistEntries, false).filter(
          (p) => !seenIds.current.has(p.id) && gameImageUrl(p) && (acceptRef.current?.(p) ?? true),
        );
        for (const p of fresh) seenIds.current.add(p.id);
        queue.current.push(...fresh);
        seen.current.push(...fresh);
        found += fresh.length;
        if (fresh.length > 0 || res.posts.length === 0) break;
      }
      dry.current = found === 0;
    } catch (e) {
      setError(e);
    } finally {
      fetching.current = false;
      bump();
    }
  }, [site, query, blacklistEntries]);

  useEffect(() => {
    queue.current = [];
    dry.current = false;
    if (enabled) void refill();
  }, [refill, enabled]);

  const draw = useCallback((): Post | undefined => {
    const post = queue.current.shift();
    if (queue.current.length < 10 && enabled && !dry.current) void refill();
    return post;
  }, [refill, enabled]);

  return {
    draw,
    error,
    version,
    seen: seen.current,
    /** Nothing left to deal and nothing more to fetch. */
    exhausted: dry.current && queue.current.length === 0 && !fetching.current,
  };
}

/** Answers tried per round before giving up - each miss is one more rate-limited search. */
const ROUND_ATTEMPTS = 5;

export interface ListRoundOptions {
  /** Cache namespace, so different games/modes never share rounds. */
  key: string;
  /** Extra search terms alongside the answer tag (e.g. `solo score:>=20`). */
  extraTags: string;
  /** Extra check on a candidate post (Whodunnit: the answer must be one of its real artists). */
  accept?: (post: Post, answer: string) => boolean;
  /** false while a favorites-only run uses useDeckRound instead. */
  enabled?: boolean;
}

/** A round built from a tag list: a random answer from `list` (no repeats within a run while the
 *  list lasts) and one usable still image tagged with it. An answer with nothing usable - common
 *  under safe-only - is quietly swapped for another, up to ROUND_ATTEMPTS times; null only if
 *  every attempt missed. The next round is fetched in the background while this one is played. */
export function useListRound(
  site: Site,
  list: string[],
  round: number,
  rounds: number,
  { key, extraTags, accept, enabled = true }: ListRoundOptions,
) {
  const blacklistEntries = useEffectiveBlacklist();
  const ratingFilter = useRatingFilter();
  // Per-run identity so "Play again" deals fresh rounds instead of the cached ones.
  const [runId] = useState(() => Math.random());
  const used = useRef(new Set<string>());

  const options = (r: number) => ({
    queryKey: ["game-list-round", key, site, runId, r, ratingFilter],
    staleTime: Infinity,
    queryFn: async (): Promise<{ answer: string; post: Post } | null> => {
      for (let attempt = 0; attempt < ROUND_ATTEMPTS; attempt++) {
        const fresh = list.filter((t) => !used.current.has(t));
        const pool = fresh.length > 0 ? fresh : list;
        const answer = pool[Math.floor(Math.random() * pool.length)];
        // Claimed before the fetch so the concurrent prefetch can't pick the same one.
        used.current.add(answer);
        const query = `${answer} ${extraTags} ${ratingFilter} order:random`.replace(/\s+/g, " ").trim();
        const res = await e621Api.getPosts(site, query, 30);
        const post = visiblePosts(res.posts, blacklistEntries, false).find(
          (p) => gameImageUrl(p) && (accept?.(p, answer) ?? true),
        );
        if (post) return { answer, post };
      }
      return null;
    },
  });

  const current = useQuery({ ...options(round), enabled });
  useQuery({ ...options(round + 1), enabled: enabled && round + 1 < rounds });
  return current;
}

/** A species round - a solo post, so there's one right species. */
export function useSpeciesRound(site: Site, list: string[], round: number, rounds: number, enabled = true) {
  return useListRound(site, list, round, rounds, { key: "species", extraTags: "solo score:>=20", enabled });
}

export interface RoundResult {
  data: { answer: string; post: Post } | null | undefined;
  isLoading: boolean;
  error: unknown;
}

/** Rounds dealt from a post deck (favorites-only runs) instead of per-round searches: each round
 *  draws posts until `pickAnswer` finds one it can ask about. Same shape as useListRound's result.
 *  `null` once the deck runs out. */
export function useDeckRound(
  deck: ReturnType<typeof usePostDeck>,
  round: number,
  pickAnswer: (post: Post) => string | null,
): RoundResult {
  const [byRound, setByRound] = useState<Record<number, { answer: string; post: Post } | null>>({});
  const pickRef = useRef(pickAnswer);
  pickRef.current = pickAnswer;
  useEffect(() => {
    if (round in byRound) return;
    for (let post = deck.draw(); post; post = deck.draw()) {
      const answer = pickRef.current(post);
      if (answer) {
        setByRound((m) => ({ ...m, [round]: { answer, post: post! } }));
        return;
      }
    }
    if (deck.exhausted) setByRound((m) => ({ ...m, [round]: null }));
  }, [round, byRound, deck.draw, deck.version, deck.exhausted]);
  return { data: byRound[round], isLoading: !(round in byRound) && !deck.error, error: deck.error };
}

/** The username favorites-only runs search (`fav:<name>`), or null when the mode is off or
 *  nobody is signed in on this site. */
export function useFavoritesUser(site: Site): string | null {
  const favoritesOnly = useGamesStore((s) => s.favoritesOnly);
  const username = useAccountStore((s) => s.accounts[site]?.username?.trim());
  return favoritesOnly && username ? username : null;
}

/** "You've been through every usable favorite" end state. */
export function FavoritesExhausted() {
  return (
    <p className="mx-auto max-w-md rounded-xl bg-neutral-900/80 px-4 py-3 text-center text-sm">
      Not enough usable posts in your favorites for this game - it needs still images (and, for some
      games, solo posts) your blacklist and rating filter allow. Turn off Favorites only to keep playing.
    </p>
  );
}

/** The live species list (see loadGameSpecies), minus species the user's blacklist bans outright. */
export function useGameSpecies(site: Site) {
  const blacklistEntries = useEffectiveBlacklist();
  const query = useQuery({
    queryKey: ["game-species", site],
    queryFn: () => loadGameSpecies(site),
    staleTime: Infinity,
  });
  const banned = new Set(blacklistEntries.filter((e) => e.length === 1).map((e) => e[0]));
  return query.data?.filter((t) => !banned.has(t)) ?? null;
}

/** Soft-edge mask for the sharp layer when `hideEdges` is on: corners fully hidden, edge midpoints
 *  partly, plus a band along the bottom - where signatures usually sit. */
const EDGE_MASK =
  "radial-gradient(ellipse at center, black 55%, transparent 85%), linear-gradient(to top, transparent 7%, black 18%)";

/** A post's image, contained, with a blurred copy filling the letterbox (as Tagdle's cards do).
 *  `hideEdges` (Artist Guesser) blurs the image's own corners and bottom edge to hide most
 *  signatures: a blurred copy sits underneath and the sharp copy on top is masked to the centre,
 *  so no sharp edge pixels show at all. Both copies share one grid cell, so they line up exactly
 *  whatever the letterboxing. */
export function GameImage({
  url,
  className = "",
  imgStyle,
  hideEdges = false,
  photo = false,
  settled = false,
  children,
}: {
  url: string;
  className?: string;
  imgStyle?: CSSProperties;
  hideEdges?: boolean;
  /** The round's main picture: a printed-photo frame, tilted a degree or two until `settled`. */
  photo?: boolean;
  /** The round's been answered - the photo straightens up. */
  settled?: boolean;
  children?: ReactNode;
}) {
  const mask: CSSProperties = hideEdges
    ? { maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK, maskComposite: "intersect", WebkitMaskComposite: "source-in" }
    : {};
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-black/20 dark:bg-black/40 ${
        photo ? "game-photo rounded-lg" : "rounded-xl"
      } ${className}`}
      style={photo && !settled ? { transform: `rotate(${photoTilt(url)}deg)` } : undefined}
    >
      <img
        src={url}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl"
      />
      <div className="relative grid h-full w-full grid-cols-[100%] grid-rows-[100%] place-items-center">
        {hideEdges && (
          <img
            src={url}
            alt=""
            aria-hidden
            draggable={false}
            className="max-h-full max-w-full [grid-area:1/1]"
            style={{ filter: "blur(14px)" }}
          />
        )}
        <img
          src={url}
          alt=""
          draggable={false}
          // Without hideEdges, fill the cell so small images still scale up; with it, the image
          // must keep its own box so the edge mask lands on the picture, not the letterbox.
          className={`${hideEdges ? "max-h-full max-w-full" : "h-full w-full"} object-contain [grid-area:1/1]`}
          style={{ ...imgStyle, ...mask }}
        />
      </div>
      {children}
    </div>
  );
}

/** A subtle tilt for a photo, -1.8..1.8 degrees (never near-flat), fixed per image so a re-render
 *  doesn't wobble it. */
function photoTilt(url: string): number {
  const h = hashString(url);
  const mag = 0.9 + ((h >>> 1) % 90) / 100;
  return h & 1 ? mag : -mag;
}

/** A 2-column multiple-choice grid of sticker buttons, numbered 1-4 (the number keys pick them).
 *  After a pick the answer pops green and a wrong pick shakes red. */
export function ChoiceGrid({
  choices,
  answer,
  picked,
  disabled,
  onPick,
  label = displayTagName,
}: {
  choices: string[];
  answer: string;
  /** The final pick (reveals the answer), or null while still guessing. */
  picked: string | null;
  /** Choices already ruled out (Zoom Reveal's wrong guesses), greyed out but round still open. */
  disabled?: ReadonlySet<string>;
  onPick: (choice: string) => void;
  label?: (choice: string) => string;
}) {
  // Number keys pick a choice while the round is open. Latest props via a ref, so the listener is
  // attached once per open round rather than on every render.
  const live = useRef({ choices, disabled, onPick });
  live.current = { choices, disabled, onPick };
  const open = picked === null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = Number(e.key) - 1;
      const { choices: cs, disabled: off, onPick: pickIt } = live.current;
      if (!Number.isInteger(i) || i < 0 || i >= cs.length || off?.has(cs[i])) return;
      e.preventDefault();
      pickIt(cs[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="grid w-full max-w-xl grid-cols-2 gap-2.5">
      {choices.map((c, i) => {
        const ruledOut = disabled?.has(c) ?? false;
        const isAnswer = picked !== null && c === answer;
        const isWrong = picked !== null && c !== answer && (c === picked || ruledOut);
        const state = open
          ? ruledOut
            ? "bg-red-500/25 opacity-50 line-through"
            : "bg-neutral-900/90 hover:bg-[rgb(var(--game))]"
          : isAnswer
            ? "game-anim bg-green-500 animate-[game-pop-in_0.35s_ease-out]"
            : isWrong
              ? `bg-red-500 ${c === picked ? "game-anim animate-[game-shake_0.45s_ease-in-out]" : "opacity-60"}`
              : "bg-neutral-900/90 opacity-40";
        return (
          <button
            key={c}
            type="button"
            disabled={!open || ruledOut}
            onClick={() => onPick(c)}
            className={`game-sticker-sm game-press group relative flex min-h-11 items-center justify-center rounded-xl py-2.5 pl-10 pr-3
                        text-sm font-bold text-white ${state}`}
          >
            <span
              className={`absolute left-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-xs font-black ${
                isAnswer || isWrong ? "bg-black/25" : "bg-white/15 group-hover:bg-black/25"
              }`}
            >
              {isAnswer ? <Check size={14} strokeWidth={3.5} /> : isWrong ? <X size={14} strokeWidth={3.5} /> : i + 1}
            </span>
            <span className="break-words">{label(c)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The quiz runs' score banner: round badge, live streak flame, a score that ticks up (with a
 *  "+N" floating off it), best, and one progress segment per round coloured by how it went. */
export function RunHeader({
  round,
  total,
  score,
  best,
  unit = "pts",
  results,
}: {
  round: number;
  total: number;
  score: number;
  best: number;
  unit?: string;
  /** Each finished round's outcome; without it the segments just fill in the game's colour. */
  results?: RoundOutcome[];
}) {
  const shown = useCountUp(score);
  const streak = results ? currentStreak(results) : 0;
  // "+N" floater: keyed by the score it rose to, so each gain replays the animation.
  const lastScore = useRef(score);
  const [gain, setGain] = useState<{ n: number; key: number } | null>(null);
  useEffect(() => {
    if (score > lastScore.current) setGain({ n: score - lastScore.current, key: score });
    lastScore.current = score;
  }, [score]);
  useOnce(() => {
    if (round === 0) sfx.resetCombo();
  });

  return (
    <div className="game-sticker mb-5 rounded-2xl bg-neutral-900/90 px-3 py-2.5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="game-sticker-sm rounded-lg bg-[rgb(var(--game))] px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-white">
          Round {Math.min(round + 1, total)}
          <span className="opacity-60">/{total}</span>
        </span>
        {streak >= 2 && (
          <span
            key={streak}
            className="game-anim flex animate-[game-pop-in_0.35s_ease-out] items-center gap-0.5 rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-black text-orange-400"
            title={`${streak} in a row`}
          >
            <Flame size={11 + Math.min(streak, 8) * 1.2} className="fill-orange-400/60" />
            {streak}
          </span>
        )}
        <span className="relative ml-auto text-xl font-black tabular-nums">
          {gain && (
            <span
              key={gain.key}
              className="game-anim pointer-events-none absolute -top-4 right-0 animate-[game-float_1.1s_ease-out_both] text-sm font-black text-green-400"
            >
              +{gain.n}
            </span>
          )}
          {shown} <span className="text-xs font-semibold opacity-50">{unit}</span>
        </span>
        <span className="flex items-center gap-1 rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-bold text-yellow-400">
          <Trophy size={12} /> {best}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => {
          const done = results ? results[i] : i < round ? 1 : undefined;
          const color =
            done === undefined
              ? i === round
                ? "bg-[rgb(var(--game))]/50"
                : "bg-white/12"
              : results
                ? outcomeClass(done)
                : "bg-[rgb(var(--game))]";
          return <span key={i} className={`h-2 flex-1 rounded-full transition-colors duration-300 ${color}`} />;
        })}
      </div>
    </div>
  );
}

/** End-of-run poster: grade, a score that counts up, per-round tiles, best streak, a "NEW BEST"
 *  sticker when earned, a copyable share block, and Play again. */
export function RunSummary({
  score,
  max,
  previousBest,
  unit = "pts",
  results,
  onRestart,
}: {
  score: number;
  max: number;
  /** The best before this run, so "New best!" only fires when it was actually beaten. */
  previousBest: number;
  unit?: string;
  results?: RoundOutcome[];
  onRestart: () => void;
}) {
  const meta = useContext(GameMetaContext);
  const newBest = score > previousBest;
  const grade = runGrade(score, max);
  // Counts up from zero on arrival.
  const [target, setTarget] = useState(0);
  useEffect(() => setTarget(score), [score]);
  const shown = useCountUp(target, 900);
  const [copied, setCopied] = useState(false);
  const share = meta && results ? runShareText(meta.name, SITE_DISPLAY_NAME[meta.site], score, max, unit, results) : null;
  const streak = results ? longestStreak(results) : 0;
  useOnce(() => sfx.finish(newBest));

  async function copy() {
    if (!share) return;
    await navigator.clipboard.writeText(share);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-6 text-center">
      <div className="game-sticker relative w-full rounded-3xl bg-neutral-900/90 px-6 pb-6 pt-7">
        {/* Any run that scored gets the rainbow, like Tagdle's finished daily. */}
        {score > 0 && <ConfettiBurst variant="rainbow" />}
        <MascotCue kind={score > 0 ? "gameWin" : "gameLose"} />
        {newBest && (
          <span className="game-anim game-sticker-sm absolute -right-3 -top-3 animate-[game-stamp_0.5s_0.6s_ease-out_both] rounded-full bg-yellow-400 px-3 py-1 text-xs font-black uppercase tracking-wider text-black [--stamp-tilt:8deg] [text-shadow:none]">
            New best!
          </span>
        )}
        <div className="flex items-center justify-center gap-4">
          <span className="game-sticker game-anim flex h-16 w-16 shrink-0 animate-[game-stamp_0.5s_ease-out_both] items-center justify-center rounded-2xl bg-[rgb(var(--game))] text-4xl font-black text-white [--stamp-tilt:-6deg]">
            {grade.letter}
          </span>
          <div className="text-left">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-[rgb(var(--game))] brightness-125">{grade.title}</p>
            <p className="text-5xl font-black leading-none tabular-nums">
              {shown}
              <span className="text-lg font-bold opacity-50">
                {" "}
                / {max} {unit}
              </span>
            </p>
          </div>
        </div>
        {results && (
          <div className="mt-5 grid grid-cols-5 justify-items-center gap-1.5">
            {results.map((r, i) => (
              <span
                key={i}
                className={`game-anim game-sticker-sm flex h-9 w-9 animate-[game-pop-in_0.35s_ease-out_both] items-center justify-center rounded-lg text-white ${outcomeClass(r)}`}
                style={{ animationDelay: `${300 + i * 60}ms` }}
              >
                {r >= 1 ? <Check size={17} strokeWidth={3.5} /> : r > 0 ? "~" : <X size={17} strokeWidth={3.5} />}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-bold">
          {results && streak > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-orange-500/20 px-2.5 py-1 text-orange-400">
              <Flame size={13} /> Best streak {streak}
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-yellow-500/15 px-2.5 py-1 text-yellow-400">
            <Trophy size={13} /> {newBest ? `Previous best ${previousBest}` : `Best ${previousBest}`}
          </span>
        </div>
      </div>

      {share && (
        <div className="game-sticker-sm w-full rounded-2xl bg-neutral-900/90 p-3 text-left">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed [text-shadow:none]">{share}</pre>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void copy()}
              className="game-sticker-sm game-press flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy result"}
            </button>
          </div>
        </div>
      )}

      <NextButton onClick={onRestart}>Play again</NextButton>
    </div>
  );
}

/** Light-hearted lines under a loading label - one picked per load, no cycling. */
const LOADING_QUIPS = [
  "Bribing the raccoon…",
  "Polishing the stickers…",
  "Loading the confetti cannon…",
  "Rummaging through the bins…",
  "Shaking down the alley…",
  "Asking Gus nicely…",
];

export function CenteredSpinner({ label }: { label: string }) {
  const [quip] = useState(() => LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)]);
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 text-sm">
      <span className="game-sticker-sm flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--game))]">
        <Spinner />
      </span>
      <span className="font-bold">{label}</span>
      <span className="text-xs italic opacity-60">{quip}</span>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return <p className="text-sm text-red-500">Couldn't load posts: {String(error)}</p>;
}

const CHEERS = ["Correct!", "Nailed it!", "Yes!", "Bingo!", "Spot on!"];

/** The round's verdict: a big tilted sticker that stamps down ("Correct!" / "Close!" / "Nope!"),
 *  with the sound, confetti and mascot reaction to match. `children` (e.g. "+92 · Speedy!") sits
 *  in a pill underneath. */
export function Verdict({ ok, close = false, children }: { ok: boolean; close?: boolean; children?: ReactNode }) {
  const [cheer] = useState(() => CHEERS[Math.floor(Math.random() * CHEERS.length)]);
  useOnce(() => {
    sfx.thump();
    if (ok) sfx.correct();
    else if (close) sfx.close();
    else sfx.wrong();
  });
  const tone = ok ? "bg-green-500" : close ? "bg-amber-400 text-black [text-shadow:none]" : "bg-red-500";
  return (
    <div className="relative flex flex-col items-center gap-2">
      {ok && <ConfettiBurst />}
      <MascotCue kind={ok || close ? "gameRight" : "gameWrong"} />
      <span
        className={`game-sticker game-anim inline-block animate-[game-stamp_0.45s_ease-out_both] rounded-xl px-5 py-1 text-2xl font-black uppercase italic tracking-wide text-white ${tone}`}
        style={{ "--stamp-tilt": ok ? "-4deg" : "3deg" } as CSSProperties}
      >
        {ok ? cheer : close ? "Close!" : "Nope!"}
      </span>
      {children && (
        <span className="game-anim animate-[game-pop-in_0.3s_0.25s_ease-out_both] rounded-full bg-neutral-900/90 px-3 py-0.5 text-sm font-bold">
          {children}
        </span>
      )}
    </div>
  );
}

/** The big "Next" call to action - a chunky sticker in the game's colour, hard to miss on the
 *  brick wall. Focused on arrival, so Enter presses it (the hint says so). */
export function NextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => {
        sfx.tap();
        onClick();
      }}
      autoFocus
      className="game-sticker game-press flex items-center gap-2 rounded-full bg-[rgb(var(--game))] px-7 py-2.5 text-base font-black
                 uppercase tracking-wide text-white hover:brightness-110
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      {children}
      <ArrowRight size={18} strokeWidth={3} />
      <kbd className="ml-1 flex items-center gap-0.5 rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal">
        <CornerDownLeft size={10} strokeWidth={3} /> Enter
      </kbd>
    </button>
  );
}

/** Opens the post in its own window, so the game stays put. Only shown once a round is answered -
 *  the post page would give the answer away. */
export function ViewPostButton({ site, post, label }: { site: Site; post: Post; label?: string }) {
  return (
    // Not the shared Button: its light-theme surface would fight the dark pill, and Tagdle renders
    // outside the games' dark-theme subtree.
    <button
      type="button"
      onClick={() => openPostWindow(post.id, site)}
      className="game-sticker-sm game-press flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-3 py-1 text-xs
                 font-bold text-white hover:bg-neutral-800"
    >
      <ExternalLink size={13} />
      {label ?? `View post #${post.id}`}
    </button>
  );
}

/** What sits under an answered round: the verdict line's companion - Next, plus a link to each
 *  post the round showed. */
export function RoundActions({
  site,
  posts,
  onNext,
  nextLabel,
}: {
  site: Site;
  posts: { post: Post; label?: string }[];
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <NextButton onClick={onNext}>{nextLabel}</NextButton>
      <div className="flex flex-wrap justify-center gap-2">
        {posts.map(({ post, label }) => (
          <ViewPostButton key={post.id} site={site} post={post} label={label} />
        ))}
      </div>
    </div>
  );
}
