import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AppWindow,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Expand,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Play,
  Plus,
  Shuffle,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Post } from "../../models/post";
import { isDeleted, isVideo, playableUrl } from "../../models/post";
import type { Site } from "../../models/site";
import { ZoomableImage } from "./ZoomableImage";
import { VideoPlayer } from "./VideoPlayer";
import { TagsPanel } from "./TagsPanel";
import { InfoPanel } from "./InfoPanel";
import { ReportPostButton } from "./ReportPostButton";
import { AddToSetButton } from "./AddToSetButton";
import { RelatedTagsPanel } from "./RelatedTagsPanel";
import { CommentsPanel } from "./CommentsPanel";
import { HistoryPanel } from "./HistoryPanel";
import { usePostMutations } from "../../queries/usePostMutations";
import { usePostNotesQuery } from "../../queries/usePostNotesQuery";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { matchingBlacklistTags, type BlacklistEntries } from "../../lib/blacklist";
import {
  MAX_SLIDESHOW_INTERVAL_SEC,
  MIN_SLIDESHOW_INTERVAL_SEC,
  SLIDESHOW_TRANSITIONS,
} from "../../lib/slideshow";
import { useDownloadsStore } from "../../state/downloadsStore";
import { useFullscreen } from "../../lib/useFullscreen";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

const SLIDESHOW_TRANSITION_ANIMATION: Record<string, string> = {
  fade: "animate-[fade-in_450ms_ease-out]",
  slide: "animate-[slideshow-slide_450ms_ease-out]",
  zoom: "animate-[slideshow-zoom_450ms_ease-out]",
  none: "",
};

interface PostViewerProps {
  site: Site;
  posts: Post[];
  index: number;
  hasNextPage: boolean;
  blacklistEntries: BlacklistEntries;
  blacklistDisabled: boolean;
  onIndexChange: (index: number) => void;
  onLoadMore: () => void;
  onClose: () => void;
  onSearchTag: (tag: string) => void;
  onAddTagToSearch: (tag: string) => void;
  onExcludeTag: (tag: string) => void;
  onBlacklistTag: (tag: string) => void;
  onOpenProfile: (userId: number) => void;
  onOpenPool: (poolId: number) => void;
  onOpenArtist: (tag: string) => void;
  onOpenWiki: (tag: string) => void;
  slideshowActive: boolean;
  onToggleSlideshow: () => void;
  /** Extra toolbar controls for the current post - e.g. SetsPanel's "remove from set". */
  extraToolbarActions?: (post: Post) => ReactNode;
}

const LOAD_MORE_THRESHOLD = 6;

