import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteLoader, useMasonry, usePositioner, useResizeObserver } from "masonic";
import { downloadFileName, isVideo, playableUrl, type Post } from "../../models/post";
import type { Site } from "../../models/site";
import { PostThumbnail } from "./PostThumbnail";
import { isBlacklisted, visiblePosts, type BlacklistEntries } from "../../lib/blacklist";
import { usePostMutations } from "../../queries/usePostMutations";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { e621Api } from "../../api/client";

interface PostGridProps {
  site: Site;
  posts: Post[];
  blacklistEntries: BlacklistEntries;
  blacklistDisabled: boolean;
  thumbnailSizePx: number;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  onPostClick: (index: number) => void;
  /** Multi-select. When `selectionActive`, a thumbnail click toggles selection instead of
   *  opening the viewer; a ctrl/cmd/shift-click always toggles (and enters selection mode). */
  selectionActive?: boolean;
  selectedIds?: Set<number>;
  onSelectToggle?: (post: Post, opts: { range: boolean }) => void;
}

const GUTTER_PX = 8;
/** How long after the last scroll event to keep treating the grid as "scrolling" (masonic uses
 *  this to disable pointer events / hint the browser to skip paint work while flinging). */
const SCROLL_IDLE_MS = 150;

/** A Pinterest-style masonry grid (variable-height cells sized from each post's own aspect
 *  ratio, packed into whichever column is currently shortest) via `masonic`, matching the
 *  reference Android app's LazyVerticalStaggeredGrid look. `masonic`'s batteries-included
 *  `<Masonry>`/`<MasonryScroller>` only track the browser `window`'s scroll position, but this
 *  grid scrolls inside its own bounded container (the shell header stays fixed above it), so
 *  `useMasonry` is driven directly from this component's own scroll/resize state instead. */
