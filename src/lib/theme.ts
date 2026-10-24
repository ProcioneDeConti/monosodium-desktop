import { flushSync } from "react-dom";

// Theme override (Settings > Appearance). "system" follows the OS via prefers-color-scheme;
// "light"/"dark" force it. We always resolve to a concrete light/dark and stamp it as
// `data-theme` on <html> - index.css's `dark` custom-variant and the plain-CSS body rules key
// off that (with a prefers-color-scheme fallback for the pre-boot frame).

export type ThemeMode = "system" | "light" | "dark";

export const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];

const LS_KEY = "themeMode";

/** Best-effort synchronous read for main.tsx's pre-render call, so a forced theme doesn't flash
 *  the OS one before the settings store hydrates. Mirrors what settingsStore persists. */
export function cachedThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode / disabled storage - fall through */
  }
  return "system";
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

/** Applies the mode now and returns a cleanup for the OS-change listener (only meaningful for
 *  "system", but always safe to call). */
export function applyTheme(mode: ThemeMode): () => void {
  const set = () => {
    const effective = resolveTheme(mode);
    document.documentElement.dataset.theme = effective;
    document.documentElement.style.colorScheme = effective;
  };
  set();
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {
    /* ignore */
  }
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (mode === "system") set();
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

// ---------- Palettes, motion, overlay depth (Settings > Appearance) ----------

/** Surface palette - sets the --lt-* / --dk-* surface variables in index.css. Independent of the
 *  light/dark mode; most presets only restyle the dark surfaces (warm also tints light). */
export type Palette = "default" | "navy" | "oled" | "warm";

export const PALETTES: { value: Palette; label: string }[] = [
  { value: "default", label: "Neutral" },
  { value: "navy", label: "e621 navy" },
  { value: "oled", label: "OLED black" },
  { value: "warm", label: "Warm" },
];

export function applyPalette(palette: Palette): void {
  if (palette === "default") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
}

/** "system" follows Windows' "Animation effects" setting (prefers-reduced-motion). */
export type MotionMode = "system" | "full" | "reduced";

export const MOTION_MODES: { value: MotionMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "full", label: "Full" },
  { value: "reduced", label: "Reduced" },
];

/** Stamps `data-motion="reduced"` on <html> when motion should be cut (index.css then collapses
 *  every animation/transition). Returns a cleanup for the OS-change listener. */
export function applyMotion(mode: MotionMode): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const set = () => {
    const reduced = mode === "reduced" || (mode === "system" && mq.matches);
    if (reduced) document.documentElement.dataset.motion = "reduced";
    else delete document.documentElement.dataset.motion;
  };
  set();
  mq.addEventListener("change", set);
  return () => mq.removeEventListener("change", set);
}

/** For JS-driven effects (view transitions, count-ups, particle bursts) that CSS can't cut. */
export function motionReduced(): boolean {
  return document.documentElement.dataset.motion === "reduced";
}

let overlayDepth = 0;

/** Called by Overlay (sheet/dialog) and the post viewer on mount: while any is open, the shell
 *  behind it (`.depth-recede`) shrinks and dims slightly. Returns the release. */
export function pushOverlayDepth(): () => void {
  overlayDepth += 1;
  document.documentElement.dataset.overlay = "";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    overlayDepth = Math.max(0, overlayDepth - 1);
    if (overlayDepth === 0) delete document.documentElement.dataset.overlay;
  };
}

/** The shared element name for the thumbnail <-> viewer morph. Exactly one element may carry it
 *  per snapshot, so it's applied imperatively just around a transition, never left in markup. */
export const MORPH_NAME = "post-media";

/** Runs a React state update inside a View Transition when supported and motion is allowed (the
 *  thumbnail <-> viewer morph); otherwise just runs it. `after` runs once the transition finishes
 *  (or immediately when skipped) - for clearing temporary view-transition-names. */
export function withViewTransition(update: () => void, after?: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (!doc.startViewTransition || motionReduced()) {
    update();
    after?.();
    return;
  }
  // React must commit inside the callback for the API to snapshot the "after" state.
  const t = doc.startViewTransition(() => flushSync(update));
  if (after) void t.finished.finally(after);
}

/** Tags/untags an element as the morph's shared element. */
export function setMorph(el: HTMLElement | null | undefined, on: boolean): void {
  if (el) el.style.viewTransitionName = on ? MORPH_NAME : "";
}
