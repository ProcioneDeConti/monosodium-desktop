import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** OS-level fullscreen toggle for the current window (not the browser Fullscreen API - Tauri
 *  windows aren't in a document that supports it). `onResized` fires on the fullscreen
 *  transition too, which is how a fullscreen toggled from outside the app (or exited via the OS)
 *  gets reflected back here. */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void w.isFullscreen().then(setIsFullscreen).catch(() => {});
    void w
      .onResized(() => {
        void w.isFullscreen().then(setIsFullscreen).catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  const toggle = useCallback(async () => {
    const w = getCurrentWindow();
    const next = !(await w.isFullscreen().catch(() => false));
    await w.setFullscreen(next).catch(() => {});
    setIsFullscreen(next);
  }, []);

  return { isFullscreen, toggle };
}
