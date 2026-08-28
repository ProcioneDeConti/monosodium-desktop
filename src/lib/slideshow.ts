/** Shared constants/types for the post-viewer slideshow (PostViewer.tsx / AppShell.tsx). Not
 *  ported from the reference Android app - this is desktop-only. */

export type SlideshowTransition = "fade" | "slide" | "zoom" | "none";

export const SLIDESHOW_TRANSITIONS: { value: SlideshowTransition; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "zoom", label: "Zoom" },
  { value: "none", label: "None" },
];

export const MIN_SLIDESHOW_INTERVAL_SEC = 1;
export const MAX_SLIDESHOW_INTERVAL_SEC = 60;
export const DEFAULT_SLIDESHOW_INTERVAL_SEC = 5;
export const DEFAULT_SLIDESHOW_TRANSITION: SlideshowTransition = "fade";
export const DEFAULT_SLIDESHOW_SHUFFLE = false;

export function clampSlideshowInterval(seconds: number): number {
  return Math.min(MAX_SLIDESHOW_INTERVAL_SEC, Math.max(MIN_SLIDESHOW_INTERVAL_SEC, Math.round(seconds)));
}
