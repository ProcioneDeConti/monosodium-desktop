import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInfiniteLoader, useMasonry, usePositioner, useResizeObserver } from "masonic";
import type { Post } from "../../models/post";
import { PostThumbnail } from "./PostThumbnail";
import { isBlacklisted, visiblePosts, type BlacklistEntries } from "../../lib/blacklist";

interface PostGridProps {
  posts: Post[];
  blacklistEntries: BlacklistEntries;
  blacklistDisabled: boolean;
  thumbnailSizePx: number;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  onPostClick: (index: number) => void;
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
  posts,
  blacklistEntries,
  blacklistDisabled,
  thumbnailSizePx,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  onPostClick,
}: PostGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollIdleTimer = useRef<number | undefined>(undefined);

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

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    setIsScrolling(true);
    window.clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = window.setTimeout(() => setIsScrolling(false), SCROLL_IDLE_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(scrollIdleTimer.current), []);

  const visible = visiblePosts(posts, blacklistEntries, blacklistDisabled);

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
    render: ({ index, data }) => {
      const post = data;
      const blacklisted = blacklistDisabled && isBlacklisted(blacklistEntries, post);
      return <PostThumbnail post={post} blacklisted={blacklisted} onClick={() => onPostClick(index)} />;
    },
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
