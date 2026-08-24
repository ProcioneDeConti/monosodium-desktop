import type { ReactNode } from "react";
import { SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { SearchBar } from "../SearchBar/SearchBar";
import {
  MAX_THUMBNAIL_SIZE_PX,
  MIN_THUMBNAIL_SIZE_PX,
  useSettingsStore,
} from "../../state/settingsStore";

interface AppShellProps {
  activeQuery: string;
  onSearch: (query: string) => void;
  children: ReactNode;
}

export function AppShell({ activeQuery, onSearch, children }: AppShellProps) {
  const site = useSettingsStore((s) => s.site);
  const setSite = useSettingsStore((s) => s.setSite);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const setGridThumbnailSizePx = useSettingsStore((s) => s.setGridThumbnailSizePx);

  function toggleSite() {
    setSite(site === "e621" ? "e6ai" : "e621");
  }

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
          title="Switch active site"
          className="shrink-0 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                     bg-white/60 dark:bg-black/30 px-2.5 py-1.5 text-xs font-semibold hover:bg-[rgb(var(--accent))]/15"
        >
          {SITE_DISPLAY_NAME[site]}
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
      </header>

      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
