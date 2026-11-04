import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Sparkles, UserRound, Users, X } from "lucide-react";
import type { Site } from "../../models/site";
import { e621Api } from "../../api/client";
import { useSettingsStore } from "../../state/settingsStore";
import { useAccountStore } from "../../state/accountStore";
import { parseBlacklist, visiblePosts } from "../../lib/blacklist";
import { errorMessage } from "../../lib/errors";
import type { TasteMode } from "../../lib/tasteProfile";
import { resolveUser } from "../../queries/useFavoritesAnalysis";
import {
  plannedFavoritePages,
  RECENT_FAVORITES,
  useForYou,
  type ForYouTargetInput,
} from "../../queries/useForYou";
import { useAvatarUrl } from "../../queries/useAvatarUrl";
import {
  getTasteProfile,
  isProfileFresh,
  listTasteTargets,
} from "../../state/tasteProfileStore";
import { PostGrid } from "../PostGrid/PostGrid";
import { PostViewer } from "../PostViewer/PostViewer";
import { PoolPanel } from "../Pool/PoolPanel";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import { Overlay, type OverlayHandle } from "../ui/Overlay";
import { Spinner } from "../ui/Spinner";
import { RainbowBar } from "../ui/RainbowBar";
import { EmptyState } from "../ui/EmptyState";
import { MascotLayer } from "../Mascot/MascotLayer";
import { BrickWall, type WallEvent } from "./BrickWall";
import { mascotReact } from "../../state/mascotStore";
import { shuffled } from "../../lib/mascotDashboard";
import { SPICY_SHARE, spicyAllowed } from "../../lib/mascotSpicy";
import {
  forYouBuildingRemarks,
  forYouEmptyRemarks,
  forYouFacts,
  forYouMoreRemarks,
  forYouPhaseRemarks,
  forYouRemarks,
  forYouWallRemarks,
  spicyForYouBuildingRemarks,
  spicyForYouPhaseRemarks,
  spicyForYouRemarks,
  spicyForYouWallRemarks,
} from "../../lib/mascotForYou";

const MODES: { value: TasteMode; label: string }[] = [
  { value: "recent", label: `Recent ${RECENT_FAVORITES}` },
  { value: "all", label: "All favorites" },
];

/** Pause after a phase change before Gus weighs in (matches Popular/Dashboard). */
const REMARK_DELAY_MS = 1200;
/** Live wall commentary: at most one remark per this long, and only some events get one. */
const WALL_REMARK_GAP_MS = 3800;
const WALL_REMARK_CHANCE: Record<WallEvent["type"], number> = {
  first: 0.9,
  big: 0.85,
  raccoon: 1,
  avatarBump: 0.75,
  vertical: 0.35,
  count: 0.8,
  topCourse: 0.3,
};

/** Share of "Suggest more" batches Gus comments on - every one would get old fast. */
const MORE_REMARK_CHANCE = 0.35;

/** One serving order from a regular and a cheeky pool: each next line is cheeky with probability
 *  SPICY_SHARE (same balance as Gus's reactions), until one pool runs out. */
function mixPools(regular: string[], spicy: string[]): string[] {
  const r = shuffled(regular);
  const c = shuffled(spicy);
  const out: string[] = [];
  while (r.length || c.length) {
    const fromSpicy = c.length > 0 && (r.length === 0 || Math.random() < SPICY_SHARE);
    out.push((fromSpicy ? c : r).shift()!);
  }
  return out;
}

