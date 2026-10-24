import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SITE_DISPLAY_NAME } from "../../models/site";
import { useSettingsStore } from "../../state/settingsStore";
import { useFullscreen } from "../../lib/useFullscreen";

interface WindowFrameProps {
  /** Title bar text. Omitted = the main window's "Monosodium Desktop · <site>". */
  title?: string;
  children: ReactNode;
}

/** The window is frameless (`decorations: false` in tauri.conf.json / lib/postWindow.ts), so this
 *  draws the title bar: macOS-style traffic-light controls on the left, a drag region (double-click
 *  maximizes - Tauri handles that for `data-tauri-drag-region`), and the optional ambient accent
 *  wash (Settings > Appearance).
 *
 *  The many `fixed inset-0` overlays (viewer, sheets, dialogs) are pushed down by `--titlebar-h`
 *  (index.css) so they never cover the window controls - simpler than making a wrapper their
 *  containing block, which shifts every getBoundingClientRect()-positioned fixed element.
 *  Hidden while fullscreen (F11). */
const TITLEBAR_PX = 30;

export function WindowFrame({ title, children }: WindowFrameProps) {
  const site = useSettingsStore((s) => s.site);
  const ambient = useSettingsStore((s) => s.ambientHeader);
  const { isFullscreen } = useFullscreen();
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload }) => setFocused(payload));
    return () => void unlisten.then((f) => f());
  }, []);

  // Full-window overlays start below the title bar (index.css `.fixed.inset-0` rule).
  useEffect(() => {
    document.documentElement.style.setProperty("--titlebar-h", isFullscreen ? "0px" : `${TITLEBAR_PX}px`);
  }, [isFullscreen]);

  const text = title ?? `Monosodium Desktop · ${SITE_DISPLAY_NAME[site]}`;

  return (
    <div className="flex h-full flex-col">
      {!isFullscreen && (
        <div
          data-tauri-drag-region
          style={{ height: TITLEBAR_PX }}
          className={`titlebar relative flex shrink-0 select-none items-center
                      border-b border-black/10 dark:border-white/[0.07] ${ambient ? "titlebar-ambient" : ""}
                      ${focused ? "" : "titlebar-blurred"}`}
        >
          <TrafficLights />
          <span
            data-tauri-drag-region
            className="pointer-events-none absolute inset-x-24 truncate text-center text-xs font-medium opacity-60"
          >
            {text}
          </span>
        </div>
      )}
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

function TrafficLights() {
  const win = getCurrentWindow();
  return (
    <div className="traffic-lights relative z-10 ml-3 flex gap-2">
      <button
        type="button"
        className="light light-close"
        title="Close"
        aria-label="Close"
        onClick={() => void win.close()}
      />
      <button
        type="button"
        className="light light-min"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => void win.minimize()}
      />
      <button
        type="button"
        className="light light-max"
        title="Maximize"
        aria-label="Maximize"
        onClick={() => void win.toggleMaximize()}
      />
    </div>
  );
}

