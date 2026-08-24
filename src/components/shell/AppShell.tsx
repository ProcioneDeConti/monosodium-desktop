import { useEffect, type ReactNode } from "react";
import { Bookmark, Heart, RefreshCw, Settings as SettingsIcon, User } from "lucide-react";
import { SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { SearchBar } from "../SearchBar/SearchBar";
import {
  MAX_THUMBNAIL_SIZE_PX,
  MIN_THUMBNAIL_SIZE_PX,
  useSettingsStore,
} from "../../state/settingsStore";
import { useHealthCheck } from "../../queries/useHealthCheck";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { TopProgressBar } from "../ui/TopProgressBar";

interface AppShellProps {
  activeQuery: string;
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  onOpenFavorites: (() => void) | null;
  onOpenProfile: (() => void) | null;
  onOpenSavedSearches: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isLoadingPosts: boolean;
  children: ReactNode;
}

export function AppShell({
  activeQuery,
  onSearch,
  onOpenSettings,
  onOpenFavorites,
  onOpenProfile,
  onOpenSavedSearches,
  onRefresh,
  isRefreshing,
  isLoadingPosts,
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
        <button
          type="button"
          onClick={() => onSearch("")}
          title="Back to the default search"
          className="select-none whitespace-nowrap rounded-[var(--radius-sm)] pr-1 text-sm font-bold
                     tracking-tight text-[rgb(var(--accent))] transition-opacity hover:opacity-80
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]"
        >
          {SITE_DISPLAY_NAME[site]} Desktop
        </button>

        <SearchBar site={site as Site} activeQuery={activeQuery} onSearch={onSearch} />

        <IconButton onClick={onRefresh} title="Refresh results">
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
        </IconButton>

        <Button onClick={toggleSite} title={`Switch active site · ${healthTitle}`}>
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${healthColor} ${
              health.status === "pending" ? "animate-pulse" : ""
            }`}
          />
          {SITE_DISPLAY_NAME[site]}
        </Button>

        <Button
          icon={<Heart size={13} strokeWidth={2.5} />}
          onClick={onOpenFavorites ?? undefined}
          disabled={!onOpenFavorites}
          title={onOpenFavorites ? "Your favorites" : "Sign in (Settings) to view favorites"}
        >
          Favorites
        </Button>

        <IconButton onClick={onOpenSavedSearches} title="Saved searches">
          <Bookmark size={17} />
        </IconButton>

        <IconButton
          onClick={onOpenProfile ?? undefined}
          disabled={!onOpenProfile}
          title={onOpenProfile ? "Your profile" : "Sign in (Settings) to view your profile"}
        >
          <User size={17} />
        </IconButton>

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

        <IconButton onClick={onOpenSettings} title="Settings">
          <SettingsIcon size={17} />
        </IconButton>
      </header>

      <TopProgressBar active={isLoadingPosts} />

      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