export function PostGrid({
  site,
  posts,
  blacklistEntries,
  blacklistDisabled,
  thumbnailSizePx,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  onPostClick,
  selectionActive = false,
  selectedIds,
  onSelectToggle,
}: PostGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Hover quick-actions on each thumbnail (favourite / upvote / download) - wired here rather
  // than threaded through every PostGrid caller. `mutate` and the store selectors are all
  // referentially stable, so the callbacks below stay stable and don't churn masonic's cells.
  const canInteract = useAccountStore((s) => s.isAuthenticated(site));
  const downloadDir = useSettingsStore((s) => s.downloadDir);
  const { vote, favorite, unfavorite } = usePostMutations(site);
  const onToggleFavorite = useCallback(
    (post: Post) => (post.is_favorited ? unfavorite.mutate(post.id) : favorite.mutate(post.id)),
    [favorite.mutate, unfavorite.mutate],
  );
  const onUpvote = useCallback(
    (post: Post) => vote.mutate({ postId: post.id, direction: 1 }),
    [vote.mutate],
  );
  const onDownload = useCallback(
    (post: Post) => {
      const url = playableUrl(post);
      if (!url) return Promise.reject(new Error("no file"));
      return e621Api.downloadPostFile(url, downloadFileName(post), downloadDir, isVideo(post));
    },
    [downloadDir],
  );
  const scrollIdleTimer = useRef<number | undefined>(undefined);
  const scrollRafPending = useRef(false);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Coalesce scroll events to one state update per frame - the raw event can fire several times
  // between paints, and each `setScrollTop` re-runs this component (and masonic's whole layout
  // pass). `isScrolling` is set eagerly so masonic can start skipping paint work immediately.
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setIsScrolling(true);
    window.clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = window.setTimeout(() => setIsScrolling(false), SCROLL_IDLE_MS);
    if (scrollRafPending.current) return;
    scrollRafPending.current = true;
    requestAnimationFrame(() => {
      scrollRafPending.current = false;
      setScrollTop(el.scrollTop);
    });
  }, []);

  useEffect(() => () => window.clearTimeout(scrollIdleTimer.current), []);

  const visible = useMemo(
    () => visiblePosts(posts, blacklistEntries, blacklistDisabled),
    [posts, blacklistEntries, blacklistDisabled],
  );

  // masonic assumes `items` only ever grows (pagination) or is replaced wholesale (a remount);
  // if it ever gets *shorter* than what the positioner already has cells cached for - e.g. the
  // refresh button discarding every page but the first - it throws trying to render a now-gone
  // index, taking the whole tree down with it (see masonic's throwWithoutData). Comparing against
  // the previous render's length here, synchronously, catches that before `useMasonry` below ever
  // sees the shrunk array; masonic's own `usePositioner` uses this same "ref as previous-render
  // memory" pattern internally.
  const prevVisibleLength = useRef(visible.length);
  const resetNonce = useRef(0);
  if (visible.length < prevVisibleLength.current) {
    resetNonce.current += 1;
  }
  prevVisibleLength.current = visible.length;

  // Scrolling back to top alongside that reset avoids landing on a now-empty stretch of the
  // (much shorter) post-refresh list - deferred to an effect since it's a real DOM side effect,
  // not something to do inline during render.
  useLayoutEffect(() => {
    if (resetNonce.current > 0) containerRef.current?.scrollTo({ top: 0 });
  }, [resetNonce.current]);

  // A fresh positioner clears masonic's cached cell positions - needed whenever the
  // *composition* of `visible` can reshuffle (items inserted/removed mid-array, not just
  // appended via pagination), since masonic otherwise assumes index N always refers to the
  // same item. A brand new search gets a clean slate for free because App.tsx keys this whole
  // component by site+query; a column-width change (thumbnail slider, window resize) is handled
  // below by the resize observer instead of a reset, since the cell's *content* didn't change.
  const positioner = usePositioner(
    { width: size.width, columnWidth: thumbnailSizePx, columnGutter: GUTTER_PX },
    [blacklistDisabled, blacklistEntries, resetNonce.current],
  );
  // Re-measures a cell's actual rendered height (its CSS `aspect-ratio` box resolves to a new
  // pixel height whenever the column width changes) and repositions everything below it -
  // without this, a thumbnail-size change or window resize would keep using stale cached
  // heights from the old column width and cells would overlap/gap incorrectly.
  const resizeObserver = useResizeObserver(positioner);

  const loadMore = useInfiniteLoader(
    async () => {
      if (hasNextPage && !isFetchingNextPage) onLoadMore();
    },
    { isItemLoaded: (index) => index < visible.length, minimumBatchSize: 30, threshold: 8 },
  );

  // Stable identity so masonic keeps its per-cell React.memo intact - a fresh render function
  // every pass forces every visible thumbnail to re-render on any parent state change (scroll
  // included).
  const renderCell = useCallback(
    ({ index, data }: { index: number; data: Post }) => {
      const blacklisted = blacklistDisabled && isBlacklisted(blacklistEntries, data);
      return (
        <PostThumbnail
          post={data}
          blacklisted={blacklisted}
          onClick={(e) => {
            if (onSelectToggle && (selectionActive || e.ctrlKey || e.metaKey || e.shiftKey)) {
              onSelectToggle(data, { range: e.shiftKey });
            } else {
              onPostClick(index);
            }
          }}
          canInteract={canInteract}
          onToggleFavorite={onToggleFavorite}
          onUpvote={onUpvote}
          onDownload={onDownload}
          selectionActive={selectionActive}
          selected={selectedIds?.has(data.id) ?? false}
        />
      );
    },
    [
      blacklistDisabled,
      blacklistEntries,
      onPostClick,
      canInteract,
      onToggleFavorite,
      onUpvote,
      onDownload,
      selectionActive,
      selectedIds,
      onSelectToggle,
    ],
  );

  const grid = useMasonry({
    positioner,
    resizeObserver,
    items: visible,
    height: size.height || 1,
    scrollTop,
    isScrolling,
    overscanBy: 3,
    itemHeightEstimate: thumbnailSizePx,
    itemKey: (post) => post.id,
    render: renderCell,
    onRender: loadMore,
  });

  // The container below must never conditionally unmount - the ResizeObserver that measures it
  // is attached once, on mount, and a ref pointing at a since-removed/replaced DOM node would
  // silently stop reporting size changes forever (this used to be a separate early `return` for
  // the empty state, which did exactly that: if that branch ever rendered - e.g. every result in
  // a search matches a tag you just blacklisted - the container came and went, size stuck at 0,
  // and the grid never rendered again even after posts became visible).
  const empty = visible.length === 0 && !isFetchingNextPage;

  return (
    <div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-3">
      {empty ? (
        <div className="flex h-full items-center justify-center text-sm opacity-60">
          No posts found.
        </div>
      ) : (
        size.width > 0 && grid
      )}
    </div>
  );
}
