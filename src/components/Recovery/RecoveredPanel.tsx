import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Recycle, X } from "lucide-react";
import { e621Api } from "../../api/client";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import { useSettingsStore } from "../../state/settingsStore";
import { useRecoveredStore } from "../../state/recoveredStore";
import { parseBlacklist, visiblePosts } from "../../lib/blacklist";
import { PostGrid } from "../PostGrid/PostGrid";
import { PostViewer } from "../PostViewer/PostViewer";
import { PoolPanel } from "../Pool/PoolPanel";
import { IconButton } from "../ui/IconButton";
import { Overlay, type OverlayHandle } from "../ui/Overlay";
import { Spinner } from "../ui/Spinner";

/** Posts per `id:` lookup - one e621 request each (through the rate-limited `get_posts`). */
const ID_CHUNK = 100;

interface RecoveredPanelProps {
  site: Site;
  onClose: () => void;
  onSearch: (query: string) => void;
  onOpenProfile: (userId: number) => void;
  onOpenArtist: (tag: string) => void;
  onOpenWiki: (tag: string) => void;
}

/** Recovered ids, most recently recovered first (from the local cache - no network). */
async function recoveredIds(site: Site): Promise<number[]> {
  const list = await e621Api.listRecovered(site);
  return Object.entries(list)
    .filter(([, t]) => t.path)
    .sort(([a, ta], [b, tb]) => (tb.recovered_at ?? 0) - (ta.recovered_at ?? 0) || Number(b) - Number(a))
    .map(([id]) => Number(id));
}

/** The posts for `ids`, in that order: `id:a,b,c status:any` lookups of ID_CHUNK at a time
 *  (`status:any`, or e621 leaves the deleted ones out). */
async function postsByIds(site: Site, ids: number[]): Promise<Post[]> {
  const found = new Map<number, Post>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const res = await e621Api.getPosts(site, `id:${chunk.join(",")} status:any`, chunk.length);
    for (const p of res.posts) found.set(p.id, p);
  }
  return ids.map((id) => found.get(id)).filter((p): p is Post => !!p);
}

/** Full-screen list of every post un-deleted on this site (the recovered-file cache,
 *  src-tauri/src/recovered.rs), most recently recovered first - a normal grid + viewer, so the
 *  recovered thumbnails and the viewer's saved copies show as everywhere else. Same shape as
 *  PopularPanel. */
export function RecoveredPanel({ site, onClose, onSearch, onOpenProfile, onOpenArtist, onOpenWiki }: RecoveredPanelProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [nestedPoolId, setNestedPoolId] = useState<number | null>(null);
  const overlay = useRef<OverlayHandle>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && viewerIndex === null && nestedPoolId === null) overlay.current?.close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, nestedPoolId]);

  const ids = useQuery({ queryKey: ["recovered-ids", site], queryFn: () => recoveredIds(site), staleTime: 0 });
  const posts = useQuery({
    queryKey: ["recovered-posts", site, ids.data],
    queryFn: () => postsByIds(site, ids.data ?? []),
    enabled: !!ids.data && ids.data.length > 0,
    staleTime: 5 * 60_000,
  });

  // A post removed from the cache (viewer's Remove) drops out of the grid right away.
  const recovered = useRecoveredStore((s) => s.bySite[site]);
  const list = useMemo(
    () => (posts.data ?? []).filter((p) => !recovered || !!recovered[p.id]?.src),
    [posts.data, recovered],
  );

  const blacklist = useSettingsStore((s) => s.blacklist);
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const blacklistEntries = useMemo(() => parseBlacklist(blacklist), [blacklist]);
  const shownPosts = useMemo(
    () => visiblePosts(list, blacklistEntries, blacklistDisabled),
    [list, blacklistEntries, blacklistDisabled],
  );

  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= shownPosts.length) {
      setViewerIndex(shownPosts.length > 0 ? shownPosts.length - 1 : null);
    }
  }, [viewerIndex, shownPosts.length]);

  function addTagToBlacklist(tag: string) {
    setBlacklist(blacklist.trim() === "" ? tag : `${blacklist}\n${tag}`);
  }

  const loading = ids.isLoading || (posts.isLoading && (ids.data?.length ?? 0) > 0);
  const empty = ids.data && ids.data.length === 0;

  return (
    <Overlay ref={overlay} onClose={onClose} variant="full" closeOnEsc={false}>
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <Recycle size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">Recovered posts</h1>
        {!loading && list.length > 0 && (
          <span className="text-xs opacity-60">
            {list.length} post{list.length === 1 ? "" : "s"} · most recently recovered first
          </span>
        )}
        <IconButton onClick={() => overlay.current?.close()} title="Close (Esc)" className="ml-auto">
          <X size={18} />
        </IconButton>
      </div>

      <div className="relative flex-1 min-h-0">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
            <Spinner size={15} />
            Loading…
          </div>
        ) : ids.isError || posts.isError ? (
          <div className="flex h-full items-center justify-center text-sm text-red-500">Failed to load recovered posts.</div>
        ) : empty || list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center text-sm opacity-60">
            <p>Nothing recovered yet.</p>
            <p className="text-xs">
              Open a deleted post and use "Try to load from source", or recover several at once from
              Deleted favorites (account menu).
            </p>
          </div>
        ) : (
          <PostGrid
            site={site}
            posts={list}
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