export function PostViewer({
  site,
  posts,
  index,
  hasNextPage,
  blacklistEntries,
  blacklistDisabled,
  onIndexChange,
  onLoadMore,
  onClose,
  onSearchTag,
  onAddTagToSearch,
  onExcludeTag,
  onBlacklistTag,
  onOpenProfile,
  onOpenPool,
  onOpenArtist,
  onOpenWiki,
  slideshowActive,
  onToggleSlideshow,
  extraToolbarActions,
}: PostViewerProps) {
  // `index` can briefly point past the end - e.g. blacklisting a tag the open post matches shrinks
  // the `posts` array a render before App clamps the index - so `post` may be undefined here. The
  // hooks below must still run unconditionally (Rules of Hooks); the early `return` is further down.
  const post = posts[index] as Post | undefined;
  const { data: notes } = usePostNotesQuery(site, post?.id ?? 0, post?.has_notes ?? false);
  const isAuthenticated = useAccountStore((s) => s.isAuthenticated(site));
  const { vote, favorite, unfavorite, report } = usePostMutations(site);
  const videoLoopEnabled = useSettingsStore((s) => s.videoLoopEnabled);
  const videoPlaybackSpeed = useSettingsStore((s) => s.videoPlaybackSpeed);
  const videoAutoplayEnabled = useSettingsStore((s) => s.videoAutoplayEnabled);
  const downloadDir = useSettingsStore((s) => s.downloadDir);
  const slideshowIntervalSec = useSettingsStore((s) => s.slideshowIntervalSec);
  const slideshowTransition = useSettingsStore((s) => s.slideshowTransition);
  const slideshowShuffle = useSettingsStore((s) => s.slideshowShuffle);
  const setSlideshowIntervalSec = useSettingsStore((s) => s.setSlideshowIntervalSec);
  const setSlideshowTransition = useSettingsStore((s) => s.setSlideshowTransition);
  const setSlideshowShuffle = useSettingsStore((s) => s.setSlideshowShuffle);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "queued">("idle");
  // Images display the ~850px `sample` by default - decoding a full-res original (routinely
  // several thousand px / many MB, and animated GIF/APNG playing at full size) on the main
  // thread is a real source of stutter, especially advancing a slideshow. Toggle loads the
  // original for the current post (resets each time you navigate).
  const [showOriginal, setShowOriginal] = useState(false);
  const enqueueDownload = useDownloadsStore((s) => s.enqueue);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [transitionMenuOpen, setTransitionMenuOpen] = useState(false);
  const transitionMenuRef = useRef<HTMLDivElement>(null);
  const [sidebarTab, setSidebarTab] = useState<"tags" | "comments" | "history">("tags");
  const [relatedTagFor, setRelatedTagFor] = useState<string | null>(null);

  useEffect(() => {
    setDownloadStatus("idle");
    setShowOriginal(false);
  }, [post?.id]);

  function handleDownload() {
    if (!post || !playableUrl(post)) return;
    enqueueDownload([post], downloadDir);
    setDownloadStatus("queued");
    setTimeout(() => setDownloadStatus("idle"), 1500);
  }

  function popOutWindow() {
    if (!post) return;
    const label = `post-${post.id}-${Date.now()}`;
    new WebviewWindow(label, {
      url: `index.html?post=${post.id}&site=${site}`,
      title: `Post #${post.id} - Monosodium Desktop`,
      width: 900,
      height: 700,
    });
  }

  const canGoPrev = index > 0;
  const canGoNext = index < posts.length - 1 || hasNextPage;

  const goPrev = useCallback(() => {
    if (canGoPrev) onIndexChange(index - 1);
  }, [canGoPrev, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (index < posts.length - 1) {
      onIndexChange(index + 1);
    } else if (hasNextPage) {
      onLoadMore();
      onIndexChange(index + 1);
    }
  }, [index, posts.length, hasNextPage, onIndexChange, onLoadMore]);

  useEffect(() => {
    if (posts.length - index <= LOAD_MORE_THRESHOLD && hasNextPage) {
      onLoadMore();
    }
  }, [index, posts.length, hasNextPage, onLoadMore]);

  // Starting (or restarting) slideshow mode always resumes unpaused.
  useEffect(() => {
    if (slideshowActive) setSlideshowPaused(false);
  }, [slideshowActive]);

  // One slideshow step. Shuffle jumps to a random other post (and pulls the next page in when it
  // lands near the end) and so never runs out; sequential mode stops once there's nothing after
  // the current post and no more pages to load, rather than sitting idle on the last one.
  const advanceSlideshow = useCallback(() => {
    if (slideshowShuffle && posts.length > 1) {
      let next = Math.floor(Math.random() * posts.length);
      if (next === index) next = (next + 1) % posts.length;
      onIndexChange(next);
      if (posts.length - next <= LOAD_MORE_THRESHOLD && hasNextPage) onLoadMore();
      return;
    }
    if (canGoNext) goNext();
    else onToggleSlideshow();
  }, [
    slideshowShuffle,
    posts.length,
    index,
    onIndexChange,
    hasNextPage,
    onLoadMore,
    canGoNext,
    goNext,
    onToggleSlideshow,
  ]);

  // Auto-advance timer - restarts on every index/interval/pause change, so manual nav (arrow
  // keys, the chevron buttons) naturally resets the countdown too.
  useEffect(() => {
    if (!slideshowActive || slideshowPaused) return;
    const timer = setTimeout(advanceSlideshow, slideshowIntervalSec * 1000);
    return () => clearTimeout(timer);
  }, [slideshowActive, slideshowPaused, index, slideshowIntervalSec, advanceSlideshow]);

  useEffect(() => {
    if (!transitionMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (transitionMenuRef.current && !transitionMenuRef.current.contains(e.target as Node)) {
        setTransitionMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [transitionMenuOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && !e.altKey) goPrev();
      else if (e.key === "ArrowRight" && !e.altKey) goNext();
      else if (e.key === " " && slideshowActive) {
        e.preventDefault();
        setSlideshowPaused((p) => !p);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, goPrev, goNext, slideshowActive]);

  const highlightedTags = useMemo(
    () => (post && blacklistDisabled ? matchingBlacklistTags(blacklistEntries, post) : new Set<string>()),
    [post, blacklistEntries, blacklistDisabled],
  );

  if (!post) return null;

  const url = playableUrl(post);
  const deleted = isDeleted(post);
  const deletedOrMissing = deleted || !url;
  // The image the viewer actually displays: the sample by default, the original when toggled
  // (or when there's no distinct sample). Videos always play the original `url`.
  const sampleUrl = post.sample.url;
  const canToggleResolution = !isVideo(post) && !!sampleUrl && sampleUrl !== post.file.url;
  // Falls back to `url` (and "" only in the deleted/missing branch, which never renders the image).
  const imageSrc: string = (showOriginal || !canToggleResolution ? url : sampleUrl) ?? url ?? "";
  const voteTitle = isAuthenticated ? undefined : "Sign in (Settings) to vote";
  const favTitle = isAuthenticated ? undefined : "Sign in (Settings) to favorite";
  const votePending = vote.isPending;
  const favPending = favorite.isPending || unfavorite.isPending;

  return (
    <div className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] flex-col bg-black/90">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-white">
        <IconButton tone="invert" onClick={onClose} title="Close (Esc)">
          <X size={18} />
        </IconButton>
        <span className="text-sm opacity-70">#{post.id}</span>

        <IconButton tone="invert" onClick={popOutWindow} title="Open in new window">
          <AppWindow size={16} />
        </IconButton>

        <IconButton
          tone="invert"
          onClick={() => void toggleFullscreen()}
          title={isFullscreen ? "Exit fullscreen (F11)" : "Fullscreen (F11)"}
          className={isFullscreen ? "!text-[rgb(var(--accent))]" : ""}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </IconButton>

        <IconButton
          tone="invert"
          onClick={onToggleSlideshow}
          title={slideshowActive ? "Stop slideshow" : "Start slideshow"}
          className={slideshowActive ? "!text-[rgb(var(--accent))]" : ""}
        >
          {slideshowActive ? (
            <Square size={16} className="fill-current" />
          ) : (
            <Play size={16} className="fill-current" />
          )}
        </IconButton>

        {canToggleResolution && (
          <IconButton
            tone="invert"
            onClick={() => setShowOriginal((v) => !v)}
            title={showOriginal ? "Viewing original - click for the smaller sample" : "View original resolution"}
            className={showOriginal ? "!text-[rgb(var(--accent))]" : ""}
          >
            <Expand size={16} />
          </IconButton>
        )}

        <div className="ml-auto flex items-center gap-0.5 rounded-[var(--radius-md)] bg-white/5 p-0.5">
          <IconButton
            tone="invert"
            disabled={!isAuthenticated || votePending}
            title={voteTitle ?? "Upvote"}
            onClick={() => vote.mutate({ postId: post.id, direction: 1 })}
            className={post.vote_by > 0 ? "!text-green-400" : ""}
          >
            {votePending && vote.variables?.direction === 1 ? (
              <Spinner size={16} />
            ) : (
              <ThumbsUp size={16} className={post.vote_by > 0 ? "fill-current" : ""} />
            )}
          </IconButton>
          <span className="min-w-7 text-center text-sm tabular-nums">{post.score.total}</span>
          <IconButton
            tone="invert"
            disabled={!isAuthenticated || votePending}
            title={voteTitle ?? "Downvote"}
            onClick={() => vote.mutate({ postId: post.id, direction: -1 })}
            className={post.vote_by < 0 ? "!text-red-400" : ""}
          >
            {votePending && vote.variables?.direction === -1 ? (
              <Spinner size={16} />
            ) : (
              <ThumbsDown size={16} className={post.vote_by < 0 ? "fill-current" : ""} />
            )}
          </IconButton>
          <IconButton
            tone="invert"
            disabled={!isAuthenticated || favPending}
            title={favTitle ?? (post.is_favorited ? "Remove favorite" : "Add favorite")}
            onClick={() =>
              post.is_favorited ? unfavorite.mutate(post.id) : favorite.mutate(post.id)
            }
            className={post.is_favorited ? "!text-pink-400" : ""}
          >
            {favPending ? (
              <Spinner size={16} />
            ) : (
              <Heart size={16} className={post.is_favorited ? "fill-current" : ""} />
            )}
          </IconButton>
          <IconButton
            tone="invert"
            disabled={deletedOrMissing}
            title={downloadStatus === "queued" ? "Added to downloads" : "Download original file"}
            onClick={handleDownload}
            className={downloadStatus === "queued" ? "!text-green-400" : ""}
          >
            {downloadStatus === "queued" ? <Check size={16} /> : <Download size={16} />}
          </IconButton>
          {extraToolbarActions?.(post)}
          <AddToSetButton site={site} postId={post.id} isAuthenticated={isAuthenticated} />
          <ReportPostButton postId={post.id} isAuthenticated={isAuthenticated} report={report} />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <IconButton
            tone="invert"
            onClick={goPrev}
            disabled={!canGoPrev}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-black/30 disabled:opacity-0"
          >
            <ChevronLeft size={22} />
          </IconButton>
          <IconButton
            tone="invert"
            onClick={goNext}
            disabled={!canGoNext}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-black/30 disabled:opacity-0"
          >
            <ChevronRight size={22} />
          </IconButton>

          <div
            key={post.id}
            className={`h-full w-full ${slideshowActive ? SLIDESHOW_TRANSITION_ANIMATION[slideshowTransition] : ""}`}
          >
            {deleted || !url ? (
              <div className="flex h-full items-center justify-center text-sm text-white/60">
                This post has been deleted.
              </div>
            ) : isVideo(post) ? (
              <VideoPlayer
                key={post.id}
                src={url}
                loopDefault={videoLoopEnabled}
                speedDefault={videoPlaybackSpeed}
                autoplayEnabled={videoAutoplayEnabled}
              />
            ) : (
              <ZoomableImage
                key={post.id}
                src={imageSrc}
                alt={`Post ${post.id}`}
                site={site}
                notes={notes}
                imageWidth={post.file.width}
                imageHeight={post.file.height}
              />
            )}
          </div>

          {slideshowActive && (
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-white">
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  key={`${post.id}-${slideshowPaused}-${slideshowIntervalSec}`}
                  className="h-full origin-left bg-[rgb(var(--accent))]"
                  style={
                    slideshowPaused
                      ? { transform: "scaleX(1)" }
                      : { animation: `slideshow-countdown ${slideshowIntervalSec}s linear` }
                  }
                />
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSlideshowPaused((p) => !p)}
                  className="flex w-6 items-center justify-center rounded p-1 hover:bg-white/15"
                  title={slideshowPaused ? "Resume" : "Pause (Space)"}
                >
                  {slideshowPaused ? (
                    <Play size={14} className="fill-current" />
                  ) : (
                    <Pause size={14} className="fill-current" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSlideshowShuffle(!slideshowShuffle)}
                  className={`rounded p-1 hover:bg-white/15 ${slideshowShuffle ? "text-[rgb(var(--accent))]" : ""}`}
                  title={slideshowShuffle ? "Shuffle on" : "Shuffle off"}
                >
                  <Shuffle size={14} />
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSlideshowIntervalSec(slideshowIntervalSec - 1)}
                    disabled={slideshowIntervalSec <= MIN_SLIDESHOW_INTERVAL_SEC}
                    className="rounded p-1 hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none"
                    title="Shorter interval"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-8 text-center tabular-nums opacity-80">{slideshowIntervalSec}s</span>
                  <button
                    type="button"
                    onClick={() => setSlideshowIntervalSec(slideshowIntervalSec + 1)}
                    disabled={slideshowIntervalSec >= MAX_SLIDESHOW_INTERVAL_SEC}
                    className="rounded p-1 hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none"
                    title="Longer interval"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <div className="relative" ref={transitionMenuRef}>
                  <button
                    type="button"
                    onClick={() => setTransitionMenuOpen((v) => !v)}
                    className="rounded px-1.5 py-0.5 capitalize hover:bg-white/15"
                    title="Transition"
                  >
                    {slideshowTransition}
                  </button>
                  {transitionMenuOpen && (
                    <ul className="absolute bottom-full left-0 mb-1 w-28 overflow-hidden rounded-[var(--radius-sm)] bg-black/90 py-1 text-xs shadow-lg">
                      {SLIDESHOW_TRANSITIONS.map((t) => (
                        <li key={t.value}>
                          <button
                            type="button"
                            onClick={() => {
                              setSlideshowTransition(t.value);
                              setTransitionMenuOpen(false);
                            }}
                            className={`block w-full px-3 py-1 text-left hover:bg-white/15 ${
                              t.value === slideshowTransition ? "text-[rgb(var(--accent))]" : ""
                            }`}
                          >
                            {t.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <span className="opacity-60 tabular-nums">
                  {index + 1} / {posts.length}
                  {hasNextPage ? "+" : ""}
                </span>

                <button
                  type="button"
                  onClick={onToggleSlideshow}
                  className="ml-auto rounded p-1 hover:bg-white/15"
                  title="Stop slideshow"
                >
                  <Square size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-[rgb(20,20,20)]/95 px-3 py-3 text-white">
          <section className="mb-4">
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">Info</h2>
            <InfoPanel
              site={site}
              post={post}
              onOpenProfile={onOpenProfile}
              onOpenPool={onOpenPool}
              onSearch={onSearchTag}
            />
          </section>
          <section>
            <div className="mb-2 flex items-center gap-3 border-b border-white/10">
              <button
                type="button"
                onClick={() => setSidebarTab("tags")}
                className={`-mb-px border-b-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  sidebarTab === "tags"
                    ? "border-[rgb(var(--accent))] text-white"
                    : "border-transparent opacity-60 hover:opacity-90"
                }`}
              >
                Tags
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("comments")}
                className={`-mb-px border-b-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  sidebarTab === "comments"
                    ? "border-[rgb(var(--accent))] text-white"
                    : "border-transparent opacity-60 hover:opacity-90"
                }`}
              >
                Comments{post.comment_count > 0 ? ` (${post.comment_count})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("history")}
                className={`-mb-px border-b-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  sidebarTab === "history"
                    ? "border-[rgb(var(--accent))] text-white"
                    : "border-transparent opacity-60 hover:opacity-90"
                }`}
              >
                History
              </button>
            </div>
            {sidebarTab === "tags" ? (
              <TagsPanel
                post={post}
                highlightedTags={highlightedTags}
                onSearchTag={onSearchTag}
                onAddTagToSearch={onAddTagToSearch}
                onExcludeTag={onExcludeTag}
                onBlacklistTag={onBlacklistTag}
                onFindRelated={setRelatedTagFor}
                onOpenArtist={onOpenArtist}
                onOpenWiki={onOpenWiki}
              />
            ) : sidebarTab === "comments" ? (
              <CommentsPanel site={site} postId={post.id} onOpenProfile={onOpenProfile} />
            ) : (
              <HistoryPanel site={site} postId={post.id} onOpenProfile={onOpenProfile} />
            )}
          </section>
        </aside>
      </div>

      {relatedTagFor && (
        <RelatedTagsPanel
          site={site}
          tag={relatedTagFor}
          isAuthenticated={isAuthenticated}
          onClose={() => setRelatedTagFor(null)}
          onSearch={(t) => {
            setRelatedTagFor(null);
            onSearchTag(t);
          }}
          onAddToSearch={(t) => {
            setRelatedTagFor(null);
            onAddTagToSearch(t);
          }}
          onExclude={(t) => {
            setRelatedTagFor(null);
            onExcludeTag(t);
          }}
        />
      )}
    </div>
  );
}
