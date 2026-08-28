import { useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowLeft,
  Bookmark,
  Heart,
  Mail,
  MessagesSquare,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Shuffle,
  TrendingUp,
  User,
} from "lucide-react";
import { SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { errorMessage } from "../../lib/errors";
import { SearchBar } from "../SearchBar/SearchBar";
import {
  MAX_THUMBNAIL_SIZE_PX,
  MIN_THUMBNAIL_SIZE_PX,
  useSettingsStore,
} from "../../state/settingsStore";
import {
  MAX_SLIDESHOW_INTERVAL_SEC,
  MIN_SLIDESHOW_INTERVAL_SEC,
  SLIDESHOW_TRANSITIONS,
} from "../../lib/slideshow";
import { useHealthCheck } from "../../queries/useHealthCheck";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { TopProgressBar } from "../ui/TopProgressBar";

interface AppShellProps {
  activeQuery: string;
  canGoBack: boolean;
  onBack: () => void;
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  onOpenFavorites: (() => void) | null;
  onOpenProfile: (() => void) | null;
  onOpenMessages: (() => void) | null;
  unreadMessageCount: number;
  onOpenForum: () => void;
  forumUnread: boolean;
  onOpenPopular: () => void;
  onOpenSavedSearches: () => void;
  onStartSlideshow: (() => void) | null;
  onRefresh: () => void;
  onShuffle: () => void;
  isRefreshing: boolean;
  isLoadingPosts: boolean;
  children: ReactNode;
}

export function AppShell({
  activeQuery,
  canGoBack,
  onBack,
  onSearch,
  onOpenSettings,
  onOpenFavorites,
  onOpenProfile,
  onOpenMessages,
  unreadMessageCount,
  onOpenForum,
  forumUnread,
  onOpenPopular,
  onOpenSavedSearches,
  onStartSlideshow,
  onRefresh,
  onShuffle,
  isRefreshing,
  isLoadingPosts,
  children,
}: AppShellProps) {
  const site = useSettingsStore((s) => s.site);
  const setSite = useSettingsStore((s) => s.setSite);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const setGridThumbnailSizePx = useSettingsStore((s) => s.setGridThumbnailSizePx);
  const slideshowIntervalSec = useSettingsStore((s) => s.slideshowIntervalSec);
  const slideshowTransition = useSettingsStore((s) => s.slideshowTransition);
  const slideshowShuffle = useSettingsStore((s) => s.slideshowShuffle);
  const setSlideshowIntervalSec = useSettingsStore((s) => s.setSlideshowIntervalSec);
  const setSlideshowTransition = useSettingsStore((s) => s.setSlideshowTransition);
  const setSlideshowShuffle = useSettingsStore((s) => s.setSlideshowShuffle);
  const [slideshowMenuOpen, setSlideshowMenuOpen] = useState(false);
  const slideshowMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slideshowMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (slideshowMenuRef.current && !slideshowMenuRef.current.contains(e.target as Node)) {
        setSlideshowMenuOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setSlideshowMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [slideshowMenuOpen]);

  function toggleSite() {
    setSite(site === "e621" ? "e6ai" : "e621");
  }

  const health = useHealthCheck(site);
  const healthColor =
    health.status === "error" ? "bg-red-500" : health.status === "success" ? "bg-green-500" : "bg-amber-400";
  const healthTitle =
    health.status === "error"
      ? `${SITE_DISPLAY_NAME[site]} unreachable: ${errorMessage(health.error, "unknown error")}`
      : health.status === "success"
        ? `${SITE_DISPLAY_NAME[site]} reachable`
        : `Checking ${SITE_DISPLAY_NAME[site]}…`;

  // Keeps the OS window title in sync with the active site - the shell's own title button next
  // to the search bar just shows the bare site name ("e621"/"e6AI"); the app's actual branding
  // ("Monosodium Desktop") plus which site you're browsing lives in the title bar instead.
  useEffect(() => {
    void getCurrentWindow().setTitle(`Monosodium Desktop - ${SITE_DISPLAY_NAME[site]}`);
  }, [site]);

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
        {canGoBack && (
          <IconButton onClick={onBack} title="Back (Alt+←)">
            <ArrowLeft size={17} />
          </IconButton>
        )}

        <button
          type="button"
          onClick={() => onSearch("")}
          title="Back to the default search"
          className="select-none whitespace-nowrap rounded-[var(--radius-sm)] pr-1 text-sm font-bold
                     tracking-tight text-[rgb(var(--accent))] transition-opacity hover:opacity-80
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]"
        >
          {SITE_DISPLAY_NAME[site]}
        </button>

        <SearchBar site={site as Site} activeQuery={activeQuery} onSearch={onSearch} />

        <IconButton onClick={onRefresh} title="Refresh results">
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
        </IconButton>

        <IconButton onClick={onShuffle} title="Random posts (order:random)">
          <Shuffle size={16} />
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

        <IconButton onClick={onOpenPopular} title="Popular posts">
          <TrendingUp size={17} />
        </IconButton>

        <IconButton onClick={onOpenSavedSearches} title="Saved searches">
          <Bookmark size={17} />
        </IconButton>

        <div className="relative" ref={slideshowMenuRef}>
          <IconButton
            onClick={() => setSlideshowMenuOpen((v) => !v)}
            disabled={!onStartSlideshow}
            title={onStartSlideshow ? "Start slideshow" : "No results to show"}
          >
            <Play size={17} />
          </IconButton>

          {slideshowMenuOpen && (
            <div
              className="absolute right-0 top-full z-30 mt-1 w-56 animate-[scale-in_100ms_ease-out] origin-top-right
                         rounded-[var(--radius-md)] border border-black/10 dark:border-white/10
                         bg-[rgb(250,250,250)] dark:bg-[rgb(28,28,28)] p-3 text-xs shadow-xl shadow-black/20"
            >
              <p className="mb-2.5 font-semibold uppercase tracking-wide opacity-60">Slideshow</p>

              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="opacity-80">Interval</span>
                <div className="flex items-center gap-1">
                  <IconButton
                    onClick={() => setSlideshowIntervalSec(slideshowIntervalSec - 1)}
                    disabled={slideshowIntervalSec <= MIN_SLIDESHOW_INTERVAL_SEC}
                    title="Shorter interval"
                    className="!p-1"
                  >
                    <Minus size={12} />
                  </IconButton>
                  <span className="w-9 text-center tabular-nums">{slideshowIntervalSec}s</span>
                  <IconButton
                    onClick={() => setSlideshowIntervalSec(slideshowIntervalSec + 1)}
                    disabled={slideshowIntervalSec >= MAX_SLIDESHOW_INTERVAL_SEC}
                    title="Longer interval"
                    className="!p-1"
                  >
                    <Plus size={12} />
                  </IconButton>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="opacity-80">Transition</span>
                <select
                  value={slideshowTransition}
                  onChange={(e) => setSlideshowTransition(e.target.value as typeof slideshowTransition)}
                  className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                             bg-white/60 dark:bg-black/30 px-1.5 py-1 text-xs outline-none
                             focus:ring-2 focus:ring-[rgb(var(--accent))]"
                >
                  {SLIDESHOW_TRANSITIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="mb-3 flex cursor-pointer items-center justify-between gap-2 select-none">
                <span className="opacity-80">Shuffle</span>
                <input
                  type="checkbox"
                  checked={slideshowShuffle}
                  onChange={(e) => setSlideshowShuffle(e.target.checked)}
                  className="accent-[rgb(var(--accent))]"
                />
              </label>

              <Button
                icon={<Play size={13} strokeWidth={2.5} />}
                onClick={() => {
                  setSlideshowMenuOpen(false);
                  onStartSlideshow?.();
                }}
                disabled={!onStartSlideshow}
                className="w-full justify-center"
              >
                Start
              </Button>
            </div>
          )}
        </div>

        <div className="relative">
          <IconButton onClick={onOpenForum} title="Forum">
            <MessagesSquare size={17} />
          </IconButton>
          {forumUnread && (
            <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[rgb(var(--accent))]" />
          )}
        </div>

        <div className="relative">
          <IconButton
            onClick={onOpenMessages ?? undefined}
            disabled={!onOpenMessages}
            title={onOpenMessages ? "Messages" : "Sign in (Settings) to view messages"}
          >
            <Mail size={17} />
          </IconButton>
          {unreadMessageCount > 0 && (
            <span
              className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center
                         rounded-full bg-[rgb(var(--accent))] px-1 text-[10px] font-bold leading-none text-white"
            >
              {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
            </span>
          )}
        </div>

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
