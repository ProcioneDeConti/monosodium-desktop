import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { AppShell } from "./components/shell/AppShell";
import { TabBar, type SearchTab } from "./components/shell/TabBar";
import { PostGrid } from "./components/PostGrid/PostGrid";
import { SelectionBar } from "./components/PostGrid/SelectionBar";
import { SetPickerDialog } from "./components/Sets/SetPickerDialog";
import { PostViewer } from "./components/PostViewer/PostViewer";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { ProfilePanel } from "./components/Profile/ProfilePanel";
import { SavedSearchesPanel } from "./components/SavedSearches/SavedSearchesPanel";
import { MessagesPanel } from "./components/Messages/MessagesPanel";
import { ForumPanel } from "./components/Forum/ForumPanel";
import { PoolPanel } from "./components/Pool/PoolPanel";
import { PopularPanel } from "./components/Popular/PopularPanel";
import { ArtistPanel } from "./components/Artist/ArtistPanel";
import { SetsPanel } from "./components/Sets/SetsPanel";
import { DownloadsPanel } from "./components/Downloads/DownloadsPanel";
import { KeyboardCheatsheet } from "./components/KeyboardCheatsheet";
import { HelpPanel } from "./components/Help/HelpPanel";
import { SearchBuilder } from "./components/Search/SearchBuilder";
import { ReverseSearchPanel } from "./components/ReverseSearch/ReverseSearchPanel";
import { EulaScreen } from "./components/Eula/EulaScreen";
import { UnlockScreen } from "./components/Vault/UnlockScreen";
import { Button } from "./components/ui/Button";
import { Spinner } from "./components/ui/Spinner";
import { usePostsQuery } from "./queries/usePostsQuery";
import { usePostMutations } from "./queries/usePostMutations";
import { useUserProfileQuery } from "./queries/useUserProfileQuery";
import { e621Api } from "./api/client";
import { loadSettings, useSettingsStore } from "./state/settingsStore";
import { loadAllAccounts, useAccountStore } from "./state/accountStore";
import { loadSavedSearches } from "./state/savedSearchesStore";
import { loadSearchHistory, useSearchHistoryStore } from "./state/searchHistoryStore";
import { useSaucenaoStore } from "./state/saucenaoStore";
import { parseBlacklist, visiblePosts } from "./lib/blacklist";
import { normalizeQuery, withRandomOrder } from "./lib/searchQuery";
import { useDownloadsStore } from "./state/downloadsStore";
import { useFullscreen } from "./lib/useFullscreen";
import { hexToRgbTriplet } from "./lib/color";
import { cacheTagCategory } from "./lib/tagCategoryCache";
import { CURRENT_EULA_HASH } from "./lib/eula";
import { notify } from "./lib/notifications";
import { errorMessage } from "./lib/errors";
import { categorizedTags, type Post } from "./models/post";

// The app has no router - every "screen" is a full-screen overlay (viewer, profile, pool,
// messages, forum, settings, saved searches) toggled by a field here, layered over the search
// grid. `NavState` is a snapshot of that whole top-level view; App keeps a stack of them so a
// single Back control can step back through everything, browser-style - including restoring the
// previous search when a tag action or a profile shortcut swapped it out.
interface NavState {
  activeQuery: string;
  viewerIndex: number | null;
  slideshowActive: boolean;
  settingsOpen: boolean;
  profileTarget: number | "me" | null;
  savedSearchesOpen: boolean;
  messagesOpen: boolean;
  forumOpen: boolean;
  poolTarget: number | null;
  popularOpen: boolean;
  artistTarget: string | null;
  setsOpen: boolean;
  downloadsOpen: boolean;
}

const INITIAL_NAV: NavState = {
  activeQuery: "",
  viewerIndex: null,
  slideshowActive: false,
  settingsOpen: false,
  profileTarget: null,
  savedSearchesOpen: false,
  messagesOpen: false,
  forumOpen: false,
  poolTarget: null,
  popularOpen: false,
  artistTarget: null,
  setsOpen: false,
  downloadsOpen: false,
};

const MAX_NAV_HISTORY = 50;

