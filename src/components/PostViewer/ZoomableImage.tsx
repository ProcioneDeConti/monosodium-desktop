import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PostNote } from "../../models/note";
import type { Site } from "../../models/site";
import { DText } from "../ui/DText";
import { Spinner } from "../ui/Spinner";

interface ZoomableImageProps {
  src: string;
  alt: string;
  site: Site;
  notes?: PostNote[];
  /** The post's original full-size dimensions - the coordinate space PostNote's x/y/width/height
   *  are defined in, regardless of what resolution `src` actually is. */
  imageWidth?: number;
  imageHeight?: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/** Wheel-to-zoom (anchored under the cursor) + drag-to-pan image viewer, desktop's answer to the
 *  reference app's pinch/spread. Resets whenever `src` changes (navigating to another post). */
export function ZoomableImage({ src, alt, site, notes, imageWidth, imageHeight }: ZoomableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [imgRect, setImgRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );
  // Pan updates are coalesced to one setOffset per frame - a fast drag fires several mousemove
  // events between paints, and each state update re-renders this component (and, with notes, a
  // getBoundingClientRect pass).
  const dragRaf = useRef<number | null>(null);
  const pendingMouse = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setLoaded(false);
    setImgRect(null);
  }, [src]);

  useEffect(() => () => {
    if (dragRaf.current != null) cancelAnimationFrame(dragRaf.current);
  }, []);

  // Tracks the image's actual on-screen box (already reflecting the pan/zoom transform below,
  // since getBoundingClientRect() reports the post-transform box) so note overlays can be
  // positioned in plain screen pixels without duplicating the transform math - see NoteOverlay.
  // Only runs when there are notes to place: otherwise this fired two getBoundingClientRect()s
  // per zoom/pan frame on every image for nothing (the overwhelming majority have no notes).
  const hasNotes = !!notes && notes.length > 0;
  useLayoutEffect(() => {
    if (!loaded || !hasNotes) return;
    function measure() {
      const img = imgRef.current;
      const container = containerRef.current;
      if (!img || !container) return;
      const imgBox = img.getBoundingClientRect();
      const containerBox = container.getBoundingClientRect();
      setImgRect({
        left: imgBox.left - containerBox.left,
        top: imgBox.top - containerBox.top,
        width: imgBox.width,
        height: imgBox.height,
      });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [loaded, hasNotes, scale, offset]);

  function clampScale(next: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
  }

  function zoomAt(clientX: number, clientY: number, nextScale: number) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    setOffset((prev) => {
      const ratio = nextScale / scale;
      return {
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
    setScale(nextScale);
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const delta = -e.deltaY * 0.0018;
    const next = clampScale(scale * (1 + delta));
    zoomAt(e.clientX, e.clientY, next);
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (scale > 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      zoomAt(e.clientX, e.clientY, 2.5);
    }
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (scale <= 1) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    pendingMouse.current = { x: e.clientX, y: e.clientY };
    if (dragRaf.current != null) return;
    dragRaf.current = requestAnimationFrame(() => {
      dragRaf.current = null;
      const d = dragState.current;
      const m = pendingMouse.current;
      if (!d || !m) return;
      setOffset({ x: d.originX + (m.x - d.startX), y: d.originY + (m.y - d.startY) });
    });
  }

  function endDrag() {
    const d = dragState.current;
    dragState.current = null;
    if (dragRaf.current != null) {
      cancelAnimationFrame(dragRaf.current);
      dragRaf.current = null;
    }
    // Commit the final mouse position so the image doesn't snap back the last sub-frame of drag.
    const m = pendingMouse.current;
    if (d && m) setOffset({ x: d.originX + (m.x - d.startX), y: d.originY + (m.y - d.startY) });
    pendingMouse.current = null;
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden select-none"
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      style={{ cursor: scale > 1 ? (dragState.current ? "grabbing" : "grab") : "default" }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size={28} className="text-white/70" />
        </div>
      )}

      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`max-h-full max-w-full object-contain ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: dragState.current ? "none" : "transform 80ms ease-out, opacity 200ms ease-out",
        }}
      />

      {loaded && imgRect && notes && notes.length > 0 && imageWidth && imageHeight && (
        <div className="pointer-events-none absolute inset-0">
          {notes.map((note, i) => (
            <NoteOverlay
              key={note.id}
              index={i + 1}
              note={note}
              site={site}
              scaleX={imgRect.width / imageWidth}
              scaleY={imgRect.height / imageHeight}
              offsetLeft={imgRect.left}
              offsetTop={imgRect.top}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteOverlay({
  index,
  note,
  site,
  scaleX,
  scaleY,
  offsetLeft,
  offsetTop,
}: {
  index: number;
  note: PostNote;
  site: Site;
  scaleX: number;
  scaleY: number;
  offsetLeft: number;
  offsetTop: number;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((v) => !v);
      }}
      className="pointer-events-auto absolute cursor-pointer border-2 border-yellow-400/80 bg-yellow-400/10
                 transition-colors hover:bg-yellow-400/25"
      style={{
        left: offsetLeft + note.x * scaleX,
        top: offsetTop + note.y * scaleY,
        width: note.width * scaleX,
        height: note.height * scaleY,
      }}
    >
      <span className="absolute -left-0.5 -top-0.5 -translate-y-full rounded-t bg-yellow-400 px-1 text-[10px] font-bold text-black">
        {index}
      </span>
      {revealed && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-10 mt-1 w-56 max-w-[80vw] rounded-[var(--radius-sm)]
                     border border-white/10 bg-black/90 p-2 text-xs text-white shadow-xl"
        >
          <DText text={note.body} site={site} className="leading-relaxed" />
        </div>
      )}
    </div>
  );
}
