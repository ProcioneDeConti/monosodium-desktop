import { useEffect, useRef, useState } from "react";

interface ZoomableImageProps {
  src: string;
  alt: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/** Wheel-to-zoom (anchored under the cursor) + drag-to-pan image viewer, desktop's answer to the
 *  reference app's pinch/spread. Resets whenever `src` changes (navigating to another post). */
export function ZoomableImage({ src, alt }: ZoomableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [src]);

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
    const { startX, startY, originX, originY } = dragState.current;
    setOffset({ x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) });
  }

  function endDrag() {
    dragState.current = null;
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
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: dragState.current ? "none" : "transform 80ms ease-out",
        }}
      />
    </div>
  );
}