function App() {
  const [booted, setBooted] = useState(false);
  // null = still checking; true = password protection is on and not yet unlocked this session
  // (see src-tauri/src/vault.rs) - the boot effect below waits for this to become false before
  // touching settingsStore/savedSearchesStore, since their encrypted files aren't readable yet.
  const [vaultLocked, setVaultLocked] = useState<boolean | null>(null);
  const [nav, setNav] = useState<NavState>(INITIAL_NAV);
  const [navHistory, setNavHistory] = useState<NavState[]>([]);
  const [droppedImagePath, setDroppedImagePath] = useState<string | null>(null);
  const saucenaoApiKey = useSaucenaoStore((s) => s.apiKey);

  // Refs mirror the latest nav/history so the navigate/goBack callbacks stay identity-stable
  // (the same "ref as render memory" pattern PostGrid uses) instead of taking `nav` as a dep.
  const navRef = useRef(nav);
  navRef.current = nav;
  const navHistoryRef = useRef(navHistory);
  navHistoryRef.current = navHistory;

  // Move to a new screen, pushing the current one onto the back stack.
  const navigate = useCallback((patch: Partial<NavState>) => {
    setNavHistory((h) => [...h, navRef.current].slice(-MAX_NAV_HISTORY));
    setNav({ ...navRef.current, ...patch });
  }, []);

  // Change the current screen in place, without a back-stack entry - e.g. paging the viewer with
  // the arrow keys shouldn't cost one Back press per post.
  const replaceNav = useCallback((patch: Partial<NavState>) => {
    setNav({ ...navRef.current, ...patch });
  }, []);

  const canGoBack = navHistory.length > 0;
  const goBack = useCallback(() => {
    const h = navHistoryRef.current;
    if (h.length === 0) {
      // Shouldn't happen (every overlay opens via `navigate`), but never leave an overlay with
      // no way out: fall back to a bare grid on the current search.
      setNav((n) => ({ ...INITIAL_NAV, activeQuery: n.activeQuery }));
      return;
    }
    setNav(h[h.length - 1]);
    setNavHistory(h.slice(0, -1));
  }, []);

  const {
    activeQuery,
    viewerIndex,
    slideshowActive,
    settingsOpen,
    profileTarget,
    savedSearchesOpen,
    messagesOpen,
    forumOpen,
    poolTarget,
    popularOpen,
    artistTarget,
    setsOpen,
    downloadsOpen,
  } = nav;

  useEffect(() => {
    void e621Api.getVaultStatus().then((status) => setVaultLocked(status.locked));
  }, []);

  // F11 toggles OS fullscreen from anywhere (most useful for the viewer/slideshow).
  const { toggle: toggleFullscreen } = useFullscreen();
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "F11") {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (e.key === "?") {
        const t = e.target;
        const editing =
          t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          (t instanceof HTMLElement && t.isContentEditable);
        if (!editing) {
          e.preventDefault();
          setCheatsheetOpen((v) => !v);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  // Global "back" affordances beyond the header button (which the full-screen overlays cover):
  // Alt+Left, the mouse's dedicated back button, and Backspace when not typing into a field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const editing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if ((e.altKey && e.key === "ArrowLeft") || (e.key === "Backspace" && !editing)) {
        e.preventDefault();
        goBack();
      }
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [goBack]);

  useEffect(() => {
    if (vaultLocked !== false) return;
    Promise.all([
      loadSettings(),
      loadAllAccounts(),
      loadSavedSearches(),
      loadSearchHistory(),
      useSaucenaoStore.getState().load(),
    ]).finally(() => setBooted(true));
  }, [vaultLocked]);

  // Drag-and-drop reverse image search - Tauri's native drag-drop event hands over local file
  // system paths directly (unlike the browser's own HTML5 File API), so this never needs to read
  // file bytes in JS at all; src-tauri/src/saucenao.rs reads the file itself from that path.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const path = event.payload.paths.find((p) => /\.(jpe?g|png|gif|webp|bmp)$/i.test(p));
      if (path) setDroppedImagePath(path);
    });
    return () => void unlisten.then((f) => f());
  }, []);

  const site = useSettingsStore((s) => s.site);
  const blacklist = useSettingsStore((s) => s.blacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);
  const setBlacklistDisabled = useSettingsStore((s) => s.setBlacklistDisabled);
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const downloadDir = useSettingsStore((s) => s.downloadDir);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const ratingTagFilter = useSettingsStore((s) => s.ratingTagFilter);
  const adultModeEnabled = useSettingsStore((s) => s.adultModeEnabled);
  const enabledRatings = useSettingsStore((s) => s.enabledRatings);
  const account = useAccountStore((s) => s.accounts[site]);
  const eulaAcceptedHash = useSettingsStore((s) => s.eulaAcceptedHash);
  const setEulaAccepted = useSettingsStore((s) => s.setEulaAccepted);

  // Backs AppShell's Messages badge - shares its cache/query key with ProfilePanel's own-profile
  // fetch, just with polling turned on here so the badge stays current without opening Settings.
  const { data: ownProfile } = useUserProfileQuery(site, "me", !!account?.username, 60_000);
  const unreadMessageCount = ownProfile?.unread_dmail_count ?? 0;
  const forumUnread = ownProfile?.forum_notification_dot ?? false;

  // Native notifications for new dmail/forum activity while the window is unfocused (e.g.
  // minimized to the tray) - see lib/notifications.ts.
  const prevUnreadMessageCount = useRef(unreadMessageCount);
  const prevForumUnread = useRef(forumUnread);
  useEffect(() => {
    if (unreadMessageCount > prevUnreadMessageCount.current) {
      void notify(
        "New message",
        unreadMessageCount === 1 ? "You have a new message." : `You have ${unreadMessageCount} unread messages.`,
      );
    }
    prevUnreadMessageCount.current = unreadMessageCount;
  }, [unreadMessageCount]);
  useEffect(() => {
    if (forumUnread && !prevForumUnread.current) {
      void notify("Forum activity", "There's new activity on a forum topic you've posted in.");
    }
    prevForumUnread.current = forumUnread;
  }, [forumUnread]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", hexToRgbTriplet(accentColor));
  }, [accentColor]);

  const blacklistEntries = useMemo(() => parseBlacklist(blacklist), [blacklist]);

  // `ratingTagFilter` itself is a stable function reference (defined once in the settings store)
  // that reads live state via `get()` when called - it never changes identity, so it can't be the
  // thing this memo invalidates on. `adultModeEnabled`/`enabledRatings` are the actual reactive
  // inputs that determine its output and have to be listed explicitly, or toggling a rating in
  // Settings silently keeps querying under the old filter until `activeQuery` happens to change
  // for an unrelated reason (e.g. a new search).
  const effectiveTags = useMemo(() => {
    const ratingFilter = ratingTagFilter();
    return [activeQuery, ratingFilter].filter(Boolean).join(" ").trim();
  }, [activeQuery, ratingTagFilter, adultModeEnabled, enabledRatings]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refresh,
    isRefetching,
  } = usePostsQuery(site, effectiveTags, blacklistEntries, booted);

  // Flatten pages, de-duping by id. Numbered pagination for `order:random` (and any transient
  // overlap at a page boundary) can hand back a post that's already on screen; masonic keys
  // cells by `post.id`, so a duplicate would collide. Dropping repeats here keeps the grid and
  // the viewer's index mapping clean.
  const posts = useMemo(() => {
    const seen = new Set<number>();
    const out: Post[] = [];
    for (const page of data?.pages ?? []) {
      for (const p of page.posts) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        }
      }
    }
    return out;
  }, [data]);

  // Opportunistically learns each loaded post's tag categories so SearchBar's committed-tag
  // chips can be category-colored like TagChip/the autocomplete dropdown already are, without a
  // dedicated lookup - see lib/tagCategoryCache.ts. Only walks posts appended since the last run
  // (the array only ever grows via pagination, or shrinks wholesale on refresh) rather than
  // re-scanning the entire accumulated list on every page.
  const cachedTagPostCount = useRef(0);
  useEffect(() => {
    if (posts.length < cachedTagPostCount.current) cachedTagPostCount.current = 0;
    for (let i = cachedTagPostCount.current; i < posts.length; i++) {
      for (const { name, category } of categorizedTags(posts[i])) cacheTagCategory(name, category);
    }
    cachedTagPostCount.current = posts.length;
  }, [posts]);

  const shownPosts = useMemo(
    () => visiblePosts(posts, blacklistEntries, blacklistDisabled),
    [posts, blacklistEntries, blacklistDisabled],
  );

  // --- Grid multi-select ---
  const [selectionActive, setSelectionActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [setPickerOpen, setSetPickerOpen] = useState(false);
  const [bulkFav, setBulkFav] = useState<{ done: number; total: number } | null>(null);
  const lastSelIndexRef = useRef<number | null>(null);
  const shownPostsRef = useRef(shownPosts);
  shownPostsRef.current = shownPosts;
  const { favorite: favoriteMutation } = usePostMutations(site);
  const enqueueDownloads = useDownloadsStore((s) => s.enqueue);
  const downloadsPending = useDownloadsStore(
    (s) => s.jobs.filter((j) => j.status === "queued" || j.status === "active").length,
  );

  const handleSelectToggle = useCallback((post: Post, opts: { range: boolean }) => {
    setSelectionActive(true);
    const list = shownPostsRef.current;
    const idx = list.findIndex((p) => p.id === post.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (opts.range && lastSelIndexRef.current !== null && idx >= 0) {
        const a = Math.min(lastSelIndexRef.current, idx);
        const b = Math.max(lastSelIndexRef.current, idx);
        for (let i = a; i <= b; i++) next.add(list[i].id);
      } else if (next.has(post.id)) {
        next.delete(post.id);
      } else {
        next.add(post.id);
      }
      return next;
    });
    if (!opts.range) lastSelIndexRef.current = idx;
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionActive(false);
    setSelectedIds(new Set());
    lastSelIndexRef.current = null;
    setBulkFav(null);
    setSetPickerOpen(false);
  }, []);

  // --- Search tabs ---
  // Lightweight layer over the single-search model: each tab remembers a query, switching one
  // just points the (one) grid at it. `nav.activeQuery` stays the single source of truth for the
  // search - a sync effect writes it back into whichever tab is active, so tag actions / Back /
  // shuffle all keep the active tab's stored query current. Tabs are session-only and are NOT in
  // the nav back-stack (Ctrl+W isn't undone by Back in a browser either).
  const [tabs, setTabs] = useState<SearchTab[]>(() => [{ id: "tab-0", query: "" }]);
  const [activeTabId, setActiveTabId] = useState("tab-0");
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  useEffect(() => {
    setTabs((ts) => {
      const t = ts.find((x) => x.id === activeTabId);
      if (!t || t.query === activeQuery) return ts;
      return ts.map((x) => (x.id === activeTabId ? { ...x, query: activeQuery } : x));
    });
  }, [activeQuery, activeTabId]);

  const switchViewToQuery = useCallback(
    (query: string) => {
      // Per-tab nav history isn't modelled - switching tabs resets the back stack (Back within a
      // tab works until you switch away), which keeps the sync effect from writing a restored
      // *other*-tab query back into this tab.
      setNavHistory([]);
      replaceNav({ ...INITIAL_NAV, activeQuery: query });
      exitSelection();
    },
    [replaceNav, exitSelection],
  );

  const newTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    setTabs((ts) => [...ts, { id, query: "" }]);
    setActiveTabId(id);
    switchViewToQuery("");
  }, [switchViewToQuery]);

  const selectTab = useCallback(
    (id: string) => {
      if (id === activeTabIdRef.current) return;
      const t = tabsRef.current.find((x) => x.id === id);
      if (!t) return;
      setActiveTabId(id);
      switchViewToQuery(t.query);
    },
    [switchViewToQuery],
  );

  const closeTab = useCallback(
    (id: string) => {
      const cur = tabsRef.current;
      if (cur.length <= 1) return;
      const idx = cur.findIndex((x) => x.id === id);
      const next = cur.filter((x) => x.id !== id);
      setTabs(next);
      if (id === activeTabIdRef.current) {
        const neighbor = next[Math.min(idx, next.length - 1)];
        setActiveTabId(neighbor.id);
        switchViewToQuery(neighbor.query);
      }
    },
    [switchViewToQuery],
  );

  // Ctrl+T new tab, Ctrl+W close, Ctrl+Tab / Ctrl+Shift+Tab cycle, Ctrl+1..9 jump.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "t") {
        e.preventDefault();
        newTab();
      } else if (e.key === "w") {
        e.preventDefault();
        closeTab(activeTabIdRef.current);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const list = tabsRef.current;
        const i = list.findIndex((x) => x.id === activeTabIdRef.current);
        const nextI = (i + (e.shiftKey ? -1 : 1) + list.length) % list.length;
        selectTab(list[nextI].id);
      } else if (/^[1-9]$/.test(e.key)) {
        const target = tabsRef.current[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          selectTab(target.id);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newTab, closeTab, selectTab]);

  const selectedPosts = useMemo(
    () => shownPosts.filter((p) => selectedIds.has(p.id)),
    [shownPosts, selectedIds],
  );

  async function bulkFavorite() {
    const targets = selectedPosts.filter((p) => !p.is_favorited);
    if (targets.length === 0 || bulkFav) return;
    setBulkFav({ done: 0, total: targets.length });
    for (const p of targets) {
      try {
        await favoriteMutation.mutateAsync(p.id);
      } catch {
        /* skip a single failure - a bulk op shouldn't abort on one */
      }
      setBulkFav((s) => (s ? { ...s, done: s.done + 1 } : s));
    }
    setBulkFav(null);
  }

  // Blacklisting a tag the open post matches can shrink `shownPosts` out from under the viewer's
  // index. Clamp to the last still-visible post (or close the viewer when nothing's left) instead
  // of leaving `index` past the end - which rendered `shownPosts[index]` as undefined and blanked
  // the whole app. In place, so it doesn't add a bogus back-stack entry.
  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= shownPosts.length) {
      replaceNav({
        viewerIndex: shownPosts.length > 0 ? shownPosts.length - 1 : null,
        slideshowActive: shownPosts.length > 0 && slideshowActive,
      });
    }
  }, [viewerIndex, shownPosts.length, slideshowActive, replaceNav]);

  const anyOverlayOpen =
    viewerIndex !== null ||
    settingsOpen ||
    profileTarget !== null ||
    savedSearchesOpen ||
    messagesOpen ||
    forumOpen ||
    poolTarget !== null ||
    popularOpen ||
    artistTarget !== null ||
    setsOpen ||
    downloadsOpen;

  // Escape leaves selection mode when it's the frontmost thing (no overlay, no set picker).
  useEffect(() => {
    if (!selectionActive) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !anyOverlayOpen && !setPickerOpen) exitSelection();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectionActive, anyOverlayOpen, setPickerOpen, exitSelection]);

  // A new search is a fresh grid screen: it supersedes any open overlay/viewer, and becomes a
  // back-stack entry so a tag action or profile shortcut that triggers one can be undone.
  // Re-running the search that's *already* showing (nothing else open) just refetches instead -
  // so the Shuffle button, or re-submitting `order:random`, actually re-rolls the results (e621
  // re-randomises per request) rather than no-op'ing on an unchanged query key.
  function runNewSearch(query: string) {
    exitSelection();
    useSearchHistoryStore.getState().record(query);
    if (!anyOverlayOpen && normalizeQuery(query) === normalizeQuery(activeQuery)) {
      void refresh();
      return;
    }
    navigate({
      activeQuery: query,
      viewerIndex: null,
      slideshowActive: false,
      settingsOpen: false,
      profileTarget: null,
      savedSearchesOpen: false,
      messagesOpen: false,
      forumOpen: false,
      poolTarget: null,
      popularOpen: false,
      artistTarget: null,
      setsOpen: false,
      downloadsOpen: false,
    });
  }

  function startSlideshow() {
    navigate({ viewerIndex: 0, slideshowActive: true });
  }

  // Stable so PostGrid's memoised cells don't all re-render whenever App re-renders for an
  // unrelated reason (a poll result, a settings tweak).
  const openViewerAt = useCallback((i: number) => navigate({ viewerIndex: i }), [navigate]);

  function addTagToBlacklist(tag: string) {
    setBlacklist(blacklist.trim() === "" ? tag : `${blacklist}\n${tag}`);
  }

  // Password-protection gate (Settings > Encryption, src-tauri/src/vault.rs) - even earlier than
  // the EULA gate below, since settingsStore/savedSearchesStore can't be read at all until this
  // resolves. `null` (still checking vault_status) renders nothing rather than flashing the rest
  // of the app for a frame; that check is fast enough not to need its own spinner.
  if (vaultLocked === null) return null;
  if (vaultLocked) return <UnlockScreen onUnlocked={() => setVaultLocked(false)} />;

  // First-launch (and re-launch-after-a-EULA-text-change) gate - replaces the entire app, not
  // just its content area, matching the reference app's own EulaScreen/MainActivity wiring.
  // Waits for `booted` so a not-yet-hydrated store's default `null` hash doesn't flash the EULA
  // for a frame even for an already-agreed user.
  if (booted && eulaAcceptedHash !== CURRENT_EULA_HASH) {
    return <EulaScreen onAgree={() => setEulaAccepted(CURRENT_EULA_HASH)} />;
  }

  return (
    <AppShell
      activeQuery={activeQuery}
      canGoBack={canGoBack}
      onBack={goBack}
      onSearch={runNewSearch}
      onOpenSearchBuilder={() => setBuilderOpen(true)}
      onOpenSettings={() => navigate({ settingsOpen: true })}
      onOpenCheatsheet={() => setCheatsheetOpen(true)}
      onOpenHelp={() => setHelpOpen(true)}
      onOpenFavorites={account?.username ? () => runNewSearch(`fav:${account.username}`) : null}
      onOpenProfile={account?.username ? () => navigate({ profileTarget: "me" }) : null}
      onOpenMessages={account?.username ? () => navigate({ messagesOpen: true }) : null}
      onOpenSets={account?.username ? () => navigate({ setsOpen: true }) : null}
      unreadMessageCount={unreadMessageCount}
      onOpenForum={() => navigate({ forumOpen: true })}
      forumUnread={forumUnread}
      onOpenPopular={() => navigate({ popularOpen: true })}
      onOpenSavedSearches={() => navigate({ savedSearchesOpen: true })}
      onStartSlideshow={shownPosts.length > 0 ? startSlideshow : null}
      onRefresh={() => void refresh()}
      onShuffle={() => runNewSearch(withRandomOrder(activeQuery))}
      onToggleSelection={() => (selectionActive ? exitSelection() : setSelectionActive(true))}
      selectionActive={selectionActive}
      onOpenDownloads={() => navigate({ downloadsOpen: true })}
      downloadsPending={downloadsPending}
      onNewTab={newTab}
      blacklistActive={blacklistEntries.length > 0}
      blacklistDisabled={blacklistDisabled}
      onToggleBlacklistDisabled={setBlacklistDisabled}
      accountAvatarId={ownProfile?.avatar_id ?? null}
      tabBar={
        tabs.length >= 2 ? (
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={selectTab}
            onClose={closeTab}
            onNew={newTab}
          />
        ) : null
      }
      isRefreshing={isRefetching}
      isLoadingPosts={isLoading || isFetchingNextPage || isRefetching}
    >
      {!booted || isLoading ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
          <Spinner size={15} />
          Loading…
        </div>
      ) : isError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
          <span className="max-w-md text-center text-red-500">
            {errorMessage(error)}
          </span>
          <Button icon={<RefreshCw size={13} />} onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          {/* "Show blacklisted posts" moved into the View menu (AppShell). A caution stripe still
              marks any shown-but-blacklisted post so the state stays visible. */}
          <div className="relative flex-1 min-h-0">
            <PostGrid
              key={`${site}:${effectiveTags}`}
              site={site}
              posts={posts}
              blacklistEntries={blacklistEntries}
              blacklistDisabled={blacklistDisabled}
              thumbnailSizePx={thumbnailSizePx}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={!!hasNextPage}
              onLoadMore={fetchNextPage}
              onPostClick={openViewerAt}
              selectionActive={selectionActive}
              selectedIds={selectedIds}
              onSelectToggle={handleSelectToggle}
            />
            {selectionActive && (
              <SelectionBar
                count={selectedIds.size}
                total={shownPosts.length}
                canInteract={!!account?.username}
                favoriteProgress={bulkFav}
                onSelectAll={() => setSelectedIds(new Set(shownPosts.map((p) => p.id)))}
                onClear={() => {
                  setSelectedIds(new Set());
                  lastSelIndexRef.current = null;
                }}
                onFavorite={() => void bulkFavorite()}
                onAddToSet={() => setSetPickerOpen(true)}
                onDownload={() => {
                  enqueueDownloads(selectedPosts, downloadDir);
                  navigate({ downloadsOpen: true });
                }}
                onExit={exitSelection}
              />
            )}
          </div>
        </div>
      )}

      {viewerIndex !== null && (
        <PostViewer
          site={site}
          posts={shownPosts}
          index={viewerIndex}
          hasNextPage={!!hasNextPage}
          blacklistEntries={blacklistEntries}
          blacklistDisabled={blacklistDisabled}
          onIndexChange={(i) => replaceNav({ viewerIndex: i })}
          onLoadMore={fetchNextPage}
          onClose={goBack}
          onSearchTag={runNewSearch}
          onAddTagToSearch={(tag) => runNewSearch(`${activeQuery} ${tag}`.trim())}
          onExcludeTag={(tag) => runNewSearch(`${activeQuery} -${tag}`.trim())}
          onBlacklistTag={addTagToBlacklist}
          onOpenProfile={(id) => navigate({ profileTarget: id })}
          onOpenPool={(id) => navigate({ poolTarget: id })}
          onOpenArtist={(tag) => navigate({ artistTarget: tag })}
          slideshowActive={slideshowActive}
          onToggleSlideshow={() => replaceNav({ slideshowActive: !slideshowActive })}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          onClose={goBack}
          onOpenProfile={() => navigate({ profileTarget: "me" })}
        />
      )}

      {profileTarget !== null && (
        <ProfilePanel
          site={site}
          userId={profileTarget}
          onClose={goBack}
          onSearch={runNewSearch}
        />
      )}

      {savedSearchesOpen && (
        <SavedSearchesPanel
          currentQuery={activeQuery}
          onClose={goBack}
          onApply={runNewSearch}
        />
      )}

      {messagesOpen && (
        <MessagesPanel
          site={site}
          onClose={goBack}
          onOpenProfile={(id) => navigate({ profileTarget: id })}
        />
      )}

      {forumOpen && (
        <ForumPanel
          site={site}
          onClose={goBack}
          onOpenSettings={() => navigate({ forumOpen: false, settingsOpen: true })}
          onOpenProfile={(id) => navigate({ profileTarget: id })}
        />
      )}

      {poolTarget !== null && (
        <PoolPanel
          site={site}
          poolId={poolTarget}
          onClose={goBack}
          onSearch={runNewSearch}
          onOpenProfile={(id) => navigate({ profileTarget: id })}
          onOpenArtist={(tag) => navigate({ artistTarget: tag })}
        />
      )}

      {popularOpen && (
        <PopularPanel
          site={site}
          onClose={goBack}
          onSearch={runNewSearch}
          onOpenProfile={(id) => navigate({ profileTarget: id })}
          onOpenArtist={(tag) => navigate({ artistTarget: tag })}
        />
      )}

      {artistTarget !== null && (
        <ArtistPanel
          site={site}
          name={artistTarget}
          onClose={goBack}
          onSearch={runNewSearch}
          onOpenProfile={(id) => navigate({ profileTarget: id })}
        />
      )}

      {setsOpen && (
        <SetsPanel
          site={site}
          onClose={goBack}
          onSearch={runNewSearch}
          onOpenProfile={(id) => navigate({ profileTarget: id })}
          onOpenArtist={(tag) => navigate({ artistTarget: tag })}
        />
      )}

      {setPickerOpen && selectedPosts.length > 0 && account?.username && (
        <SetPickerDialog
          site={site}
          postIds={selectedPosts.map((p) => p.id)}
          onClose={() => setSetPickerOpen(false)}
        />
      )}

      {downloadsOpen && <DownloadsPanel onClose={goBack} />}

      {cheatsheetOpen && <KeyboardCheatsheet onClose={() => setCheatsheetOpen(false)} />}

      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}

      {builderOpen && (
        <SearchBuilder
          initialQuery={activeQuery}
          onClose={() => setBuilderOpen(false)}
          onApply={(q) => {
            setBuilderOpen(false);
            runNewSearch(q);
          }}
        />
      )}

      {droppedImagePath && (
        <ReverseSearchPanel
          filePath={droppedImagePath}
          apiKey={saucenaoApiKey}
          onClose={() => setDroppedImagePath(null)}
          onOpenSettings={() => {
            setDroppedImagePath(null);
            navigate({ settingsOpen: true });
          }}
        />
      )}
    </AppShell>
  );
}

export default App;
