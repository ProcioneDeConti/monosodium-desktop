import { useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowLeft,
  ArrowRightLeft,
  BookOpen,
  Bookmark,
  CheckSquare,
  Columns2,
  Download,
  Eye,
  Heart,
  Keyboard,
  Library,
  LifeBuoy,
  LogIn,
  Mail,
  Maximize,
  Menu as MenuIcon,
  MessagesSquare,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Settings as SettingsIcon,
  Shuffle,
  SquareStack,
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
import { useAvatarUrl } from "../../queries/useAvatarUrl";
import { useFullscreen } from "../../lib/useFullscreen";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuItem, MenuLabel, MenuRow, MenuSeparator } from "../ui/Menu";
import { TopProgressBar } from "../ui/TopProgressBar";

interface AppShellProps {
  activeQuery: string;
  canGoBack: boolean;
  onBack: () => void;
  onSearch: (query: string) => void;
  onOpenSearchBuilder: () => void;
  onOpenWiki: () => void;
  onOpenSettings: () => void;
  onOpenCheatsheet: () => void;
  onOpenHelp: () => void;
  onOpenFavorites: (() => void) | null;
  onOpenProfile: (() => void) | null;
  onOpenMessages: (() => void) | null;
  onOpenSets: (() => void) | null;
  unreadMessageCount: number;
  onOpenForum: () => void;
  forumUnread: boolean;
  onOpenPopular: () => void;
  onOpenCollections: () => void;
  onOpenSavedSearches: () => void;
  onStartSlideshow: (() => void) | null;
  onRefresh: () => void;
  onShuffle: () => void;
  onToggleSelection: () => void;
  selectionActive: boolean;
  onOpenDownloads: () => void;
  downloadsPending: number;
  onNewTab: () => void;
  /** The tab strip, rendered below the header - null when there's only one tab. */
  tabBar: ReactNode;
  /** Whether the blacklist has any entries (gates the "show blacklisted" toggle in the View menu). */
  blacklistActive: boolean;
  blacklistDisabled: boolean;
  onToggleBlacklistDisabled: (disabled: boolean) => void;
  /** Signed-in account's avatar post id, for the account menu trigger. */
  accountAvatarId: number | null;
  isRefreshing: boolean;
  isLoadingPosts: boolean;
  children: ReactNode;
}

