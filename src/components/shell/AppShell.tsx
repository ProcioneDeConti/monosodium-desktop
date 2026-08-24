import { useEffect, type ReactNode } from "react";
import { SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { SearchBar } from "../SearchBar/SearchBar";
import {
  MAX_THUMBNAIL_SIZE_PX,
  MIN_THUMBNAIL_SIZE_PX,
  useSettingsStore,
} from "../../state/settingsStore";
import { useHealthCheck } from "../../queries/useHealthCheck";

interface AppShellProps {
  activeQuery: string;
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  onOpenFavorites: (() => void) | null;
  children: ReactNode;
}

export function AppShell({
  activeQuery,
  onSearch,
  onOpenSettings,
  onOpenFavorites,
  children,
}: AppShellProps) {
  const site = useSettingsStore((s) => s.site);
  const setSite = useSettingsStore((s) => s.setSite);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const setGridThumbnailSizePx = useSettingsStore((s) => s.setGridThumbnailSizePx);

  function toggleSite() {
    setSite(site === "e621" ? "e6ai" : "e621");
  }

  const health = useHealthCheck(site);
  const healthColor =
    health.status === "error" ? "bg-red-500" : health.status === "success" ? "bg-green-500" : "bg-amber-400";
  const healthTitle =
    health.status === "error"
      ? `${SITE_DISPLAY_NAME[site]} unreachable: ${(health.error as Error)?.message ?? "unknown error"}`
      : health.status === "success"
        ? `${SITE_DISPLAY_NAME[site]} reachable`
        : `Checking ${SITE_DISPLAY_NAME[site]}…`;

  // "/" focuses the search box from anywhere, unless the user is already typing somewhere else.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const active = document.activeElement;
      const isEditing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (isEditing) return;
      e.preventDefault();
      document.getElementById("post-search-input")?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header
        data-tauri-drag-region
        className="flex items-center gap-3 border-b border-black/10 dark:border-white/10 px-3 py-2 shrink-0"
      >
        <span className="select-none text-sm font-semibold tracking-tight opacity-80 pr-1">
          e621 Desktop
        </span>

        <SearchBar site={site as Site} activeQuery={activeQuery} onSearch={onSearch} />

        <button
          type="button"
          onClick={toggleSite}
          title={`Switch active site · ${healthTitle}`}
          className="shrink-0 flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                     bg-white/60 dark:bg-black/30 px-2.5 py-1.5 text-xs font-semibold hover:bg-[rgb(var(--accent))]/15"
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthColor}`} />
          {SITE_DISPLAY_NAME[site]}
        </button>

        <button
          type="button"
          onClick={onOpenFavorites ?? undefined}
          disabled={!onOpenFavorites}
          title={onOpenFavorites ? "Your favorites" : "Sign in (Settings) to view favorites"}
          className="shrink-0 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                     bg-white/60 dark:bg-black/30 px-2.5 py-1.5 text-xs font-semibold hover:bg-[rgb(var(--accent))]/15 disabled:opacity-40"
        >
          ♥ Favorites
        </button>

        <div className="hidden sm:flex items-center gap-1.5 shrink-0" title="Thumbnail size">
          <span className="text-xs opacity-60">Size</span>
          <input
            type="range"
            min={MIN_THUMBNAIL_SIZE_PX}
            max={MAX_THUMBNAIL_SIZE_PX}
            step={10}
            value={thumbnailSizePx}
            onChange={(e) => setGridThumbnailSizePx(Number(e.target.value))}
            className="w-24 accent-[rgb(var(--accent))]"
          />
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className="shrink-0 rounded-[var(--radius-sm)] px-2 py-1.5 text-base hover:bg-black/5 dark:hover:bg-white/10"
        >
          ⚙
        </button>
      </header>

      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
