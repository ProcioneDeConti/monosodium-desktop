import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, X } from "lucide-react";
import type { Site } from "../../models/site";
import { usePopularPostsQuery } from "../../queries/usePopularQuery";
import { useSettingsStore } from "../../state/settingsStore";
import { parseBlacklist, visiblePosts } from "../../lib/blacklist";
import {
  POPULAR_SCALES,
  formatPeriod,
  isCurrentOrFuturePeriod,
  shiftPeriod,
  today,
  type PopularScale,
} from "../../lib/popular";
import { PostGrid } from "../PostGrid/PostGrid";
import { PostViewer } from "../PostViewer/PostViewer";
import { PoolPanel } from "../Pool/PoolPanel";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface PopularPanelProps {
  site: Site;
  onClose: () => void;
  onSearch: (query: string) => void;
  onOpenProfile: (userId: number) => void;
}

/** Full-screen overlay for e621's day/week/month "popular" ranking (its own
 *  /explore/posts/popular page) - no reference-app equivalent. Reuses PostGrid/PostViewer fed a
 *  fixed, server-ranked list (same as PoolPanel), with period + scale steppers in the header. */
export function PopularPanel({ site, onClose, onSearch, onOpenProfile }: PopularPanelProps) {
  const [scale, setScale] = useState<PopularScale>("day");
  const [date, setDate] = useState<string>(today());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [nestedPoolId, setNestedPoolId] = useState<number | null>(null);

  const { data: posts, isLoading, isError } = usePopularPostsQuery(site, date, scale, true);

  const blacklist = useSettingsStore((s) => s.blacklist);
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const blacklistEntries = useMemo(() => parseBlacklist(blacklist), [blacklist]);
  const shownPosts = useMemo(
    () => visiblePosts(posts ?? [], blacklistEntries, blacklistDisabled),
    [posts, blacklistEntries, blacklistDisabled],
  );

  // Stepping to another period while the viewer is open would leave its index pointing into the
  // previous period's (now-replaced) list - close it on any period/scale change.
  useEffect(() => {
    setViewerIndex(null);
  }, [date, scale]);

  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= shownPosts.length) {
      setViewerIndex(shownPosts.length > 0 ? shownPosts.length - 1 : null);
    }
  }, [viewerIndex, shownPosts.length]);

  function addTagToBlacklist(tag: string) {
    setBlacklist(blacklist.trim() === "" ? tag : `${blacklist}\n${tag}`);
  }

  function changeScale(next: PopularScale) {
    setScale(next);
    setDate(today());
  }

  const atCurrent = isCurrentOrFuturePeriod(date, scale);

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <TrendingUp size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">Popular</h1>

        <div className="ml-1 flex items-center gap-0.5 rounded-[var(--radius-md)] bg-black/5 dark:bg-white/10 p-0.5 text-xs">
          {POPULAR_SCALES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => changeScale(s.value)}
              className={`rounded-[var(--radius-sm)] px-2 py-1 transition-colors ${
                scale === s.value
                  ? "bg-[rgb(var(--accent))] text-white"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            onClick={() => setDate((d) => shiftPeriod(d, scale, -1))}
            title="Earlier period"
          >
            <ChevronLeft size={17} />
          </IconButton>
          <span className="min-w-44 text-center text-xs tabular-nums opacity-80">
            {formatPeriod(date, scale)}
          </span>
          <IconButton
            onClick={() => setDate((d) => shiftPeriod(d, scale, 1))}
            disabled={atCurrent}
            title="Later period"
          >
            <ChevronRight size={17} />
          </IconButton>
          {!atCurrent && (
            <button
              type="button"
              onClick={() => setDate(today())}
              className="rounded-[var(--radius-sm)] px-2 py-1 text-xs opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Now
            </button>
          )}
        </div>

        <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
          <X size={18} />
        </IconButton>
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
            <Spinner size={15} />
            Loading…
          </div>
        ) : isError || !posts ? (
          <div className="flex h-full items-center justify-center text-sm text-red-500">
            Failed to load popular posts.
          </div>
        ) : posts.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm opacity-60">
            No popular posts for this period.
          </div>
        ) : (
          <PostGrid
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
