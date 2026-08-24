import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import type { Post } from "../../models/post";
import { downloadFileName, isDeleted, isVideo, playableUrl } from "../../models/post";
import type { Site } from "../../models/site";
import { ZoomableImage } from "./ZoomableImage";
import { VideoPlayer } from "./VideoPlayer";
import { TagsPanel } from "./TagsPanel";
import { InfoPanel } from "./InfoPanel";
import { usePostMutations } from "../../queries/usePostMutations";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { matchingBlacklistTags, type BlacklistEntries } from "../../lib/blacklist";
import { e621Api } from "../../api/client";
import { IconButton } from "../ui/IconButton";

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
}: PostViewerProps) {
  const post = posts[index];
  const isAuthenticated = useAccountStore((s) => s.isAuthenticated(site));
  const { vote, favorite, unfavorite } = usePostMutations(site);
  const videoLoopEnabled = useSettingsStore((s) => s.videoLoopEnabled);
  const videoPlaybackSpeed = useSettingsStore((s) => s.videoPlaybackSpeed);
  const videoAutoplayEnabled = useSettingsStore((s) => s.videoAutoplayEnabled);
  const downloadDir = useSettingsStore((s) => s.downloadDir);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    setDownloadStatus("idle");
  }, [post?.id]);

  async function handleDownload() {
    if (!post) return;
    const fileUrl = playableUrl(post);
    if (!fileUrl) return;
    setDownloadStatus("saving");
    try {
      await e621Api.downloadPostFile(fileUrl, downloadFileName(post), downloadDir, isVideo(post));
      setDownloadStatus("saved");
      setTimeout(() => setDownloadStatus("idle"), 1500);
    } catch {
      setDownloadStatus("error");
      setTimeout(() => setDownloadStatus("idle"), 2000);
    }
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
  const deletedOrMissing = deleted || !url;
  const voteTitle = isAuthenticated ? undefined : "Sign in (Settings) to vote";
  const favTitle = isAuthenticated ? undefined : "Sign in (Settings) to favorite";

  return (
    <div className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-white">
        <IconButton tone="invert" onClick={onClose} title="Close (Esc)">
          <X size={18} />
        </IconButton>
        <span className="text-sm opacity-70">#{post.id}</span>

        <div className="ml-auto flex items-center gap-0.5 rounded-[var(--radius-md)] bg-white/5 p-0.5">
          <IconButton
            tone="invert"
            disabled={!isAuthenticated}
            title={voteTitle ?? "Upvote"}
            onClick={() => vote.mutate({ postId: post.id, direction: 1 })}
            className={post.vote_by > 0 ? "!text-green-400" : ""}
          >
            <ThumbsUp size={16} className={post.vote_by > 0 ? "fill-current" : ""} />
          </IconButton>
          <span className="min-w-7 text-center text-sm tabular-nums">{post.score.total}</span>
          <IconButton
            tone="invert"
            disabled={!isAuthenticated}
            title={voteTitle ?? "Downvote"}
            onClick={() => vote.mutate({ postId: post.id, direction: -1 })}
            className={post.vote_by < 0 ? "!text-red-400" : ""}
          >
            <ThumbsDown size={16} className={post.vote_by < 0 ? "fill-current" : ""} />
          </IconButton>
          <IconButton
            tone="invert"
            disabled={!isAuthenticated}
            title={favTitle ?? (post.is_favorited ? "Remove favorite" : "Add favorite")}
            onClick={() =>
              post.is_favorited ? unfavorite.mutate(post.id) : favorite.mutate(post.id)
            }
            className={post.is_favorited ? "!text-pink-400" : ""}
          >
            <Heart size={16} className={post.is_favorited ? "fill-current" : ""} />
          </IconButton>
          <IconButton
            tone="invert"
            disabled={downloadStatus === "saving" || deletedOrMissing}
            title={
              downloadStatus === "saved"
                ? "Saved"
                : downloadStatus === "error"
                  ? "Download failed"
                  : "Download original file"
            }
            onClick={() => void handleDownload()}
            className={downloadStatus === "saved" ? "!text-green-400" : downloadStatus === "error" ? "!text-red-400" : ""}
          >
            {downloadStatus === "saved" ? <Check size={16} /> : <Download size={16} />}
          </IconButton>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <IconButton
          tone="invert"
          onClick={goPrev}
          disabled={!canGoPrev}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-black/30 disabled:opacity-0"
        >
          <ChevronLeft size={22} />
        </IconButton>

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

        <IconButton
          tone="invert"
          onClick={goNext}
          disabled={!canGoNext}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-black/30 disabled:opacity-0"
        >
          <ChevronRight size={22} />
        </IconButton>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-[rgb(20,20,20)]/95 px-3 py-3 text-white">
          <section className="mb-4">
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">Info</h2>
            <InfoPanel post={post} onOpenProfile={onOpenProfile} />
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
