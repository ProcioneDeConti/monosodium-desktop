import { memo, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Post } from "../../models/post";

/** How many posts either side of the current one to render - the strip is a window onto the
 *  (potentially thousands-long) result list, not the whole thing. */
const WINDOW = 30;
const THUMB_H = 64;

/** Session-only collapsed state, shared across viewer opens (not worth a persisted setting). */
let collapsedPref = false;

interface FilmstripProps {
  posts: Post[];
  index: number;
  onSelect: (index: number) => void;
}

/** Horizontal strip of neighbouring thumbnails under the viewer's media - jump around the result
 *  list without closing the viewer. Thumbnails are the same CDN `preview` URLs the grid already
 *  loaded, so they come straight from the browser cache. */
function FilmstripImpl({ posts, index, onSelect }: FilmstripProps) {
  const [collapsed, setCollapsed] = useState(collapsedPref);
  const activeRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const start = Math.max(0, index - WINDOW);
  const end = Math.min(posts.length, index + WINDOW + 1);

  useEffect(() => {
    // Scroll only the strip itself - `scrollIntoView` also scrolls every scrollable ancestor,
    // which can shift the app's layout underneath the viewer overlay.
    const strip = stripRef.current;
    const active = activeRef.current;
    if (!strip || !active) return;
    strip.scrollTo({
      left: active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2,
      behavior: "smooth",
    });
  }, [index, collapsed]);

  function toggle() {
    collapsedPref = !collapsed;
    setCollapsed(collapsedPref);
  }

  return (
    <div className="relative shrink-0 border-t border-white/10 bg-black/60">
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? "Show filmstrip" : "Hide filmstrip"}
        className="absolute -top-6 left-1/2 z-10 flex h-6 w-10 -translate-x-1/2 items-center justify-center
                   rounded-t-md bg-black/60 text-white/70 hover:text-white"
      >
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {!collapsed && (
        <div ref={stripRef} className="relative flex gap-1.5 overflow-x-auto px-2 py-2 [scrollbar-width:thin]">
          {posts.slice(start, end).map((p, i) => {
            const at = start + i;
            const active = at === index;
            const src = p.preview.url ?? p.sample.url;
            const ratio = p.preview.width && p.preview.height ? p.preview.width / p.preview.height : 1;
            return (
              <button
                key={p.id}
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => onSelect(at)}
                title={`#${p.id}`}
                style={{ height: THUMB_H, width: Math.round(THUMB_H * Math.min(2, Math.max(0.5, ratio))) }}
                className={`shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-white/5 transition-opacity ${
                  active
                    ? "opacity-100 ring-2 ring-[rgb(var(--accent))]"
                    : "opacity-55 hover:opacity-100"
                }`}
              >
                {src && <img src={src} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const Filmstrip = memo(FilmstripImpl);
