import { isAnimated, isVideo, type Post } from "../../models/post";

interface PostThumbnailProps {
  post: Post;
  blacklisted: boolean;
  onClick: () => void;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PostThumbnail({ post, blacklisted, onClick }: PostThumbnailProps) {
  const thumbUrl = post.preview.url ?? post.sample.url ?? post.file.url;
  const video = isVideo(post);
  const animated = isAnimated(post);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative block w-full overflow-hidden rounded-[var(--radius-md)] border
                  bg-black/5 dark:bg-white/5 aspect-square
                  ${blacklisted ? "caution-stripe" : "border-black/5 dark:border-white/10"}`}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs opacity-50">
          unavailable
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
        <span>▲ {post.score.total}</span>
        {post.is_favorited && <span>♥</span>}
      </div>

      {video && (
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-semibold text-white">
          {post.duration ? formatDuration(post.duration) : "▶"}
        </span>
      )}
      {!video && animated && (
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-semibold text-white">
          GIF
        </span>
      )}
      {post.rating !== "s" && (
        <span
          className={`pointer-events-none absolute left-1 top-1 rounded px-1 py-0.5 text-[10px] font-bold text-white ${
            post.rating === "e" ? "bg-red-600/85" : "bg-amber-500/85"
          }`}
        >
          {post.rating.toUpperCase()}
        </span>
      )}
    </button>
  );
}