export function AppShell({
  activeQuery,
  canGoBack,
  onBack,
  onSearch,
  onOpenSearchBuilder,
  onOpenWiki,
  onOpenSettings,
  onOpenCheatsheet,
  onOpenHelp,
  onOpenFavorites,
  onOpenProfile,
  onOpenMessages,
  onOpenSets,
  unreadMessageCount,
  onOpenForum,
  forumUnread,
  onOpenPopular,
  onOpenCollections,
  onOpenSavedSearches,
  onStartSlideshow,
  onRefresh,
  onShuffle,
  onToggleSelection,
  selectionActive,
  onOpenDownloads,
  downloadsPending,
  onNewTab,
  tabBar,
  blacklistActive,
  blacklistDisabled,
  onToggleBlacklistDisabled,
  accountAvatarId,
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

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const { data: avatarUrl } = useAvatarUrl(site, accountAvatarId);

  const signedIn = !!onOpenProfile;
  const otherSite: Site = site === "e621" ? "e6ai" : "e621";

  const health = useHealthCheck(site);
  const healthColor =
    health.status === "error"
      ? "bg-red-500"
      : health.status === "success"
        ? "bg-green-500"
        : "bg-amber-400";
  const healthText =
    health.status === "error"
      ? `${SITE_DISPLAY_NAME[site]} unreachable: ${errorMessage(health.error, "unknown error")}`
      : health.status === "success"
        ? `${SITE_DISPLAY_NAME[site]} reachable`
        : `Checking ${SITE_DISPLAY_NAME[site]}…`;

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
        className="flex items-center gap-2 border-b border-black/10 dark:border-white/10 px-3 py-2 shrink-0"
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

        <SearchBar
          site={site as Site}
          activeQuery={activeQuery}
          onSearch={onSearch}
          onOpenBuilder={onOpenSearchBuilder}
        />

        <IconButton onClick={onRefresh} title="Refresh results">
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
        </IconButton>

        <IconButton
          onClick={onToggleSelection}
          title={selectionActive ? "Exit selection" : "Select multiple posts"}
          className={selectionActive ? "!text-[rgb(var(--accent))]" : ""}
        >
          <CheckSquare size={16} />
        </IconButton>

        {/* View menu - how the results look and play */}
        <Menu icon={<Eye size={16} />} title="View options" width="w-64">
          <MenuLabel>Display</MenuLabel>
          <MenuRow>
            <span className="opacity-80">Thumbnail size</span>
            <input
              type="range"
              min={MIN_THUMBNAIL_SIZE_PX}
              max={MAX_THUMBNAIL_SIZE_PX}
              step={10}
              value={thumbnailSizePx}
              onChange={(e) => setGridThumbnailSizePx(Number(e.target.value))}
              className="w-28 accent-[rgb(var(--accent))]"
            />
          </MenuRow>
          {blacklistActive && (
            <MenuItem
              keepOpen
              icon={<CheckSquare size={15} className={blacklistDisabled ? "" : "opacity-30"} />}
              trailing={blacklistDisabled ? "on" : ""}
              onClick={() => onToggleBlacklistDisabled(!blacklistDisabled)}
            >
              Show blacklisted posts
            </MenuItem>
          )}

          <MenuSeparator />
          <MenuItem icon={<Columns2 size={15} />} trailing="Ctrl+T" onClick={onNewTab}>
            New tab
          </MenuItem>
          <MenuItem
            icon={<Maximize size={15} />}
            trailing={isFullscreen ? "on · F11" : "F11"}
            onClick={() => void toggleFullscreen()}
          >
            Fullscreen
          </MenuItem>

          <MenuSeparator />
          <MenuLabel>Slideshow</MenuLabel>
          <MenuRow>
            <span className="opacity-80">Interval</span>
            <span className="flex items-center gap-1">
              <IconButton
                onClick={() => setSlideshowIntervalSec(slideshowIntervalSec - 1)}
                disabled={slideshowIntervalSec <= MIN_SLIDESHOW_INTERVAL_SEC}
                title="Shorter"
                className="!p-1"
              >
                <Minus size={12} />
              </IconButton>
              <span className="w-9 text-center tabular-nums text-xs">{slideshowIntervalSec}s</span>
              <IconButton
                onClick={() => setSlideshowIntervalSec(slideshowIntervalSec + 1)}
                disabled={slideshowIntervalSec >= MAX_SLIDESHOW_INTERVAL_SEC}
                title="Longer"
                className="!p-1"
              >
                <Plus size={12} />
              </IconButton>
            </span>
          </MenuRow>
          <MenuRow>
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
          </MenuRow>
          <MenuItem
            keepOpen
            icon={<Repeat size={15} className={slideshowShuffle ? "" : "opacity-30"} />}
            trailing={slideshowShuffle ? "on" : ""}
            onClick={() => setSlideshowShuffle(!slideshowShuffle)}
          >
            Shuffle
          </MenuItem>
          <MenuItem
            icon={<Play size={15} />}
            disabled={!onStartSlideshow}
            onClick={() => onStartSlideshow?.()}
          >
            {onStartSlideshow ? "Start slideshow" : "No results to show"}
          </MenuItem>
        </Menu>

        {/* App menu - global destinations + app-level stuff */}
        <Menu
          icon={<MenuIcon size={17} />}
          title="Menu"
          badgeDot={forumUnread || downloadsPending > 0}
        >
          <MenuItem icon={<TrendingUp size={15} />} onClick={onOpenPopular}>
            Popular
          </MenuItem>
          <MenuItem icon={<BookOpen size={15} />} onClick={onOpenWiki}>
            Wiki
          </MenuItem>
          <MenuItem icon={<Bookmark size={15} />} onClick={onOpenSavedSearches}>
            Saved searches
          </MenuItem>
          <MenuItem icon={<Library size={15} />} onClick={onOpenCollections}>
            Collections
          </MenuItem>
          <MenuItem
            icon={<MessagesSquare size={15} />}
            trailing={forumUnread ? <span className="h-2 w-2 rounded-full bg-[rgb(var(--accent))]" /> : undefined}
            onClick={onOpenForum}
          >
            Forum
          </MenuItem>
          <MenuItem
            icon={<Download size={15} />}
            trailing={downloadsPending > 0 ? `${downloadsPending} active` : undefined}
            onClick={onOpenDownloads}
          >
            Downloads
          </MenuItem>
          <MenuItem icon={<Shuffle size={15} />} onClick={onShuffle}>
            Random posts
          </MenuItem>

          <MenuSeparator />
          <MenuItem icon={<LifeBuoy size={15} />} onClick={onOpenHelp}>
            Help
          </MenuItem>
          <MenuItem icon={<Keyboard size={15} />} trailing="?" onClick={onOpenCheatsheet}>
            Keyboard shortcuts
          </MenuItem>
          <MenuItem icon={<SettingsIcon size={15} />} onClick={onOpenSettings}>
            Settings
          </MenuItem>
        </Menu>

        {/* Account menu */}
        <Menu
          title={signedIn ? "Account" : "Sign in"}
          badgeDot={unreadMessageCount > 0}
          trigger={
            signedIn ? (
              <Avatar url={avatarUrl} name="You" size={26} className="border border-black/10 dark:border-white/15" />
            ) : undefined
          }
          icon={<User size={17} />}
        >
          {signedIn ? (
            <>
              <MenuItem icon={<User size={15} />} onClick={onOpenProfile ?? undefined}>
                Profile
              </MenuItem>
              <MenuItem icon={<Heart size={15} />} onClick={onOpenFavorites ?? undefined}>
                Your favorites
              </MenuItem>
              <MenuItem icon={<SquareStack size={15} />} onClick={onOpenSets ?? undefined}>
                Your sets
              </MenuItem>
              <MenuItem
                icon={<Mail size={15} />}
                trailing={unreadMessageCount > 0 ? String(unreadMessageCount) : undefined}
                onClick={onOpenMessages ?? undefined}
              >
                Messages
              </MenuItem>
            </>
          ) : (
            <MenuItem icon={<LogIn size={15} />} onClick={onOpenSettings}>
              Sign in (Settings)
            </MenuItem>
          )}

          <MenuSeparator />
          <MenuItem icon={<ArrowRightLeft size={15} />} onClick={() => setSite(otherSite)}>
            Switch to {SITE_DISPLAY_NAME[otherSite]}
          </MenuItem>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs opacity-60">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthColor}`} />
            <span className="truncate">{healthText}</span>
          </div>
        </Menu>
      </header>

      <TopProgressBar active={isLoadingPosts} />

      {tabBar}

      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
