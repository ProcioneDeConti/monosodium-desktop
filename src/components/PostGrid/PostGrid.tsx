import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteLoader, useMasonry, usePositioner, useResizeObserver } from "masonic";
import { ArrowUp, EyeOff, SearchX } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import { isVideo, playableUrl, type Post } from "../../models/post";
import { setMorph, withViewTransition } from "../../lib/theme";

/** How long after the grid mounts newly mounted cells still get the entrance ripple. */
const ENTRANCE_WINDOW_MS = 400;
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
  /** Uniform mode: every cell is a square crop, so the masonry packs into plain rows. */
  uniform?: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  onPostClick: (index: number) => void;
  /** Multi-select. When `selectionActive`, a thumbnail click toggles selection instead of
   *  opening the viewer; a ctrl/cmd/shift-click always toggles (and enters selection mode). */
  selectionActive?: boolean;
  selectedIds?: Set<number>;
  onSelectToggle?: (post: Post, opts: { range: boolean }) => void;
  /** Identifies this result list for scroll-position memory (survives remounts - tab switches,
   *  Back to an earlier search). */
  scrollKey?: string;
  /** The open viewer's index (null = closed). When the viewer closes, the grid moves its focus
   *  ring to the last-viewed post, scrolls it into view and briefly flashes it. */
  viewerIndex?: number | null;
  /** post id -> 1-based fetched page, for the "Page N" markers and floating page indicator. */
  pageOfPost?: Map<number, number>;
}

/** Last scroll offset per result list, for the session (module-level so it outlives the grid's
 *  remount-per-search `key`). */
