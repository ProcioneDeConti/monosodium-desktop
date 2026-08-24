import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/shell/AppShell";
import { PostGrid } from "./components/PostGrid/PostGrid";
import { usePostsQuery } from "./queries/usePostsQuery";
import { loadSettings, useSettingsStore } from "./state/settingsStore";
import { loadAllAccounts } from "./state/accountStore";
import { parseBlacklist } from "./lib/blacklist";
import { hexToRgbTriplet } from "./lib/color";

function App() {
  const [booted, setBooted] = useState(false);
  const [activeQuery, setActiveQuery] = useState("");

  useEffect(() => {
    Promise.all([loadSettings(), loadAllAccounts()]).finally(() => setBooted(true));
  }, []);

  const site = useSettingsStore((s) => s.site);
  const blacklist = useSettingsStore((s) => s.blacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);
  const setBlacklistDisabled = useSettingsStore((s) => s.setBlacklistDisabled);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const ratingTagFilter = useSettingsStore((s) => s.ratingTagFilter);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", hexToRgbTriplet(accentColor));
  }, [accentColor]);

  const blacklistEntries = useMemo(() => parseBlacklist(blacklist), [blacklist]);

  const effectiveTags = useMemo(() => {
    const ratingFilter = ratingTagFilter();
    return [activeQuery, ratingFilter].filter(Boolean).join(" ").trim();
  }, [activeQuery, ratingTagFilter]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = usePostsQuery(site, effectiveTags, blacklistEntries, booted);

  const posts = useMemo(() => data?.pages.flatMap((p) => p.posts) ?? [], [data]);

  return (
    <AppShell activeQuery={activeQuery} onSearch={setActiveQuery}>
      {!booted || isLoading ? (
        <div className="flex h-full items-center justify-center text-sm opacity-60">Loading…</div>
      ) : isError ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
          <span className="text-red-500">{(error as Error)?.message ?? "Something went wrong."}</span>
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
              onPostClick={(index) => {
                // Post viewer lands in the next milestone.
                console.log("open post", posts[index]?.id);
              }}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default App;
