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
