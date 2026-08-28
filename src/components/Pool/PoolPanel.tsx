import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Site } from "../../models/site";
import { usePoolPostsQuery, usePoolQuery } from "../../queries/usePoolQuery";
import { useSettingsStore } from "../../state/settingsStore";
import { parseBlacklist, visiblePosts } from "../../lib/blacklist";
import { PostGrid } from "../PostGrid/PostGrid";
import { PostViewer } from "../PostViewer/PostViewer";
import { DText } from "../ui/DText";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface PoolPanelProps {
  site: Site;
  poolId: number;
  onClose: () => void;
  onSearch: (query: string) => void;
  onOpenProfile: (userId: number) => void;
}

/** Full-screen overlay for a pool - e621's ordered post sequences (comics, sets, etc). Neither
 *  this app nor the reference Android app has ever browsed one before: the reference app only
 *  shows a post's pool ids as plain, non-interactive text (`#123`) in its info panel - this is a
 *  deliberate improvement over it, not a port. Reuses the same PostGrid/PostViewer components
 *  the main search grid uses, just fed a fixed (non-paginated) list in the pool's own order -
 *  see usePoolQuery.ts. Opening a pool from a post that's itself in another pool stacks another
 *  PoolPanel on top via plain recursion. */
export function PoolPanel({ site, poolId, onClose, onSearch, onOpenProfile }: PoolPanelProps) {
  const { data: pool, isLoading: poolLoading, isError: poolError } = usePoolQuery(site, poolId);
  const { data: posts, isLoading: postsLoading, isError: postsError } = usePoolPostsQuery(site, pool);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [nestedPoolId, setNestedPoolId] = useState<number | null>(null);

  const blacklist = useSettingsStore((s) => s.blacklist);
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const blacklistEntries = useMemo(() => parseBlacklist(blacklist), [blacklist]);
  const shownPosts = useMemo(
    () => visiblePosts(posts ?? [], blacklistEntries, blacklistDisabled),
    [posts, blacklistEntries, blacklistDisabled],
  );

  // Blacklisting a tag the open post matches can shrink `shownPosts` past the viewer's index -
  // clamp it (or close the viewer) instead of leaving it pointing past the end. See App.tsx for
  // the same guard on the main grid.
  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= shownPosts.length) {
      setViewerIndex(shownPosts.length > 0 ? shownPosts.length - 1 : null);
    }
  }, [viewerIndex, shownPosts.length]);

  const isLoading = poolLoading || postsLoading;
  const isError = poolError || postsError;

  function addTagToBlacklist(tag: string) {
    setBlacklist(blacklist.trim() === "" ? tag : `${blacklist}\n${tag}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 items-start gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{pool?.name.replace(/_/g, " ") || "Pool"}</h1>
          {pool && (
            <p className="text-xs opacity-60">
              {pool.post_count} {pool.post_count === 1 ? "post" : "posts"}
              {pool.category === "collection" ? " · Collection" : pool.category === "series" ? " · Series" : ""}
              {!pool.is_active && " · Inactive"}
            </p>
          )}
        </div>
        <IconButton onClick={onClose} title="Close (Esc)">
          <X size={18} />
        </IconButton>
      </div>

      {pool?.description && (
        <div className="shrink-0 border-b border-black/10 dark:border-white/10 px-4 py-2 max-h-32 overflow-y-auto">
          <DText text={pool.description} site={site} className="text-xs opacity-80" />
        </div>
      )}

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
            <Spinner size={15} />
            Loading…
          </div>
        ) : isError || !posts ? (
          <div className="flex h-full items-center justify-center text-sm text-red-500">Failed to load pool.</div>
        ) : posts.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm opacity-60">This pool has no posts.</div>
        ) : (
          <PostGrid
            site={site}
            posts={posts}
            blacklistEntries={blacklistEntries}
            blacklistDisabled={blacklistDisabled}
            thumbnailSizePx={thumbnailSizePx}
            isFetchingNextPage={false}
            hasNextPage={false}
            onLoadMore={() => {}}
            onPostClick={setViewerIndex}
          />
        )}
      </div>

      {viewerIndex !== null && (
        <PostViewer
          site={site}
          posts={shownPosts}
          index={viewerIndex}
          hasNextPage={false}
          blacklistEntries={blacklistEntries}
          blacklistDisabled={blacklistDisabled}
          onIndexChange={setViewerIndex}
          onLoadMore={() => {}}
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
        />
      )}
    </div>
  );
}
