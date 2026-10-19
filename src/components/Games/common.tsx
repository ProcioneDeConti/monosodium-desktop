import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink, RotateCcw, Trophy, X } from "lucide-react";
import { e621Api } from "../../api/client";
import { visiblePosts } from "../../lib/blacklist";
import { gameImageUrl } from "../../lib/games";
import { openPostWindow } from "../../lib/postWindow";
import { displayTagName } from "../../lib/tagdle";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import { useAccountStore } from "../../state/accountStore";
import { loadGameSpecies, useGamesStore } from "../../state/gamesStore";
import { useEffectiveBlacklist, useSettingsStore } from "../../state/settingsStore";
import { ConfettiBurst } from "../Tagdle/Confetti";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

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
  children,
}: {
  url: string;
  className?: string;
  imgStyle?: CSSProperties;
  hideEdges?: boolean;
  children?: ReactNode;
}) {
  const mask: CSSProperties = hideEdges
    ? { maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK, maskComposite: "intersect", WebkitMaskComposite: "source-in" }
    : {};
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-black/20 dark:bg-black/40 ${className}`}>
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

/** A 2-column multiple-choice grid. After a pick the answer turns green, a wrong pick red. */
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
  return (
    <div className="grid w-full max-w-xl grid-cols-2 gap-2">
      {choices.map((c) => {
        const ruledOut = disabled?.has(c) ?? false;
        const state =
          picked === null
            ? ruledOut
              ? "opacity-35 line-through"
              : "hover:border-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/10"
            : c === answer
              ? "border-green-500 bg-green-500/15 text-green-600 dark:text-green-400"
              : c === picked || ruledOut
                ? "border-red-500 bg-red-500/10 text-red-500"
                : "opacity-50";
        return (
          <button
            key={c}
            type="button"
            disabled={picked !== null || ruledOut}
            onClick={() => onPick(c)}
            className={`relative flex items-center justify-center gap-1.5 rounded-xl border-2 border-black/10 dark:border-white/10
                        bg-neutral-900/80 backdrop-blur-sm px-3 py-2.5 text-sm font-semibold transition-colors ${state}`}
          >
            {picked !== null && c === answer && <Check size={15} strokeWidth={3} />}
            {picked !== null && c !== answer && (c === picked || ruledOut) && <X size={15} strokeWidth={3} />}
            {label(c)}
          </button>
        );
      })}
    </div>
  );
}

/** Round counter + progress bar + running score for the quiz-style runs. */
export function RunHeader({
  round,
  total,
  score,
  best,
  unit = "pts",
}: {
  round: number;
  total: number;
  score: number;
  best: number;
  unit?: string;
}) {
  return (
    <div className="mb-4 rounded-xl bg-neutral-900/80 px-3 py-2.5 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-3 text-sm">
        <span className="font-bold">
          Round {Math.min(round + 1, total)}
          <span className="font-normal opacity-50">/{total}</span>
        </span>
        <span className="ml-auto font-bold tabular-nums">
          {score} <span className="font-normal opacity-50">{unit}</span>
        </span>
        <span className="flex items-center gap-1 rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
          <Trophy size={12} /> Best {best}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div
          className="h-full rounded-full bg-[rgb(var(--accent))] transition-[width] duration-500"
          style={{ width: `${(round / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** End-of-run card: score, new-best confetti, play again. */
export function RunSummary({
  score,
  max,
  previousBest,
  unit = "pts",
  onRestart,
}: {
  score: number;
  max: number;
  /** The best before this run, so "New best!" only fires when it was actually beaten. */
  previousBest: number;
  unit?: string;
  onRestart: () => void;
}) {
  const newBest = score > previousBest;
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="relative text-4xl font-black tabular-nums">
        {/* Any run that scored gets the rainbow, like Tagdle's finished daily. */}
        {score > 0 && <ConfettiBurst variant="rainbow" />}
        {score}
        <span className="text-xl font-semibold opacity-50">
          {" "}
          / {max} {unit}
        </span>
      </p>
      <p className="text-sm opacity-60">{newBest ? "New best!" : `Best: ${previousBest}`}</p>
      <Button onClick={onRestart} icon={<RotateCcw size={14} />}>
        Play again
      </Button>
    </div>
  );
}

export function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 text-sm opacity-70">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return <p className="text-sm text-red-500">Couldn't load posts: {String(error)}</p>;
}

/** "Correct!" / "Not quite!" line under a round - a correct one pops a small confetti burst. */
export function Verdict({ ok, children }: { ok: boolean; children?: ReactNode }) {
  return (
    <p
      className={`relative rounded-full bg-neutral-900/85 px-3 py-1 text-sm font-semibold ${ok ? "text-green-400" : "text-red-400"}`}
    >
      {ok && <ConfettiBurst />}
      {ok ? "Correct!" : "Not quite!"} {children}
    </p>
  );
}

/** The big "Next" call to action - an accent pill, hard to miss on the brick wall. */
export function NextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus
      className="flex items-center gap-2 rounded-full bg-[rgb(var(--accent))] px-7 py-2.5 text-sm font-bold text-white
                 shadow-lg shadow-black/40 transition hover:brightness-110 active:scale-95
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {children}
      <ArrowRight size={16} strokeWidth={2.5} />
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
      className="flex items-center gap-1.5 rounded-full border border-white/15 bg-neutral-900/80 px-3 py-1 text-xs
                 font-semibold text-white transition-colors hover:border-[rgb(var(--accent))] hover:bg-neutral-800"
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