/** Above this many favourite pages, "All favorites" asks before starting. */
const CONFIRM_ALL_PAGES = 3;

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function duration(seconds: number): string {
  if (seconds < 90) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} seconds`;
  return `about ${Math.round(seconds / 60)} minutes`;
}

interface ForYouPanelProps {
  site: Site;
  /** "me" for the signed-in account, otherwise a username or numeric id. */
  initialUser: string;
  onClose: () => void;
  onSearch: (query: string) => void;
  onOpenProfile: (userId: number) => void;
  onOpenArtist: (tag: string) => void;
  onOpenWiki: (tag: string) => void;
}

/** "For you": suggestions ranked against a taste profile built from someone's favourites
 *  (queries/useForYou.ts). Same overlay/grid/viewer shell as PopularPanel; while the profile is
 *  built and candidates gathered, BrickWall stacks their top tags around their avatar. */
export function ForYouPanel({
  site,
  initialUser,
  onClose,
  onSearch,
  onOpenProfile,
  onOpenArtist,
  onOpenWiki,
}: ForYouPanelProps) {
  const myName = useAccountStore((s) => s.accounts[site]?.username ?? null);
  const [ref, setRef] = useState<string | null>(initialUser === "me" ? myName : initialUser);
  const [resolved, setResolved] = useState<ForYouTargetInput | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [mode, setMode] = useState<TasteMode>("recent");
  const [confirmAll, setConfirmAll] = useState(false);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [nestedPoolId, setNestedPoolId] = useState<number | null>(null);
  const overlay = useRef<OverlayHandle>(null);

  const { state, start, stopProfiling, more, reset } = useForYou(site);
  const { data: avatarUrl } = useAvatarUrl(site, resolved?.avatarId ?? null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && viewerIndex === null && nestedPoolId === null) {
        overlay.current?.close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, nestedPoolId]);

  /** Start (or ask first, for a big "All favorites" read). */
  const launch = useCallback(
    (target: ForYouTargetInput, m: TasteMode, rebuild = false) => {
      setViewerIndex(null);
      const cached = getTasteProfile(site, target.name, m);
      const needsBuild = rebuild || !cached || !isProfileFresh(cached);
      if (m === "all" && needsBuild && plannedFavoritePages("all", target.favoriteCount) > CONFIRM_ALL_PAGES) {
        reset();
        setConfirmAll(true);
        return;
      }
      setConfirmAll(false);
      void start(target, m, { rebuild });
    },
    [site, start, reset],
  );

  // Resolve the chosen user, then build.
  useEffect(() => {
    if (!ref) return;
    let live = true;
    setResolveError(null);
    setResolved(null);
    setConfirmAll(false);
    reset();
    resolveUser(site, ref)
      .then((u) => {
        if (!live) return;
        const target = { id: u.id, name: u.name, avatarId: u.avatarId, favoriteCount: u.favoriteCount };
        setResolved(target);
        launch(target, mode);
      })
      .catch((e) => live && setResolveError(errorMessage(e, "Couldn't find that user.")));
    return () => {
      live = false;
    };
    // `mode` changes are handled by changeMode; re-resolving on them would be a wasted request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, site]);

  function changeMode(m: TasteMode) {
    if (m === mode) return;
    setMode(m);
    if (resolved) launch(resolved, m);
  }

  // Name autocomplete for the picker (debounced; each lookup is one rate-limited request).
  useEffect(() => {
    const q = input.trim();
    if (q.length < 2 || /^\d+$/.test(q)) {
      setSuggestions([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      e621Api
        .autocompleteUsers(site, q)
        .then((us) => live && setSuggestions(us.map((u) => u.name).slice(0, 8)))
        .catch(() => {});
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [input, site]);

  function pickUser(v: string) {
    const name = v.trim();
    if (!name) return;
    setInput("");
    setRef(name);
  }

  const blacklist = useSettingsStore((s) => s.blacklist);
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const blacklistEntries = useMemo(() => parseBlacklist(blacklist), [blacklist]);
  const shownPosts = useMemo(
    () => visiblePosts(state.posts, blacklistEntries, blacklistDisabled),
    [state.posts, blacklistEntries, blacklistDisabled],
  );

  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= shownPosts.length) {
      setViewerIndex(shownPosts.length > 0 ? shownPosts.length - 1 : null);
    }
  }, [viewerIndex, shownPosts.length]);

  function addTagToBlacklist(tag: string) {
    setBlacklist(blacklist.trim() === "" ? tag : `${blacklist}\n${tag}`);
  }

  const name = resolved?.name ?? ref ?? "";
  const isSelf = !!myName && name.toLowerCase() === myName.toLowerCase();
  const whose = isSelf ? "your" : `${name}'s`;
  // Re-read on every phase change so a freshly built profile shows up in the list.
  const recents = useMemo(
    () => listTasteTargets(site).filter((t) => t.name.toLowerCase() !== name.toLowerCase()).slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [site, name, state.phase],
  );
  const busy = state.phase === "waiting" || state.phase === "profiling" || state.phase === "gathering";
  const profile = state.profile;

  const allPages = resolved ? plannedFavoritePages("all", resolved.favoriteCount) : 0;

  // --- Gus's commentary: a shuffled pool per situation (building / results / empty), served one
  // per pet with no repeats until it runs out, plus one line when each situation starts. ---
  const situation =
    busy ? "building" : state.phase === "ready" ? "ready" : state.phase === "private" || state.phase === "empty" ? state.phase : null;
  const remarks = useMemo(() => {
    const spicy = spicyAllowed(useSettingsStore.getState());
    if (situation === "building") {
      const regular = forYouBuildingRemarks(isSelf, name, mode);
      return spicy ? mixPools(regular, spicyForYouBuildingRemarks(isSelf, name, mode)) : shuffled(regular);
    }
    if (situation === "private") return shuffled(forYouEmptyRemarks("private", isSelf, name));
    if (situation === "empty") {
      return shuffled(forYouEmptyRemarks(state.profile ? "noResults" : "empty", isSelf, name));
    }
    if (situation === "ready" && profile) {
      const f = forYouFacts(profile, state.posts, isSelf, state.partial);
      return spicy ? mixPools(forYouRemarks(f), spicyForYouRemarks(f)) : shuffled(forYouRemarks(f));
    }
    return [];
    // Rebuilt per situation / profile / person - not on every "Suggest more" batch, which would
    // reshuffle him mid-conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situation, profile, name, isSelf, mode]);
  const remarkIndex = useRef(0);
  const lastRemarkAt = useRef(0);
  const say = useCallback((line: string) => {
    lastRemarkAt.current = Date.now();
    mascotReact("forYouComment", { line });
  }, []);
  const nextRemark = useCallback(() => {
    if (!remarks.length) return;
    const line = remarks[remarkIndex.current % remarks.length];
    remarkIndex.current += 1;
    say(line);
  }, [remarks, say]);

  // Live commentary while the wall goes up - throttled, and only some events get a line.
  const usedWallLines = useRef(new Set<string>());
  const onWallEvent = useCallback(
    (e: WallEvent) => {
      if (Date.now() - lastRemarkAt.current < WALL_REMARK_GAP_MS) return;
      if (Math.random() > WALL_REMARK_CHANCE[e.type]) return;
      const cheeky = spicyAllowed(useSettingsStore.getState()) && Math.random() < SPICY_SHARE;
      const pool = (cheeky ? spicyForYouWallRemarks : forYouWallRemarks)(e, isSelf, name).filter(
        (l) => !usedWallLines.current.has(l),
      );
      if (!pool.length) return;
      const line = pool[Math.floor(Math.random() * pool.length)];
      usedWallLines.current.add(line);
      say(line);
    },
    [isSelf, name, say],
  );

  // A line when the build moves on (catching breath / finished reading, now shopping).
  useEffect(() => {
    if (state.phase !== "waiting" && state.phase !== "gathering") return;
    const cheeky = spicyAllowed(useSettingsStore.getState()) && Math.random() < SPICY_SHARE;
    const pool = (cheeky ? spicyForYouPhaseRemarks : forYouPhaseRemarks)(state.phase, isSelf, name);
    const t = window.setTimeout(() => say(pool[Math.floor(Math.random() * pool.length)]), 600);
    return () => window.clearTimeout(t);
  }, [state.phase, isSelf, name, say]);
  useEffect(() => {
    remarkIndex.current = 0;
    if (!remarks.length) return;
    const t = window.setTimeout(nextRemark, REMARK_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [remarks, nextRemark]);

  // Now and then, a nod when "Suggest more" brings in a new batch.
  const wasLoadingMore = useRef(false);
  useEffect(() => {
    const finished = wasLoadingMore.current && !state.loadingMore;
    wasLoadingMore.current = state.loadingMore;
    if (finished && state.phase === "ready" && Math.random() < MORE_REMARK_CHANCE) {
      const pool = forYouMoreRemarks(isSelf, name);
      mascotReact("forYouComment", { line: pool[Math.floor(Math.random() * pool.length)] });
    }
  }, [state.loadingMore, state.phase, isSelf, name]);

  let caption: React.ReactNode = null;
  if (busy) {
    const line =
      state.phase === "waiting"
        ? "Catching a breath before reading favorites…"
        : state.phase === "profiling"
          ? `Reading ${whose} favorites${state.pagesPlanned ? ` · ${Math.min(state.pagesDone, state.pagesPlanned)}/${state.pagesPlanned}` : state.pagesDone ? ` · page ${state.pagesDone}` : ""}…`
          : `Finding suggestions · ${state.sourcesDone}/${state.sourcesPlanned}…`;
    caption = (
      <>
        <span className="font-semibold">
          Building suggestions for {isSelf ? "you" : name}
        </span>
        <span className="flex items-center gap-2 opacity-60">
          <Spinner size={14} />
          {line}
        </span>
        {state.phase === "profiling" && state.pagesDone > 0 && (
          <Button onClick={stopProfiling}>Use what's loaded</Button>
        )}
      </>
    );
  }

  return (
    <Overlay ref={overlay} onClose={onClose} variant="full" closeOnEsc={false}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <Sparkles size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">{!name || isSelf ? "For you" : `For ${name}`}</h1>

        <div className="ml-1 flex items-center gap-0.5 rounded-[var(--radius-md)] bg-black/5 dark:bg-white/10 p-0.5 text-xs">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => changeMode(m.value)}
              className={`rounded-[var(--radius-sm)] px-2 py-1 transition-colors ${
                mode === m.value ? "bg-[rgb(var(--accent))] text-white" : "opacity-70 hover:opacity-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            pickUser(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            list="for-you-users"
            placeholder="Suggest for… (username)"
            className="w-48 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-2 py-1 text-xs outline-none focus:border-[rgb(var(--accent))]"
          />
          <datalist id="for-you-users">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <IconButton onClick={() => pickUser(input)} title="Suggest for this user" disabled={!input.trim()}>
            <Users size={15} />
          </IconButton>
        </form>

        <div className="flex flex-wrap items-center gap-1 text-xs">
          {myName && !isSelf && (
            <button
              type="button"
              onClick={() => setRef(myName)}
              className="flex items-center gap-1 rounded-full bg-[rgb(var(--accent))]/15 px-2 py-0.5 hover:bg-[rgb(var(--accent))]/25"
            >
              <UserRound size={12} /> Me
            </button>
          )}
          {recents.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setRef(t.name)}
              className="rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5 opacity-80 hover:opacity-100"
              title={`Saved profile · ${ago(t.builtAt)}`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {state.phase === "ready" && profile && (
            <span className="text-xs opacity-60">
              Built from {whose} {profile.sampled}
              {profile.mode === "recent" ? " most recent" : ""} favorites
              {profile.usedVotes ? " + votes" : ""}
              {state.partial ? " (stopped early)" : ""} · {ago(profile.builtAt)}
            </span>
          )}
          {resolved && !busy && (
            <IconButton onClick={() => launch(resolved, mode, true)} title="Rebuild from the latest favorites">
              <RefreshCw size={15} />
            </IconButton>
          )}
          {state.phase === "ready" && (
            <Button
              icon={<Sparkles size={13} />}
              onClick={() => {
                setViewerIndex(null);
                void more({ replace: true });
              }}
              disabled={state.loadingMore || state.exhausted}
            >
              {state.exhausted ? "No more suggestions" : state.loadingMore ? "Finding more…" : "Suggest more"}
            </Button>
          )}
          <IconButton onClick={() => overlay.current?.close()} title="Close (Esc)">
            <X size={18} />
          </IconButton>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <MascotLayer inOverlay suppressed={viewerIndex !== null || nestedPoolId !== null} onPet={nextRemark} />
        {state.phase === "ready" && state.loadingMore && (
          <RainbowBar className="absolute inset-x-0 top-0 z-10 h-0.5" />
        )}
        {!ref ? (
          <EmptyState
            icon={<Sparkles />}
            title="Who are we suggesting for?"
            hint="Sign in to get suggestions from your own favorites, or enter any username above to build suggestions from theirs."
          />
        ) : resolveError ? (
          <EmptyState mascot="sad" title="Couldn't find that user" hint={resolveError} />
        ) : confirmAll && resolved ? (
          <EmptyState
            icon={<Sparkles />}
            title={`Read all of ${whose} ${resolved.favoriteCount?.toLocaleString() ?? ""} favorites?`}
            hint={`That's ${allPages} requests, ${duration(allPages * 1.1)} at e621's rate limit. The profile is saved, so this only happens once a week.`}
            action={
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setConfirmAll(false);
                    void start(resolved, "all", { rebuild: true });
                  }}
                >
                  Read them all
                </Button>
                <Button onClick={() => changeMode("recent")}>Just the recent {RECENT_FAVORITES}</Button>
              </div>
            }
          />
        ) : state.phase === "private" ? (
          <EmptyState mascot="sad" title={`${isSelf ? "Your" : `${name}'s`} favorites are private`} hint="There's nothing to build suggestions from." />
        ) : state.phase === "empty" ? (
          <EmptyState
            mascot="sad"
            title={state.profile ? "No suggestions turned up" : `${isSelf ? "You have" : `${name} has`} no favorites yet`}
            hint={state.profile ? "Try All favorites, or rebuild later once there's more to go on." : "Favorite a few posts and come back."}
          />
        ) : state.phase === "error" ? (
          <EmptyState
            mascot="sad"
            title="Couldn't build suggestions"
            hint={state.error}
            action={
              resolved && (
                <Button icon={<RefreshCw size={13} />} onClick={() => launch(resolved, mode)}>
                  Retry
                </Button>
              )
            }
          />
        ) : state.phase === "ready" ? (
          <PostGrid
            key={`${site}:${name}:${mode}:${profile?.builtAt ?? 0}:${state.batch}`}
            site={site}
            posts={state.posts}
            blacklistEntries={blacklistEntries}
            blacklistDisabled={blacklistDisabled}
            thumbnailSizePx={thumbnailSizePx}
            isFetchingNextPage={state.loadingMore}
            hasNextPage={!state.exhausted}
            onLoadMore={() => void more()}
            onPostClick={setViewerIndex}
          />
        ) : busy && state.target ? (
          <BrickWall
            key={`${site}:${state.target.name}:${mode}`}
            words={state.words}
            avatarUrl={avatarUrl ?? null}
            name={state.target.name}
            caption={caption}
            onEvent={onWallEvent}
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
            <Spinner size={15} />
            Looking up {name}…
          </div>
        )}
      </div>

      {viewerIndex !== null && (
        <PostViewer
          site={site}
          posts={shownPosts}
          index={viewerIndex}
          hasNextPage={!state.exhausted}
          blacklistEntries={blacklistEntries}
          blacklistDisabled={blacklistDisabled}
          onIndexChange={setViewerIndex}
          onLoadMore={() => void more()}
          onClose={() => setViewerIndex(null)}
          onSearchTag={(tag) => {
            onClose();
            onSearch(tag);
          }}
          onAddTagToSearch={(tag) => {
            onClose();
            onSearch(tag);
          }}
          onExcludeTag={(tag) => {
            onClose();
            onSearch(`-${tag}`);
          }}
          onBlacklistTag={addTagToBlacklist}
          onOpenProfile={onOpenProfile}
          onOpenArtist={onOpenArtist}
          onOpenWiki={onOpenWiki}
          onOpenPool={setNestedPoolId}
          slideshowActive={false}
          onToggleSlideshow={() => {}}
        />
      )}

      {nestedPoolId !== null && (
        <PoolPanel
          site={site}
          poolId={nestedPoolId}
          onClose={() => setNestedPoolId(null)}
          onSearch={onSearch}
          onOpenProfile={onOpenProfile}
          onOpenArtist={onOpenArtist}
          onOpenWiki={onOpenWiki}
        />
      )}
    </Overlay>
  );
}
