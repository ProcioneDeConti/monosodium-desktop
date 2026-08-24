import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/shell/AppShell";
import { PostGrid } from "./components/PostGrid/PostGrid";
import { PostViewer } from "./components/PostViewer/PostViewer";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { usePostsQuery } from "./queries/usePostsQuery";
import { loadSettings, useSettingsStore } from "./state/settingsStore";
import { loadAllAccounts, useAccountStore } from "./state/accountStore";
import { parseBlacklist, visiblePosts } from "./lib/blacklist";
import { hexToRgbTriplet } from "./lib/color";

function App() {
  const [booted, setBooted] = useState(false);
  const [activeQuery, setActiveQuery] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    Promise.all([loadSettings(), loadAllAccounts()]).finally(() => setBooted(true));
  }, []);

  const site = useSettingsStore((s) => s.site);
  const blacklist = useSettingsStore((s) => s.blacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);
  const setBlacklistDisabled = useSettingsStore((s) => s.setBlacklistDisabled);
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const ratingTagFilter = useSettingsStore((s) => s.ratingTagFilter);
  const account = useAccountStore((s) => s.accounts[site]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", hexToRgbTriplet(accentColor));
  }, [accentColor]);

  const blacklistEntries = useMemo(() => parseBlacklist(blacklist), [blacklist]);

  const effectiveTags = useMemo(() => {
    const ratingFilter = ratingTagFilter();
    return [activeQuery, ratingFilter].filter(Boolean).join(" ").trim();
  }, [activeQuery, ratingTagFilter]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, refetch } =
    usePostsQuery(site, effectiveTags, blacklistEntries, booted);

  const posts = useMemo(() => data?.pages.flatMap((p) => p.posts) ?? [], [data]);
  const shownPosts = useMemo(
    () => visiblePosts(posts, blacklistEntries, blacklistDisabled),
    [posts, blacklistEntries, blacklistDisabled],
  );

  // Closing the search bar's query invalidates whatever the viewer was showing (a fresh result
  // set), so any tag action that changes the search closes the viewer along with it.
  function runNewSearch(query: string) {
    setActiveQuery(query);
    setViewerIndex(null);
  }

  function addTagToBlacklist(tag: string) {
    setBlacklist(blacklist.trim() === "" ? tag : `${blacklist}\n${tag}`);
  }

  return (
    <AppShell
      activeQuery={activeQuery}
      onSearch={runNewSearch}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenFavorites={account?.username ? () => runNewSearch(`fav:${account.username}`) : null}
    >
      {!booted || isLoading ? (
        <div className="flex h-full items-center justify-center text-sm opacity-60">Loading…</div>
      ) : isError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
          <span className="max-w-md text-center text-red-500">
            {(error as Error)?.message ?? "Something went wrong."}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            Retry
          </button>
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
          onClose={() => setViewerIndex(null)}
          onSearchTag={runNewSearch}
          onAddTagToSearch={(tag) => runNewSearch(`${activeQuery} ${tag}`.trim())}
          onExcludeTag={(tag) => runNewSearch(`${activeQuery} -${tag}`.trim())}
          onBlacklistTag={addTagToBlacklist}
        />
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </AppShell>
  );
}

export default App;
