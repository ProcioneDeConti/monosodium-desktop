import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppShell } from "./components/shell/AppShell";
import { PostGrid } from "./components/PostGrid/PostGrid";
import { PostViewer } from "./components/PostViewer/PostViewer";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { ProfilePanel } from "./components/Profile/ProfilePanel";
import { SavedSearchesPanel } from "./components/SavedSearches/SavedSearchesPanel";
import { MessagesPanel } from "./components/Messages/MessagesPanel";
import { EulaScreen } from "./components/Eula/EulaScreen";
import { Button } from "./components/ui/Button";
import { Spinner } from "./components/ui/Spinner";
import { usePostsQuery } from "./queries/usePostsQuery";
import { useUserProfileQuery } from "./queries/useUserProfileQuery";
import { loadSettings, useSettingsStore } from "./state/settingsStore";
import { loadAllAccounts, useAccountStore } from "./state/accountStore";
import { loadSavedSearches } from "./state/savedSearchesStore";
import { parseBlacklist, visiblePosts } from "./lib/blacklist";
import { hexToRgbTriplet } from "./lib/color";
import { cacheTagCategory } from "./lib/tagCategoryCache";
import { CURRENT_EULA_HASH } from "./lib/eula";
import { categorizedTags } from "./models/post";

function App() {
  const [booted, setBooted] = useState(false);
  const [activeQuery, setActiveQuery] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<number | "me" | null>(null);
  const [savedSearchesOpen, setSavedSearchesOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

  useEffect(() => {
    Promise.all([loadSettings(), loadAllAccounts(), loadSavedSearches()]).finally(() => setBooted(true));
  }, []);

  const site = useSettingsStore((s) => s.site);
  const blacklist = useSettingsStore((s) => s.blacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);
  const setBlacklistDisabled = useSettingsStore((s) => s.setBlacklistDisabled);
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
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

  const posts = useMemo(() => data?.pages.flatMap((p) => p.posts) ?? [], [data]);

  // Opportunistically learns each loaded post's tag categories so SearchBar's committed-tag
  // chips can be category-colored like TagChip/the autocomplete dropdown already are, without a
  // dedicated lookup - see lib/tagCategoryCache.ts.
  useEffect(() => {
    for (const post of posts) {
      for (const { name, category } of categorizedTags(post)) cacheTagCategory(name, category);
    }
  }, [posts]);

  const shownPosts = useMemo(
    () => visiblePosts(posts, blacklistEntries, blacklistDisabled),
    [posts, blacklistEntries, blacklistDisabled],
  );

  // Closing the search bar's query invalidates whatever the viewer was showing (a fresh result
  // set), so any tag action that changes the search closes the viewer along with it.
  function runNewSearch(query: string) {
    setActiveQuery(query);
    setViewerIndex(null);
    setSlideshowActive(false);
  }

  function closeViewer() {
    setViewerIndex(null);
    setSlideshowActive(false);
  }

  function startSlideshow() {
    setViewerIndex(0);
    setSlideshowActive(true);
  }

  function addTagToBlacklist(tag: string) {
    setBlacklist(blacklist.trim() === "" ? tag : `${blacklist}\n${tag}`);
  }

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
      onSearch={runNewSearch}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenFavorites={account?.username ? () => runNewSearch(`fav:${account.username}`) : null}
      onOpenProfile={account?.username ? () => setProfileTarget("me") : null}
      onOpenMessages={account?.username ? () => setMessagesOpen(true) : null}
      unreadMessageCount={unreadMessageCount}
      onOpenSavedSearches={() => setSavedSearchesOpen(true)}
      onStartSlideshow={shownPosts.length > 0 ? startSlideshow : null}
      onRefresh={() => void refresh()}
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
            {(error as Error)?.message ?? "Something went wrong."}
          </span>
          <Button icon={<RefreshCw size={13} />} onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          {blacklistEntries.length > 0 && (
            <div className="flex items-center justify-end gap-2 px-3 py-1 text-xs opacity-70 shrink-0">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={blacklistDisabled}
                  onChange={(e) => setBlacklistDisabled(e.target.checked)}
                  className="accent-[rgb(var(--accent))]"
                />
                Show blacklisted posts
              </label>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <PostGrid
              key={`${site}:${effectiveTags}`}
              posts={posts}
              blacklistEntries={blacklistEntries}
              blacklistDisabled={blacklistDisabled}
              thumbnailSizePx={thumbnailSizePx}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={!!hasNextPage}
              onLoadMore={fetchNextPage}
              onPostClick={setViewerIndex}
            />
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
          onIndexChange={setViewerIndex}
          onLoadMore={fetchNextPage}
          onClose={closeViewer}
          onSearchTag={runNewSearch}
          onAddTagToSearch={(tag) => runNewSearch(`${activeQuery} ${tag}`.trim())}
          onExcludeTag={(tag) => runNewSearch(`${activeQuery} -${tag}`.trim())}
          onBlacklistTag={addTagToBlacklist}
          onOpenProfile={(id) => setProfileTarget(id)}
          slideshowActive={slideshowActive}
          onToggleSlideshow={() => setSlideshowActive((v) => !v)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onOpenProfile={() => setProfileTarget("me")}
        />
      )}

      {profileTarget !== null && (
        <ProfilePanel
          site={site}
          userId={profileTarget}
          onClose={() => setProfileTarget(null)}
          onSearch={runNewSearch}
        />
      )}

      {savedSearchesOpen && (
        <SavedSearchesPanel
          currentQuery={activeQuery}
          onClose={() => setSavedSearchesOpen(false)}
          onApply={runNewSearch}
        />
      )}

      {messagesOpen && (
        <MessagesPanel
          site={site}
          onClose={() => setMessagesOpen(false)}
          onOpenProfile={(id) => setProfileTarget(id)}
        />
      )}
    </AppShell>
  );
}

export default App;
