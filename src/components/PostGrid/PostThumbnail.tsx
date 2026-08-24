import { useState } from "react";
import { Film, Star } from "lucide-react";
import { aspectRatio, isAnimated, isVideo, type Post } from "../../models/post";
import { formatCount } from "../../lib/formatCount";

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

/** Matches the reference Android app's ui/theme/Color.kt (RatingSafe/Questionable/Explicit). */
const RATING_STYLE: Record<string, { label: string; color: string }> = {
  s: { label: "S", color: "#4CAF50" },
  q: { label: "Q", color: "#FFA726" },
  e: { label: "E", color: "#E53935" },
};

const FAVORITE_GOLD = "#D4AF37";

/** URLs that have already faded in once this session - outside component state because
 *  `masonic` unmounts thumbnails that scroll past its overscan window and remounts them when
 *  they scroll back into view, which would otherwise reset `loaded` to false and replay the
 *  skeleton/fade-in on every scroll pass even though the browser already has the image cached
 *  (the actual cause of the flicker; the image itself loads instantly from cache, only the
 *  from-scratch fade animation was visible). */
const loadedThumbUrls = new Set<string>();

export function PostThumbnail({ post, blacklisted, onClick }: PostThumbnailProps) {
  const thumbUrl = post.preview.url ?? post.sample.url ?? post.file.url;
  const rating = RATING_STYLE[post.rating] ?? RATING_STYLE.e;
  const [loaded, setLoaded] = useState(() => !!thumbUrl && loadedThumbUrls.has(thumbUrl));
  const [errored, setErrored] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ aspectRatio: aspectRatio(post) }}
      className={`group relative block w-full overflow-hidden rounded-[var(--radius-md)] border
                  bg-black/5 dark:bg-white/5 transition-shadow duration-150
                  hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]
                  ${blacklisted ? "caution-stripe" : "border-black/5 dark:border-white/10"}`}
    >
      {thumbUrl && !errored ? (
        <>
          {!loaded && <div className="absolute inset-0 skeleton-shimmer" />}
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            draggable={false}
            onLoad={() => {
              setLoaded(true);
              if (thumbUrl) loadedThumbUrls.add(thumbUrl);
            }}
            onError={() => setErrored(true)}
            className={`h-full w-full object-cover transition-[opacity,transform] duration-300
                        group-hover:scale-[1.03] ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs opacity-50">
          unavailable
        </div>
      )}

      {/* Always-visible info dock, mirroring the reference app's PostThumbnail InfoDock: rating
       *  anchors the left edge and filetype the right, with score and the favorite star between -
       *  replaces a separate rating badge and play/gif corner overlay, which read as inconsistent
       *  and easy to miss. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1.5 py-1">
        <span
          className="rounded-sm px-1 py-0.5 text-[10px] font-bold leading-none text-white"
          style={{ backgroundColor: `${rating.color}D9` }}
        >
          {rating.label}
        </span>
        <span className="text-[11px] font-bold leading-none text-white">
          Score: {formatCount(post.score.total)}
        </span>
        {post.is_favorited && <Star size={12} className="shrink-0 fill-current" style={{ color: FAVORITE_GOLD }} />}
        <span className="text-[10px] font-medium leading-none text-white/85">
          {post.file.ext.toUpperCase()}
        </span>
      </div>

      {isAnimated(post) && (
        <span
          className={`pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 rounded-[7px]
                      bg-black/55 text-white ${isVideo(post) && post.duration ? "px-1.5 py-1" : "h-5 w-5 justify-center"}`}
        >
          <Film size={13} />
          {isVideo(post) && post.duration && (
            <span className="text-[10px] font-semibold tabular-nums leading-none">
              {formatDuration(post.duration)}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