const savedScrollTops = new Map<string, number>();
/** Cap on scroll steps when revealing a not-yet-laid-out cell after closing the viewer. */
const MAX_REVEAL_STEPS = 60;
/** Show the jump-to-top button once scrolled this many viewport heights down. */
const JUMP_TOP_AFTER_SCREENS = 2;
const FLASH_MS = 1400;

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
  uniform = false,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  onPostClick,
  selectionActive = false,
  selectedIds,
  onSelectToggle,
  scrollKey,
  viewerIndex = null,
  pageOfPost,
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
  // The ripple-in only plays for the cells mounted with the first page, right after this grid
  // mounts (new search/refresh remount it) - and never once the user has scrolled. Cells masonic
  // mounts while scrolling must appear instantly: with the ripple, each sat invisible through its
  // stagger delay + fade, leaving cell/row-shaped gaps if you scrolled right after a load.
  const gridMountedAt = useRef(performance.now());
  const entranceOpen = useRef(true);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    entranceOpen.current = false;
    setIsScrolling(true);
    window.clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = window.setTimeout(() => setIsScrolling(false), SCROLL_IDLE_MS);
    if (scrollRafPending.current) return;
    scrollRafPending.current = true;
    requestAnimationFrame(() => {
      scrollRafPending.current = false;
      setScrollTop(el.scrollTop);
      if (scrollKey && !restoringRef.current) savedScrollTops.set(scrollKey, el.scrollTop);
    });
  }, [scrollKey]);

  // Restore the remembered offset on mount. Cells are measured lazily as they mount, so the
  // content height grows while we approach the target - keep re-applying for a few frames until
  // it sticks (or give up after ~half a second and leave the user wherever it got to).
  const restoringRef = useRef(false);
  useEffect(() => {
    const target = scrollKey ? savedScrollTops.get(scrollKey) : undefined;
    const el = containerRef.current;
    if (!el || !target) return;
    restoringRef.current = true;
    let frames = 0;
    let raf = 0;
    const step = () => {
      el.scrollTop = target;
      frames += 1;
      if ((Math.abs(el.scrollTop - target) < 2 && frames > 4) || frames > 30) {
        restoringRef.current = false;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      restoringRef.current = false;
    };
  }, [scrollKey]);

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
    // gridMode too: every cell height changes at once, so re-pack from scratch rather than
    // nudging each cell through the resize observer (which would keep the old column choices).
    [blacklistDisabled, blacklistEntries, resetNonce.current, uniform],
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
  // Opening a post morphs its thumbnail into the viewer (View Transitions - lib/theme.ts). Images
  // only: the viewer's morph target is ZoomableImage's preview placeholder, videos have none.
  const openPost = useCallback(
    (index: number, post: Post) => {
      const img =
        !isVideo(post) && post.file.url
          ? containerRef.current?.querySelector<HTMLElement>(`[data-post-thumb="${post.id}"] img`)
          : null;
      setMorph(img, true);
      withViewTransition(() => {
        onPostClick(index);
        setMorph(img, false);
      });
    },
    [onPostClick],
  );


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
              openPost(index, data);
            }
          }}
          // Ripple-in stagger for a fresh batch: ~one 30-post page spread over ~360ms.
          enterDelayMs={
            entranceOpen.current && performance.now() - gridMountedAt.current < ENTRANCE_WINDOW_MS
              ? (index % 30) * 12
              : null
          }
          canInteract={canInteract}
          onToggleFavorite={onToggleFavorite}
          onUpvote={onUpvote}
          onDownload={onDownload}
          selectionActive={selectionActive}
          selected={selectedIds?.has(data.id) ?? false}
          cellWidthPx={thumbnailSizePx}
          square={uniform}
        />
      );
    },
    [
      blacklistDisabled,
      blacklistEntries,
      openPost,
      canInteract,
      onToggleFavorite,
      onUpvote,
      onDownload,
      selectionActive,
      selectedIds,
      onSelectToggle,
      thumbnailSizePx,
      uniform,
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

  // Where a fresh focus ring starts: the first cell already on screen, not index 0 - seeding 0
  // makes the reveal effect below yank a scrolled grid back to the very top.
  const firstInView = useCallback((): number => {
    const el = containerRef.current;
    if (!el || visible.length === 0) return 0;
    let best = Infinity;
    positioner.range(el.scrollTop, el.scrollTop + el.clientHeight, (index) => {
      if (index < best) best = index;
    });
    return Number.isFinite(best) ? Math.min(best, visible.length - 1) : 0;
  }, [positioner, visible.length]);

  // Take keyboard focus on mount if nothing else holds it (e.g. right after a search submitted
  // from the search bar, which blurs itself), so arrows / h-j-k-l work without a click first.
  // No ring is seeded for this - it's not the user tabbing in.
  const quietFocus = useRef(false);
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    quietFocus.current = true;
    containerRef.current?.focus({ preventScroll: true });
    quietFocus.current = false;
  }, []);

  // Keep the ring valid when `visible` shrinks (blacklist toggle) without a remount.
  useEffect(() => {
    setFocusIndex((f) => (f == null ? null : visible.length === 0 ? null : Math.min(f, visible.length - 1)));
  }, [visible.length]);

  // Viewer closed -> land the focus ring on the post you were last looking at.
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const prevViewerIndex = useRef(viewerIndex);
  useEffect(() => {
    const prev = prevViewerIndex.current;
    prevViewerIndex.current = viewerIndex;
    if (prev == null || viewerIndex != null || prev >= visible.length) return;
    setFocusIndex(prev);
    setFlashIndex(prev);
    containerRef.current?.focus({ preventScroll: true });
    const t = window.setTimeout(() => setFlashIndex(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [viewerIndex, visible.length]);

  // Bring the focused cell into view. Uses the positioner's real measured box when the cell has
  // been positioned. If it hasn't (e.g. you paged far ahead in the viewer), masonic only places
  // cells in order as it renders them, so a row-height guess lands somewhere arbitrary in a
  // masonry layout - instead step to the bottom of the laid-out content so masonic renders the
  // next batch, and repeat (each `scrollTop` change re-runs this) until the cell has a real box.
  // Only acts until the focused cell has been revealed once, and gives up after a bounded number
  // of steps - otherwise every user scroll would yank the viewport back to the ring.
  const revealedIndex = useRef<number | null>(null);
  const revealSteps = useRef(0);
  useEffect(() => {
    if (focusIndex == null || revealedIndex.current === focusIndex) return;
    const el = containerRef.current;
    if (!el) return;
    const pos = positioner.get(focusIndex);
    if (!pos) {
      if (++revealSteps.current > MAX_REVEAL_STEPS) {
        revealedIndex.current = focusIndex;
        revealSteps.current = 0;
        return;
      }
      const end = positioner.shortestColumn();
      if (end > el.scrollTop + el.clientHeight - 1) el.scrollTo({ top: Math.max(0, end - el.clientHeight / 2) });
      return;
    }
    revealedIndex.current = focusIndex;
    revealSteps.current = 0;
    const top = pos.top;
    const bottom = pos.top + pos.height;
    const pad = 14;
    if (top < el.scrollTop + pad) el.scrollTo({ top: Math.max(0, top - pad) });
    else if (bottom > el.scrollTop + el.clientHeight - pad)
      el.scrollTo({ top: bottom - el.clientHeight + pad });
  }, [focusIndex, scrollTop, positioner, columns, thumbnailSizePx]);

  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const move = (delta: number) =>
        setFocusIndex((cur) =>
          visible.length === 0
            ? null
            : cur == null
              ? firstInView()
              : Math.min(visible.length - 1, Math.max(0, cur + delta)),
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
          else openPost(focusIndex!, post);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    },
    [visible, columns, focusIndex, selectionActive, onSelectToggle, openPost, firstInView],
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
  const flashPos = flashIndex != null ? positioner.get(flashIndex) : undefined;

  // --- page markers ---
  // A masonry layout can't take a full-width divider without breaking column packing, so each
  // page boundary is marked with a pill on that page's first cell instead, plus a floating
  // "Page N" indicator for wherever the viewport currently is.
  const pageStarts = useMemo(() => {
    const out: { index: number; page: number }[] = [];
    if (!pageOfPost) return out;
    let last = 0;
    visible.forEach((p, i) => {
      const page = pageOfPost.get(p.id) ?? last;
      if (page > last) {
        if (page > 1) out.push({ index: i, page });
        last = page;
      }
    });
    return out;
  }, [visible, pageOfPost]);
  let currentPage = 1;
  const viewMid = scrollTop + size.height / 2;
  for (const { index, page } of pageStarts) {
    const pos = positioner.get(index);
    if (pos && pos.top <= viewMid) currentPage = page;
  }
  const showJumpTop = size.height > 0 && scrollTop > size.height * JUMP_TOP_AFTER_SCREENS;

  return (
    <div className="relative h-full">
    <div
      ref={containerRef}
      id="post-grid"
      onScroll={onScroll}
      onWheel={() => (revealedIndex.current = focusIndex)}
      onKeyDown={onGridKeyDown}
      // Seed the ring only when keyboard focus lands on the grid itself (Tab, or Escape out of
      // the search bar). The viewer-close effect above calls focus() right after its own
      // setFocusIndex(prev), before that commits - so on the first close after a search this
      // handler still saw `focusIndex == null` and queued a 0 that overrode `prev`, scrolling the
      // grid back to the top. The functional update keeps a ring set earlier in the same tick.
      onFocus={(e) => {
        if (e.target !== e.currentTarget || quietFocus.current || visible.length === 0) return;
        if (!e.currentTarget.matches(":focus-visible")) return;
        setFocusIndex((f) => f ?? firstInView());
      }}
      tabIndex={0}
      role="grid"
      aria-label="Post results"
      className="h-full overflow-y-auto px-3 py-3 focus:outline-none"
    >
      {empty ? (
        allHiddenByBlacklist ? (
          <EmptyState
            mascot="sad"
            icon={<EyeOff />}
            title={`All ${posts.length} result${posts.length === 1 ? "" : "s"} are hidden by your blacklist`}
            hint="Turn on “Show blacklisted posts” in the View menu to see them, or loosen the blacklist in Settings."
          />
        ) : (
          <EmptyState
            mascot="sad"
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
          {flashPos && (
            <div
              className="pointer-events-none absolute z-[5] animate-pulse rounded-[var(--radius-md)]
                         bg-[rgb(var(--accent))]/25"
              style={{
                top: flashPos.top,
                left: flashPos.left,
                width: positioner.columnWidth,
                height: flashPos.height,
              }}
            />
          )}
          {pageStarts.map(({ index, page }) => {
            const pos = positioner.get(index);
            if (!pos) return null;
            return (
              <div
                key={page}
                className="pointer-events-none absolute z-[6] -translate-y-1/2 rounded-full bg-[rgb(var(--accent))]
                           px-2 py-0.5 text-[10px] font-semibold text-white shadow"
                style={{ top: pos.top, left: pos.left + 6 }}
              >
                Page {page}
              </div>
            );
          })}
        </div>
      )}
    </div>
    {!empty && !selectionActive && (showJumpTop || currentPage > 1) && (
      <div className="pointer-events-none absolute bottom-4 right-5 z-10 flex items-center gap-2">
        <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg">
          Page {currentPage} · {visible.length} posts
        </span>
        {showJumpTop && (
          <button
            type="button"
            onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            title="Back to top"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full
                       bg-[rgb(var(--accent))] text-white shadow-lg hover:brightness-110"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    )}
    </div>
  );
}
