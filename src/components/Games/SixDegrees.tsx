import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronRight, Copy, Flag, Heart, Info, Link2, Shuffle, Trophy } from "lucide-react";
import { e621Api } from "../../api/client";
import { visiblePosts } from "../../lib/blacklist";
import {
  dailySixDegrees,
  favoriteEndpoints,
  pickSixDegrees,
  sixDegreesCandidates,
  sixDegreesShareText,
  wikiSummary,
  type SixDegreesPuzzle,
} from "../../lib/games";
import { displayTagName, filterPool, utcDayKey } from "../../lib/tagdle";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { allTags, categorizedTags, type Post, type TagCategory } from "../../models/post";
import { SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { useGamesStore } from "../../state/gamesStore";
import { useEffectiveBlacklist } from "../../state/settingsStore";
import { loadPool } from "../../state/tagdleStore";
import { ConfettiBurst } from "../Tagdle/Confetti";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { CenteredSpinner, ErrorNote, NextButton, useFavoritesUser, useRatingFilter, ViewPostButton } from "./common";
import { SixDegreesMap } from "./SixDegreesMap";
import type { HopEdge, MapInput } from "../../lib/sixDegreesMap";

type Mode = "daily" | "endless";

/** Posts shown per hop - the top-scored ones for the current tag. */
const POSTS_PER_HOP = 24;

/** Categories whose untaken tags show up as stubs on the end map (general tags like `solo` would
 *  bury the interesting branches). */
const STUB_CATEGORIES: TagCategory[] = ["species", "copyright", "character", "artist"];

interface SixFinish {
  /** Hops taken, or null when the player gave up. */
  hops: number | null;
  map: MapInput;
}

/** Tag categories you can hop through (meta/lore/invalid are bookkeeping, not connections). */
const HOP_CATEGORIES: TagCategory[] = ["artist", "copyright", "character", "species", "general"];

/** Get from one tag to another by hopping through posts: open a post tagged with where you are,
 *  pick one of its tags, repeat. Daily (one seeded puzzle per UTC day) or Endless. */
export function SixDegrees({ site }: { site: Site }) {
  const [chosenMode, setMode] = useState<Mode>("daily");
  const favUser = useFavoritesUser(site);
  // A favorites game is personal, so there's no shared daily - Endless only.
  const mode: Mode = favUser ? "endless" : chosenMode;
  const ranked = useCandidates(site, !favUser);
  const fromFavorites = useFavoriteCandidates(site, favUser);
  const candidates = favUser ? fromFavorites : ranked;

  return (
    <div>
      {favUser ? (
        <p className="mx-auto mb-4 flex w-fit items-center gap-1.5 rounded-full bg-neutral-900/80 px-3 py-1 text-xs">
          <Heart size={12} className="text-pink-400" /> Endless, through your favorites only
        </p>
      ) : (
        <div className="mb-4 flex justify-center">
          <div className="flex rounded-full bg-neutral-900/75 p-0.5">
            {(["daily", "endless"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                  mode === m ? "bg-[rgb(var(--accent))] text-white shadow" : "opacity-60 hover:opacity-100"
                }`}
              >
                {m === "daily" ? "Daily" : "Endless"}
              </button>
            ))}
          </div>
        </div>
      )}
      {candidates.error ? (
        <ErrorNote error={candidates.error} />
      ) : !candidates.data ? (
        <CenteredSpinner label="Fetching tags…" />
      ) : mode === "daily" ? (
        <SixDaily key={site} site={site} candidates={candidates.data} />
      ) : (
        <SixEndless key={`${site}:${favUser}`} site={site} candidates={candidates.data} favUser={favUser} />
      )}
    </div>
  );
}

/** Endpoint candidates from Tagdle's (weekly cached) top-tag pools, blacklist-filtered. */
function useCandidates(site: Site, enabled: boolean) {
  const blacklistEntries = useEffectiveBlacklist();
  const query = useQuery({
    queryKey: ["six-degrees-pool", site],
    queryFn: () => loadPool(site, ["species", "copyright"]),
    staleTime: Infinity,
    enabled,
  });
  const data = useMemo(
    () => (query.data ? sixDegreesCandidates(filterPool(query.data, blacklistEntries)) : null),
    [query.data, blacklistEntries],
  );
  return { data, error: query.error };
}

/** Endpoint candidates from a random sample of the user's favorites (one request): species and
 *  copyright tags common enough there to link through. */
function useFavoriteCandidates(site: Site, favUser: string | null) {
  const blacklistEntries = useEffectiveBlacklist();
  const ratingFilter = useRatingFilter();
  const query = useQuery({
    queryKey: ["six-degrees-fav-pool", site, favUser, ratingFilter],
    queryFn: () => e621Api.getPosts(site, `fav:${favUser} ${ratingFilter} order:random`.replace(/\s+/g, " ").trim(), 320),
    staleTime: Infinity,
    enabled: !!favUser,
  });
  const data = useMemo(
    () =>
      query.data
        ? filterPool(favoriteEndpoints(visiblePosts(query.data.posts, blacklistEntries, false)), blacklistEntries)
        : null,
    [query.data, blacklistEntries],
  );
  return { data, error: query.error };
}

function SixDaily({ site, candidates }: { site: Site; candidates: ReturnType<typeof sixDegreesCandidates> }) {
  const dayKey = useMemo(() => utcDayKey(), []);
  const resultKey = `${site}:${dayKey}`;
  const saved = useGamesStore((s) => s.sixDaily[resultKey]);
  const recordSixDaily = useGamesStore((s) => s.recordSixDaily);
  const puzzle = useMemo(() => dailySixDegrees(candidates, site, dayKey), [candidates, site, dayKey]);
  const [justFinished, setJustFinished] = useState(false);
  // This session's map only - it isn't saved, so reopening a finished daily shows just the result.
  const [map, setMap] = useState<MapInput | null>(null);
  const [copied, setCopied] = useState(false);

  if (!puzzle) return <p className="text-sm opacity-60">Not enough tags to build a puzzle.</p>;

  if (saved !== undefined) {
    const text = sixDegreesShareText(SITE_DISPLAY_NAME[site], dayKey, saved);
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Endpoints puzzle={puzzle} />
        <p className="relative text-3xl font-black">
          {justFinished && saved !== null && <ConfettiBurst variant="rainbow" />}
          {saved === null ? "Gave up" : `${saved} hop${saved === 1 ? "" : "s"}`}
        </p>
        <p className="text-sm opacity-60">Today's puzzle is done - a new one unlocks at 00:00 UTC. Endless is always open.</p>
        <Button
          onClick={() => {
            void navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
        >
          {copied ? "Copied" : "Copy result"}
        </Button>
        {map && <SixDegreesMap {...map} />}
      </div>
    );
  }

  return (
    <SixPuzzle
      site={site}
      puzzle={puzzle}
      onFinish={({ hops, map }) => {
        setJustFinished(true);
        setMap(map);
        recordSixDaily(resultKey, hops);
      }}
    />
  );
}

function SixEndless({
  site,
  candidates,
  favUser,
}: {
  site: Site;
  candidates: ReturnType<typeof sixDegreesCandidates>;
  favUser: string | null;
}) {
  const bestKey = favUser ? `sixDegrees:fav:${site}` : `sixDegrees:${site}`;
  const best = useGamesStore((s) => s.best[bestKey]);
  const recordLowest = useGamesStore((s) => s.recordLowest);
  const [puzzle, setPuzzle] = useState(() => pickSixDegrees(candidates, Math.random));
  const [result, setResult] = useState<SixFinish | undefined>(undefined);
  const [count, setCount] = useState(0);

  if (!puzzle) return <p className="text-sm opacity-60">Not enough tags to build a puzzle.</p>;

  function another() {
    setPuzzle(pickSixDegrees(candidates, Math.random));
    setResult(undefined);
    setCount(count + 1);
  }

  return (
    <div>
      <div className="mb-3 flex justify-center">
        <span className="flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-3 py-1 text-sm font-semibold text-yellow-600 dark:text-yellow-400">
          <Trophy size={14} /> Fewest hops {best ?? "-"}
        </span>
      </div>
      {result === undefined ? (
        <SixPuzzle
          key={count}
          site={site}
          puzzle={puzzle}
          favUser={favUser}
          onFinish={(finish) => {
            setResult(finish);
            if (finish.hops !== null) recordLowest(bestKey, finish.hops);
          }}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Endpoints puzzle={puzzle} />
          <p className="relative text-3xl font-black">
            {result.hops !== null && <ConfettiBurst variant="rainbow" />}
            {result.hops === null ? "Gave up" : `${result.hops} hop${result.hops === 1 ? "" : "s"}`}
          </p>
          <NextButton onClick={another}>Next puzzle</NextButton>
          <SixDegreesMap {...result.map} />
        </div>
      )}
    </div>
  );
}

function SixPuzzle({
  site,
  puzzle,
  favUser = null,
  onFinish,
}: {
  site: Site;
  puzzle: SixDegreesPuzzle;
  /** Set for a favorites game - hops only show the user's favorites. */
  favUser?: string | null;
  onFinish: (finish: SixFinish) => void;
}) {
  const [path, setPath] = useState<string[]>([puzzle.start]);
  const [selected, setSelected] = useState<Post | null>(null);
  // The target's card starts open - knowing what you're heading for is half the puzzle.
  const [about, setAbout] = useState<string | null>(puzzle.target);
  const current = path[path.length - 1];
  const [shuffle, setShuffle] = useState(0);
  // Every post shown on an earlier hop, so a broad tag doesn't keep serving the same ones.
  const seen = useRef(new Set<number>());
  const posts = useHopPosts(site, current, path.slice(0, -1), seen.current, shuffle, favUser);

  useEffect(() => {
    for (const p of posts.data ?? []) seen.current.add(p.id);
  }, [posts.data]);

  useEffect(() => setSelected(null), [current]);

  // Exploration record for the end map: every hop (backtracked ones too), and the stub-worthy
  // tags of each post opened, per tag it was opened from.
  const edges = useRef<HopEdge[]>([]);
  const untaken = useRef(new Map<string, string[]>());

  function openPost(post: Post) {
    setSelected(post);
    const tags = categorizedTags(post)
      .filter((t) => STUB_CATEGORIES.includes(t.category) && t.name !== current)
      .map((t) => t.name);
    const list = untaken.current.get(current) ?? [];
    untaken.current.set(current, [...list, ...tags.filter((t) => !list.includes(t))]);
  }

  function finish(hops: number | null) {
    onFinish({
      hops,
      map: {
        start: puzzle.start,
        target: puzzle.target,
        edges: edges.current,
        finalPath: hops === null ? path : [...path, puzzle.target],
        untaken: untaken.current,
      },
    });
  }

  function hop(tag: string) {
    if (selected) edges.current.push({ from: current, to: tag, postId: selected.id });
    if (tag === puzzle.target) {
      finish(path.length);
      return;
    }
    const existing = path.indexOf(tag);
    setPath(existing >= 0 ? path.slice(0, existing + 1) : [...path, tag]);
  }

  return (
    <div className="flex flex-col gap-4">
      <Endpoints puzzle={puzzle} about={about} onAbout={setAbout} />
      {about && <TagInfoCard key={about} site={site} tag={about} />}
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-neutral-900/80 px-3 py-2 text-xs backdrop-blur-sm">
        <span className="mr-1 font-semibold opacity-60">
          <Link2 size={12} className="mr-1 inline" />
          {path.length - 1} hop{path.length === 2 ? "" : "s"}:
        </span>
        {path.map((tag, i) => (
          <span key={`${tag}:${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="opacity-40" />}
            <button
              type="button"
              title={i < path.length - 1 ? "Go back to here" : undefined}
              disabled={i === path.length - 1}
              onClick={() => setPath(path.slice(0, i + 1))}
              className={`rounded-full px-2 py-0.5 ${
                i === path.length - 1
                  ? "bg-[rgb(var(--accent))] font-semibold text-white"
                  : "bg-neutral-900/75 hover:bg-[rgb(var(--accent))]/20"
              }`}
            >
              {displayTagName(tag)}
            </button>
          </span>
        ))}
        <Button onClick={() => finish(null)} icon={<Flag size={12} />} className="ml-auto">
          Give up
        </Button>
      </div>

      {selected ? (
        <SelectedPost site={site} post={selected} current={current} target={puzzle.target} onHop={hop} onBack={() => setSelected(null)} />
      ) : posts.error ? (
        <ErrorNote error={posts.error} />
      ) : !posts.data ? (
        <CenteredSpinner label={`Loading posts tagged ${displayTagName(current)}…`} />
      ) : posts.data.length === 0 ? (
        <p className="py-8 text-center text-sm opacity-60">No visible posts here - go back a step.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-neutral-900/80 px-3 py-2 backdrop-blur-sm">
            <p className="text-sm opacity-70">
              Pick a post tagged <b>{displayTagName(current)}</b> to see its tags.
            </p>
            <Button onClick={() => setShuffle(shuffle + 1)} icon={<Shuffle size={12} />} className="ml-auto">
              Other posts
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {posts.data.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openPost(p)}
                className="aspect-square overflow-hidden rounded-lg bg-black/20 ring-[rgb(var(--accent))] transition hover:ring-2"
              >
                <img src={(p.preview.url ?? p.sample.url)!} alt="" draggable={false} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A random spread of the tag's posts (order:random, not order:score - the top-scored posts of a
 *  broad tag are the same famous handful, often straight from the tag you just left). Posts
 *  carrying none of the path's earlier tags come first and posts already shown on an earlier hop
 *  last, so each hop leads somewhere new. `shuffle` re-deals. */
function useHopPosts(
  site: Site,
  tag: string,
  earlier: string[],
  seen: ReadonlySet<number>,
  shuffle: number,
  favUser: string | null,
) {
  // Favorites skip the score floor - plenty of favorites sit below it.
  const scope = favUser ? `fav:${favUser}` : "score:>=10";
  const blacklistEntries = useEffectiveBlacklist();
  const ratingFilter = useRatingFilter();
  const query = useQuery({
    queryKey: ["six-degrees-posts", site, tag, ratingFilter, shuffle, favUser],
    staleTime: Infinity,
    queryFn: () =>
      e621Api.getPosts(site, `${tag} ${scope} ${ratingFilter} order:random`.replace(/\s+/g, " ").trim(), 75),
  });
  const data = useMemo(() => {
    if (!query.data) return null;
    const usable = visiblePosts(query.data.posts, blacklistEntries, false).filter((p) => p.preview.url ?? p.sample.url);
    // Ranked, not filtered, so stepping back to an earlier tag still has posts to show.
    const rank = (p: Post) => (seen.has(p.id) ? 2 : earlier.some((t) => allTags(p).includes(t)) ? 1 : 0);
    return [...usable].sort((a, b) => rank(a) - rank(b)).slice(0, POSTS_PER_HOP);
    // `seen` is read at fetch time only - re-filtering as posts get marked seen would make the
    // grid reshuffle under the player's cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, blacklistEntries]);
  return { data, error: query.error };
}

function SelectedPost({
  site,
  post,
  current,
  target,
  onHop,
  onBack,
}: {
  site: Site;
  post: Post;
  current: string;
  target: string;
  onHop: (tag: string) => void;
  onBack: () => void;
}) {
  const tags = categorizedTags(post).filter((t) => HOP_CATEGORIES.includes(t.category) && t.name !== current);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-neutral-900/80 p-3 backdrop-blur-sm sm:flex-row">
      <div className="flex shrink-0 flex-col gap-2 sm:w-56">
        <img
          src={(post.sample.url ?? post.preview.url)!}
          alt=""
          draggable={false}
          className="max-h-72 w-full rounded-xl bg-black/20 object-contain"
        />
        <Button onClick={onBack}>Back to posts</Button>
        <ViewPostButton site={site} post={post} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-sm opacity-70">Hop to one of this post's tags:</p>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const style = TAG_CATEGORY_STYLE[t.category];
            const isTarget = t.name === target;
            return (
              <button
                key={`${t.category}:${t.name}`}
                type="button"
                onClick={() => onHop(t.name)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition hover:brightness-110 ${
                  isTarget ? "ring-2 ring-green-500 ring-offset-1 ring-offset-transparent" : ""
                }`}
                style={{ background: style.chipBg, color: style.chipFg }}
              >
                {displayTagName(t.name)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Start -> target header. In a running puzzle the two chips are buttons that open that tag's
 *  info card (`about` is whichever is open). */
function Endpoints({
  puzzle,
  about,
  onAbout,
}: {
  puzzle: SixDegreesPuzzle;
  about?: string | null;
  onAbout?: (tag: string | null) => void;
}) {
  const chip = (tag: string, cls: string) =>
    onAbout ? (
      <button
        type="button"
        title={about === tag ? "Hide info" : "What's this?"}
        onClick={() => onAbout(about === tag ? null : tag)}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition hover:brightness-110 ${cls} ${
          about === tag ? "ring-2 ring-current" : ""
        }`}
      >
        {displayTagName(tag)}
        <Info size={14} className="opacity-60" />
      </button>
    ) : (
      <span className={`rounded-full px-3 py-1 ${cls}`}>{displayTagName(tag)}</span>
    );
  return (
    <div className="flex items-center justify-center gap-3 text-base font-bold">
      {chip(puzzle.start, "bg-neutral-900/75")}
      <ArrowRight size={18} className="text-[rgb(var(--accent))]" />
      {chip(puzzle.target, "bg-green-500/15 text-green-600 dark:text-green-400")}
    </div>
  );
}

const CATEGORY_BY_ID: Record<number, TagCategory> = {
  0: "general",
  1: "artist",
  3: "copyright",
  4: "character",
  5: "species",
  7: "meta",
  8: "lore",
};

/** What a tag is: category, post count, the opening line of its wiki page, and a few of its
 *  top-scored posts. Three cached requests per tag. */
function TagInfoCard({ site, tag }: { site: Site; tag: string }) {
  const blacklistEntries = useEffectiveBlacklist();
  const ratingFilter = useRatingFilter();
  const info = useQuery({ queryKey: ["six-tag", site, tag], staleTime: Infinity, queryFn: () => e621Api.getTag(site, tag) });
  const wiki = useQuery({
    queryKey: ["six-wiki", site, tag],
    staleTime: Infinity,
    queryFn: () => e621Api.getWikiPage(site, tag),
  });
  const posts = useQuery({
    queryKey: ["six-top", site, tag, ratingFilter],
    staleTime: Infinity,
    queryFn: () => e621Api.getPosts(site, `${tag} ${ratingFilter} order:score`.replace(/\s+/g, " ").trim(), 16),
  });
  const thumbs = useMemo(
    () =>
      posts.data
        ? visiblePosts(posts.data.posts, blacklistEntries, false)
            .filter((p) => p.preview.url)
            .slice(0, 6)
        : [],
    [posts.data, blacklistEntries],
  );
  const category = info.data ? CATEGORY_BY_ID[info.data.category] : undefined;
  const style = category ? TAG_CATEGORY_STYLE[category] : undefined;
  const summary = wiki.data ? wikiSummary(wiki.data.body) : "";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-900/80 backdrop-blur-sm p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{displayTagName(tag)}</span>
        {style && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: style.chipBg, color: style.chipFg }}>
            {style.label}
          </span>
        )}
        {info.data && <span className="text-xs opacity-60">{info.data.post_count.toLocaleString()} posts</span>}
      </div>
      {wiki.isLoading ? (
        <p className="text-xs opacity-50">Loading wiki…</p>
      ) : summary ? (
        <p className="text-xs leading-relaxed opacity-80">{summary}</p>
      ) : (
        <p className="text-xs opacity-50">No wiki summary for this tag.</p>
      )}
      <div className="flex gap-1.5">
        {posts.isLoading
          ? <Spinner />
          : thumbs.map((p) => (
              <img
                key={p.id}
                src={p.preview.url!}
                alt=""
                draggable={false}
                className="h-16 w-16 rounded-lg bg-black/20 object-cover"
              />
            ))}
      </div>
    </div>
  );
}
