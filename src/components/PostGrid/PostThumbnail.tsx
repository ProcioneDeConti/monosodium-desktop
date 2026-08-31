import { Fragment, memo, useEffect, useState } from "react";
import {
  ArrowBigUp,
  Check,
  Clapperboard,
  Download,
  Heart,
  Image as ImageIcon,
  ImagePlay,
  Star,
  ThumbsUp,
} from "lucide-react";
import { aspectRatio, isAnimated, isVideo, type Post } from "../../models/post";
import { artistNames, formatArtists } from "../../lib/artistTags";
import { formatCount } from "../../lib/formatCount";
import { Spinner } from "../ui/Spinner";

interface PostThumbnailProps {
  post: Post;
  blacklisted: boolean;
  /** Gets the raw event so PostGrid can branch on modifier keys (ctrl/shift = select). */
  onClick: (e: React.MouseEvent) => void;
  /** When false, the hover cluster shows only Download (favourite/vote need an account). */
  canInteract: boolean;
  /** Resolve/reject once e621 responds - drives the in-flight spinner on the hover button. */
  onToggleFavorite: (post: Post) => Promise<unknown>;
  onUpvote: (post: Post) => Promise<unknown>;
  /** Resolves once the file is written (or rejects) - drives the transient check/✗ state. */
  onDownload: (post: Post) => Promise<unknown>;
  /** Multi-select: show a checkbox instead of the hover cluster, and click = toggle select. */
  selectionActive?: boolean;
  selected?: boolean;
  /** Target column width (the thumbnail-size slider). Drives how many info fields the hover bar
   *  shows before it would clip. */
  cellWidthPx?: number;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Rating chip colours - safe green / questionable orange / explicit red, roughly the reference
 *  Android app's ui/theme/Color.kt but with a deeper orange so white text on the "Q" chip has
 *  usable contrast. */
const RATING_STYLE: Record<string, { label: string; color: string }> = {
  s: { label: "S", color: "#4CAF50" },
  q: { label: "Q", color: "#E06C0A" },
  e: { label: "E", color: "#E53935" },
};

const FAVORITE_GOLD = "#D4AF37";

/** The media-kind glyph shown in the top-right status cluster: clapperboard for video, an
 *  image-with-play for animated stills (gif/apng), a plain image frame for static pictures. */
function mediaKindOf(post: Post) {
  if (isVideo(post)) return { Icon: Clapperboard, label: "Video" };
  if (isAnimated(post)) return { Icon: ImagePlay, label: "Animated image" };
  return { Icon: ImageIcon, label: "Image" };
}


/** URLs that have already faded in once this session - outside component state because
 *  `masonic` unmounts thumbnails that scroll past its overscan window and remounts them when
 *  they scroll back into view, which would otherwise reset `loaded` to false and replay the
 *  skeleton/fade-in on every scroll pass even though the browser already has the image cached
 *  (the actual cause of the flicker; the image itself loads instantly from cache, only the
 *  from-scratch fade animation was visible). */
const loadedThumbUrls = new Set<string>();

function PostThumbnailImpl({
  post,
  blacklisted,
  onClick,
  canInteract,
  onToggleFavorite,
  onUpvote,
  onDownload,
  selectionActive = false,
  selected = false,
  cellWidthPx = 220,
}: PostThumbnailProps) {
  const thumbUrl = post.preview.url ?? post.sample.url ?? post.file.url;
  const rating = RATING_STYLE[post.rating] ?? RATING_STYLE.e;
  const mediaKind = mediaKindOf(post);
  const artistText = formatArtists(post);
  const artistLabel = artistNames(post).length > 1 ? "Artists" : "Artist";
  // Narrow cells can't fit the whole info row - drop the least-important fields first
  // (favourites, then id), keeping score + filetype.
  const showFavCount = cellWidthPx >= 200;
  const showId = cellWidthPx >= 160;
  const [loaded, setLoaded] = useState(() => !!thumbUrl && loadedThumbUrls.has(thumbUrl));
  const [errored, setErrored] = useState(false);
  // The hover action cluster is only mounted while the pointer is actually over this cell -
  // masonic keeps a couple of viewport-heights of cells mounted, so a permanently-mounted
  // (just visually hidden) cluster meant thousands of extra nodes + SVG icons resident.
  const [hovered, setHovered] = useState(false);
  const [dl, setDl] = useState<"idle" | "saving" | "done" | "err">("idle");
  const [favBusy, setFavBusy] = useState(false);
  const [voteBusy, setVoteBusy] = useState(false);

  useEffect(() => {
    if (dl !== "done" && dl !== "err") return;
    const t = setTimeout(() => setDl("idle"), 1600);
    return () => clearTimeout(t);
  }, [dl]);

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ aspectRatio: aspectRatio(post) }}
      className={`group relative block w-full overflow-hidden rounded-[var(--radius-md)] border
                  bg-black/5 dark:bg-white/5 transition-[box-shadow,transform] duration-200 ease-out
                  hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/25 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]
                  ${selected ? "ring-2 ring-[rgb(var(--accent))] ring-offset-1 ring-offset-transparent" : ""}
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
            className={`h-full w-full object-cover transition-[opacity,transform] duration-[250ms] ease-out
                        group-hover:scale-[1.02] ${loaded ? "opacity-100" : "opacity-0"}
                        ${selected ? "brightness-90" : ""}`}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs opacity-50">
          unavailable
        </div>
      )}

      {selectionActive ? (
        <span
          className={`pointer-events-none absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center
                      rounded-md border-2 ${
                        selected
                          ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-white"
                          : "border-white/80 bg-black/40"
                      }`}
        >
          {selected && <Check size={14} strokeWidth={3} />}
        </span>
      ) : hovered ? (
        /* Hover quick-actions - favourite / upvote / download without opening the viewer. Each
         *  swallows the click so it doesn't also open the post. Mounted only while hovered. */
        <div className="pointer-events-none absolute left-1.5 top-1.5 flex gap-1 animate-[fade-in_120ms_ease-out]">
          {canInteract && (
            <>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  stop(e);
                  if (favBusy) return;
                  setFavBusy(true);
                  onToggleFavorite(post)
                    .catch(() => {})
                    .finally(() => setFavBusy(false));
                }}
                title={post.is_favorited ? "Remove favorite" : "Add favorite"}
                className={`pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white
                            hover:bg-black/75 ${post.is_favorited ? "!text-pink-400" : ""}`}
              >
                {favBusy ? (
                  <Spinner size={13} />
                ) : (
                  <Heart size={13} className={post.is_favorited ? "fill-current" : ""} />
                )}
              </span>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  stop(e);
                  if (voteBusy) return;
                  setVoteBusy(true);
                  onUpvote(post)
                    .catch(() => {})
                    .finally(() => setVoteBusy(false));
                }}
                title="Upvote"
                className={`pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white
                            hover:bg-black/75 ${post.vote_by > 0 ? "!text-green-400" : ""}`}
              >
                {voteBusy ? (
                  <Spinner size={13} />
                ) : (
                  <ThumbsUp size={13} className={post.vote_by > 0 ? "fill-current" : ""} />
                )}
              </span>
            </>
          )}
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              stop(e);
              if (dl === "saving") return;
              setDl("saving");
              onDownload(post).then(
                () => setDl("done"),
                () => setDl("err"),
              );
            }}
            title={dl === "err" ? "Download failed" : dl === "done" ? "Queued" : "Download file"}
            className={`pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white
                        hover:bg-black/75 ${dl === "done" ? "!text-green-400" : dl === "err" ? "!text-red-400" : ""}
                        ${dl === "saving" ? "opacity-60" : ""}`}
          >
            {dl === "done" ? <Check size={13} /> : <Download size={13} />}
          </span>
        </div>
      ) : null}

      {/* Top-right status cluster. The div is anchored by its right edge, so the media chip and
       *  rating chip never move - the favourite star (shown only when favourited) grows the
       *  cluster leftward. Matching 15px-tall chips. */}
      <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1">
        {post.is_favorited && (
          <span className="flex h-[15px] w-[15px] items-center justify-center rounded-[2px] bg-black/60">
            <Star size={10} strokeWidth={2.25} className="fill-current" style={{ color: FAVORITE_GOLD }} />
          </span>
        )}
        <span
          className="flex h-[15px] w-[15px] items-center justify-center rounded-[2px] text-[10px] font-bold leading-none text-white"
          style={{ backgroundColor: rating.color }}
        >
          {rating.label}
        </span>
        <span
          className={`flex h-[15px] items-center justify-center rounded-[2px] bg-black/60 text-white ${
            isVideo(post) && post.duration ? "gap-0.5 px-1" : "w-[15px]"
          }`}
          title={mediaKind.label}
        >
          <mediaKind.Icon size={10} strokeWidth={2.25} />
          {isVideo(post) && post.duration && (
            <span className="text-[9px] font-semibold tabular-nums leading-none">
              {formatDuration(post.duration)}
            </span>
          )}
        </span>
      </div>

      {/* Bottom overlay - hidden until hover. An "Artist: …" line (real artist tags only, e621's
       *  warning/DNP tags in the artist category stripped) sits above the stats bar:
       *  id · score · favourites · filetype, spread full-width with a hairline rule centred in
       *  each gap. Stats fields drop from the right on narrow cells (see showId / showFavCount). */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 overflow-hidden
                   bg-gradient-to-t from-black/90 via-black/60 to-transparent
                   px-1.5 pb-1.5 pt-8 text-[10px] font-semibold leading-none text-white
                   opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        {artistText && (
          // Flip `text-center` <-> `text-left` here to change the artist line's justification.
          <div className="truncate text-center">
            <span className="font-medium opacity-55">{artistLabel}: </span>
            <span className="opacity-95">{artistText}</span>
          </div>
        )}
        <div className="flex items-end gap-0.5 whitespace-nowrap">
          {[
            showId && (
              <span key="id" className="opacity-75">
                #{post.id}
              </span>
            ),
            <span key="score" className="flex items-center gap-0.5">
              <ArrowBigUp size={12} className="-ml-0.5 fill-current opacity-90" />
              {formatCount(post.score.total)}
            </span>,
            showFavCount && (
              <span key="fav" className="flex items-center gap-0.5">
                <Heart size={9} className="fill-current opacity-90" />
                {formatCount(post.fav_count)}
              </span>
            ),
            <span key="ext" className="opacity-85">
              {post.file.ext.toUpperCase()}
            </span>,
          ]
            .filter(Boolean)
            .map((field, i) => (
              <Fragment key={i}>
                {i > 0 && (
                  <span className="flex flex-1 items-center justify-center">
                    <span className="h-2.5 w-px bg-white/30" />
                  </span>
                )}
                {field}
              </Fragment>
            ))}
        </div>
      </div>
    </button>
  );
}

/** `masonic` mounts/unmounts cells as they scroll through the overscan window and re-renders the
 *  visible set on every grid state change; memoising keeps a thumbnail whose props are unchanged
 *  from repainting its whole subtree each pass. */
export const PostThumbnail = memo(PostThumbnailImpl);
