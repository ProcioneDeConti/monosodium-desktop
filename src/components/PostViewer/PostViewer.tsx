import { useCallback, useEffect, useMemo } from "react";
import type { Post } from "../../models/post";
import { isDeleted, isVideo, playableUrl } from "../../models/post";
import type { Site } from "../../models/site";
import { ZoomableImage } from "./ZoomableImage";
import { VideoPlayer } from "./VideoPlayer";
import { TagsPanel } from "./TagsPanel";
import { InfoPanel } from "./InfoPanel";
import { usePostMutations } from "../../queries/usePostMutations";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { matchingBlacklistTags, type BlacklistEntries } from "../../lib/blacklist";

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
}: PostViewerProps) {
  const post = posts[index];
  const isAuthenticated = useAccountStore((s) => s.isAuthenticated(site));
  const { vote, favorite, unfavorite } = usePostMutations(site);
  const videoLoopEnabled = useSettingsStore((s) => s.videoLoopEnabled);
  const videoPlaybackSpeed = useSettingsStore((s) => s.videoPlaybackSpeed);
  const videoAutoplayEnabled = useSettingsStore((s) => s.videoAutoplayEnabled);

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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, goPrev, goNext]);

  const highlightedTags = useMemo(
    () => (post && blacklistDisabled ? matchingBlacklistTags(blacklistEntries, post) : new Set<string>()),
    [post, blacklistEntries, blacklistDisabled],
  );

  if (!post) return null;

  const url = playableUrl(post);
  const deleted = isDeleted(post);
  const voteTitle = isAuthenticated ? undefined : "Sign in (Settings) to vote";
  const favTitle = isAuthenticated ? undefined : "Sign in (Settings) to favorite";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-white">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-lg hover:bg-white/10"
          title="Close (Esc)"
        >
          ×
        </button>
        <span className="text-sm opacity-70">#{post.id}</span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={!isAuthenticated}
            title={voteTitle ?? "Upvote"}
            onClick={() => vote.mutate({ postId: post.id, direction: 1 })}
            className={`rounded px-2 py-1 text-sm font-semibold hover:bg-white/10 disabled:opacity-30 ${
              post.vote_by > 0 ? "text-green-400" : ""
            }`}
          >
            ▲
          </button>
          <span className="min-w-8 text-center text-sm tabular-nums">{post.score.total}</span>
          <button
            type="button"
            disabled={!isAuthenticated}
            title={voteTitle ?? "Downvote"}
            onClick={() => vote.mutate({ postId: post.id, direction: -1 })}
            className={`rounded px-2 py-1 text-sm font-semibold hover:bg-white/10 disabled:opacity-30 ${
              post.vote_by < 0 ? "text-red-400" : ""
            }`}
          >
            ▼
          </button>
          <button
            type="button"
            disabled={!isAuthenticated}
            title={favTitle ?? (post.is_favorited ? "Remove favorite" : "Add favorite")}
            onClick={() =>
              post.is_favorited ? unfavorite.mutate(post.id) : favorite.mutate(post.id)
            }
            className={`ml-1 rounded px-2 py-1 text-lg hover:bg-white/10 disabled:opacity-30 ${
              post.is_favorited ? "text-pink-400" : ""
            }`}
          >
            {post.is_favorited ? "♥" : "♡"}
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          className="absolute left-0 top-0 z-10 flex h-full w-14 items-center justify-center text-3xl text-white/50 hover:text-white disabled:opacity-0"
        >
          ‹
        </button>

        <div className="min-w-0 flex-1">
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
            <ZoomableImage key={post.id} src={url} alt={`Post ${post.id}`} />
          )}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="absolute right-0 top-0 z-10 flex h-full w-14 items-center justify-center text-3xl text-white/50 hover:text-white disabled:opacity-0"
        >
          ›
        </button>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-[rgb(20,20,20)]/95 px-3 py-3 text-white">
          <section className="mb-4">
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">Info</h2>
            <InfoPanel post={post} />
          </section>
          <section>
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">Tags</h2>
            <TagsPanel
              post={post}
              highlightedTags={highlightedTags}
              onSearchTag={onSearchTag}
              onAddTagToSearch={onAddTagToSearch}
              onExcludeTag={onExcludeTag}
              onBlacklistTag={onBlacklistTag}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
