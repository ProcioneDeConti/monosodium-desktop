import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteLoader, useMasonry, usePositioner, useResizeObserver } from "masonic";
import { EyeOff, SearchX } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import { playableUrl, type Post } from "../../models/post";
import type { Site } from "../../models/site";
import { PostThumbnail } from "./PostThumbnail";
import { isBlacklisted, visiblePosts, type BlacklistEntries } from "../../lib/blacklist";
import { usePostMutations } from "../../queries/usePostMutations";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useDownloadsStore } from "../../state/downloadsStore";

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
  const enqueueDownload = useDownloadsStore((s) => s.enqueue);
  const { vote, favorite, unfavorite } = usePostMutations(site);
  // `mutateAsync` (not `mutate`) so PostThumbnail can await the round trip and show an in-flight
  // spinner on the button - e621 can take a beat to respond. Still referentially stable.
  const onToggleFavorite = useCallback(
    (post: Post) =>
      post.is_favorited ? unfavorite.mutateAsync(post.id) : favorite.mutateAsync(post.id),
    [favorite.mutateAsync, unfavorite.mutateAsync],
  );
  const onUpvote = useCallback(
    (post: Post) => vote.mutateAsync({ postId: post.id, direction: 1 }),
    [vote.mutateAsync],
  );
  // Route thumbnail downloads through the shared queue (see state/downloadsStore.ts + the
  // Downloads panel). Resolves immediately - the thumbnail's own check just means "queued".
  const onDownload = useCallback(
    (post: Post) => {
      if (playableUrl(post)) enqueueDownload([post], downloadDir);
      return Promise.resolve();
    },
    [downloadDir, enqueueDownload],
  );
  const scrollIdleTimer = useRef<number | undefined>(undefined);
  const scrollRafPending = useRef(false);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  // Keyboard navigation: a focus ring you move with the arrows / h-j-k-l, Enter (or Space) to
  // open - or, in selection mode, to toggle-select. Only acts while the grid container holds
  // focus. `null` = no ring yet.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

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
          cellWidthPx={thumbnailSizePx}
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
      thumbnailSizePx,
    ],
  );

  const grid = useMasonry({
    positioner,
    resizeObserver,
    items: visible,
    height: size.height || 1,
    scrollTop,
    isScrolling,
    // How many viewport-heights of off-screen cells to keep mounted. Each PostThumbnail is a
    // dozen-odd nodes plus SVG icons, so 3 was a lot of resident DOM on a large monitor; 2 still
    // covers a fast fling without popping.
    overscanBy: 2,
    itemHeightEstimate: thumbnailSizePx,
    itemKey: (post) => post.id,
    render: renderCell,
    onRender: loadMore,
  });

  // --- keyboard navigation ---
  const columns = Math.max(1, positioner.columnCount);

  // Keep the ring valid when `visible` shrinks (blacklist toggle) without a remount.
  useEffect(() => {
    setFocusIndex((f) => (f == null ? null : visible.length === 0 ? null : Math.min(f, visible.length - 1)));
  }, [visible.length]);

  // Bring the focused cell into view. Uses the positioner's real measured box when the cell has
  // been rendered at least once, otherwise a row-height estimate to get close (which mounts the
  // cell, after which `scrollTop` changing re-runs this with the exact box).
  useEffect(() => {
    if (focusIndex == null) return;
    const el = containerRef.current;
    if (!el) return;
    const pos = positioner.get(focusIndex);
    const top = pos ? pos.top : Math.floor(focusIndex / columns) * (thumbnailSizePx + GUTTER_PX);
    const bottom = pos ? pos.top + pos.height : top + thumbnailSizePx;
    const pad = 14;
    if (top < el.scrollTop + pad) el.scrollTo({ top: Math.max(0, top - pad) });
    else if (bottom > el.scrollTop + el.clientHeight - pad)
      el.scrollTo({ top: bottom - el.clientHeight + pad });
  }, [focusIndex, scrollTop, positioner, columns, thumbnailSizePx]);

  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const move = (delta: number) =>
        setFocusIndex((cur) =>
          visible.length === 0 ? null : Math.min(visible.length - 1, Math.max(0, (cur ?? 0) + delta)),
        );
      switch (e.key) {
        case "ArrowRight":
        case "l":
          move(1);
          break;
        case "ArrowLeft":
        case "h":
          move(-1);
          break;
        case "ArrowDown":
        case "j":
          move(columns);
          break;
        case "ArrowUp":
        case "k":
          move(-columns);
          break;
        case "Home":
          setFocusIndex(visible.length ? 0 : null);
          break;
        case "End":
          setFocusIndex(visible.length ? visible.length - 1 : null);
          break;
        case "Enter":
        case " ": {
          const post = focusIndex != null ? visible[focusIndex] : undefined;
          if (!post) break;
          if (selectionActive && onSelectToggle) onSelectToggle(post, { range: e.shiftKey });
          else onPostClick(focusIndex!);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    },
    [visible, columns, focusIndex, selectionActive, onSelectToggle, onPostClick],
  );

  // The container below must never conditionally unmount - the ResizeObserver that measures it
  // is attached once, on mount, and a ref pointing at a since-removed/replaced DOM node would
  // silently stop reporting size changes forever (this used to be a separate early `return` for
  // the empty state, which did exactly that: if that branch ever rendered - e.g. every result in
  // a search matches a tag you just blacklisted - the container came and went, size stuck at 0,
  // and the grid never rendered again even after posts became visible).
  const empty = visible.length === 0 && !isFetchingNextPage;
  // Distinguish "the search genuinely returned nothing" from "results came back but the blacklist
  // hid every one of them" - the fix for each is different.
  const allHiddenByBlacklist = empty && posts.length > 0;

  const focusPos = focusIndex != null ? positioner.get(focusIndex) : undefined;

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      onKeyDown={onGridKeyDown}
      onFocus={(e) => {
        if (e.target === e.currentTarget && focusIndex == null && visible.length > 0) setFocusIndex(0);
      }}
      tabIndex={0}
      role="grid"
      aria-label="Post results"
      className="h-full overflow-y-auto px-3 py-3 focus:outline-none"
    >
      {empty ? (
        allHiddenByBlacklist ? (
          <EmptyState
            icon={<EyeOff />}
            title={`All ${posts.length} result${posts.length === 1 ? "" : "s"} are hidden by your blacklist`}
            hint="Turn on “Show blacklisted posts” in the View menu to see them, or loosen the blacklist in Settings."
          />
        ) : (
          <EmptyState
            icon={<SearchX />}
            title="No posts matched"
            hint="Try fewer tags, or more general ones. Check your spelling and any excluded (−) tags too."
          />
        )
      ) : (
        <div className="relative">
          {size.width > 0 && grid}
          {focusPos && (
            <div
              className="pointer-events-none absolute z-[5] rounded-[var(--radius-md)] outline outline-2
                         outline-offset-2 outline-[rgb(var(--accent))]"
              style={{
                top: focusPos.top,
                left: focusPos.left,
                width: positioner.columnWidth,
                height: focusPos.height,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
