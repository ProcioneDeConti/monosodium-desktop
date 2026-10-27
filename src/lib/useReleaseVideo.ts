import { useEffect, type RefObject } from "react";

/** Chromium keeps a detached <video>'s decoder and buffered media alive until GC gets round to
 *  the element, which can be a long time when nothing else is allocating - so flicking through
 *  videos in the viewer (or hovering across the grid) stacked up hundreds of MB. Explicitly
 *  pausing, dropping the src, and calling load() tears the media pipeline down immediately.
 *
 *  The setup re-applies `src` because StrictMode (dev) runs cleanup + setup on a still-mounted
 *  element: React won't re-set an unchanged prop, so without this the player is left sourceless. */
export function useReleaseVideo(ref: RefObject<HTMLVideoElement | null>, src: string) {
  useEffect(() => {
    const video = ref.current;
    if (video && video.getAttribute("src") !== src) video.src = src;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [ref, src]);
}
