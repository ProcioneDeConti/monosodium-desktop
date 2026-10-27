import { useEffect, type RefObject } from "react";

/** Chromium keeps a detached <video>'s decoder and buffered media alive until GC gets round to
 *  the element, which can be a long time when nothing else is allocating - so flicking through
 *  videos in the viewer (or hovering across the grid) stacked up hundreds of MB. Explicitly
 *  pausing, dropping the src, and calling load() tears the media pipeline down immediately. */
export function useReleaseVideo(ref: RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    const video = ref.current;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [ref]);
}
