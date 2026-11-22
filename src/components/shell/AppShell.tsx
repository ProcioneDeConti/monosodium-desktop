import { useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Check,
  Bookmark,
  CheckSquare,
  Columns2,
  Download,
  Eye,
  Heart,
  Hash,
  Info,
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
  Sparkles,
  User,
  Gamepad2,
  Upload,
  Recycle,
} from "lucide-react";
import { SITES, SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { errorMessage } from "../../lib/errors";
import { SearchBar } from "../SearchBar/SearchBar";
import {
  MAX_THUMBNAIL_SIZE_PX,
  MIN_THUMBNAIL_SIZE_PX,
  useSettingsStore,
  type SeenMode,
} from "../../state/settingsStore";
import {
  MAX_SLIDESHOW_INTERVAL_SEC,
  MIN_SLIDESHOW_INTERVAL_SEC,
  SLIDESHOW_TRANSITIONS,
} from "../../lib/slideshow";
import { useHealthCheck } from "../../queries/useHealthCheck";
import { useAvatarUrl } from "../../queries/useAvatarUrl";
import { useUserProfileQuery } from "../../queries/useUserProfileQuery";
import { useFullscreen } from "../../lib/useFullscreen";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuItem, MenuLabel, MenuRow, MenuSeparator } from "../ui/Menu";
import { useAccountStore } from "../../state/accountStore";
import { TopProgressBar } from "../ui/TopProgressBar";

interface AppShellProps {
  activeQuery: string;
  canGoBack: boolean;
  onBack: () => void;
  onSearch: (query: string) => void;
  onOpenSearchBuilder: () => void;
  onOpenIdList: () => void;
  onOpenWiki: () => void;
  onOpenSettings: () => void;
  onOpenCheatsheet: () => void;
  onOpenHelp: () => void;
  onOpenDashboard: () => void;
  onOpenAbout: () => void;
  onOpenFavorites: (() => void) | null;
  /** Your favourites that e621 has since deleted (`fav:<you> status:deleted`), for bulk un-delete. */
  onOpenDeletedFavorites: (() => void) | null;
  onOpenProfile: (() => void) | null;
  onOpenMessages: (() => void) | null;
  /** e621 + signed in only; null hides the menu item. */
  onOpenUpload: (() => void) | null;
  onOpenSets: (() => void) | null;
  unreadMessageCount: number;
  onOpenForum: () => void;
  forumUnread: boolean;
  onOpenPopular: () => void;
  /** Everything un-deleted on this site (RecoveredPanel). */
  onOpenRecovered: () => void;
  /** Null when signed out (suggestions are built from your own favourites). */
  onOpenForYou: (() => void) | null;
  onOpenCollections: () => void;
  onOpenSavedSearches: () => void;
  onOpenGames: () => void;
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
  /** Seen-post handling - the View menu's "Hide seen posts" flips between dim and hide. */
  seenMode: SeenMode;
  onSeenModeChange: (mode: SeenMode) => void;
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
  onOpenIdList,
  onOpenWiki,
  onOpenSettings,
  onOpenCheatsheet,
  onOpenHelp,
  onOpenDashboard,
  onOpenAbout,
  onOpenFavorites,
  onOpenDeletedFavorites,
  onOpenProfile,
  onOpenMessages,
  onOpenUpload,
  onOpenSets,
  unreadMessageCount,
  onOpenForum,
  forumUnread,
  onOpenPopular,
  onOpenRecovered,
  onOpenForYou,
  onOpenCollections,
  onOpenSavedSearches,
  onOpenGames,
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
  seenMode,
  onSeenModeChange,
  accountAvatarId,
  isRefreshing,
  isLoadingPosts,
  children,
}: AppShellProps) {
  const site = useSettingsStore((s) => s.site);
  const setSite = useSettingsStore((s) => s.setSite);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const setGridThumbnailSizePx = useSettingsStore((s) => s.setGridThumbnailSizePx);
  const gridMode = useSettingsStore((s) => s.gridMode);
  const setGridMode = useSettingsStore((s) => s.setGridMode);
  const slideshowIntervalSec = useSettingsStore((s) => s.slideshowIntervalSec);
  const slideshowTransition = useSettingsStore((s) => s.slideshowTransition);
  const slideshowShuffle = useSettingsStore((s) => s.slideshowShuffle);
  const setSlideshowIntervalSec = useSettingsStore((s) => s.setSlideshowIntervalSec);
  const setSlideshowTransition = useSettingsStore((s) => s.setSlideshowTransition);
  const setSlideshowShuffle = useSettingsStore((s) => s.setSlideshowShuffle);

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const { data: avatarUrl } = useAvatarUrl(site, accountAvatarId);

  const signedIn = !!onOpenProfile;

  const health = useHealthCheck(site);
  // Joined to a string so the selector result is stable between renders (no new array each time).
  const signedInSites = useAccountStore((st) => SITES.filter((x) => st.isAuthenticated(x)).join(","));
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
        className="depth-recede flex items-center gap-2 border-b border-black/10 dark:border-white/10 px-3 py-2 shrink-0"
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
          <MenuRow>
            <span className="opacity-80">Layout</span>
            <select
              value={gridMode}
              onChange={(e) => setGridMode(e.target.value as typeof gridMode)}
              className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                         bg-white/60 dark:bg-black/30 px-1.5 py-1 text-xs outline-none
                         focus:ring-2 focus:ring-[rgb(var(--accent))]"
            >
              <option value="masonry">Masonry</option>
              <option value="uniform">Uniform</option>
            </select>
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
          {seenMode !== "off" && (
            <MenuItem
              keepOpen
              icon={<CheckSquare size={15} className={seenMode === "hide" ? "" : "opacity-30"} />}
              trailing={seenMode === "hide" ? "on" : ""}
              onClick={() => onSeenModeChange(seenMode === "hide" ? "dim" : "hide")}
            >
              Hide seen posts
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
          {onOpenForYou && (
            <MenuItem icon={<Sparkles size={15} />} onClick={onOpenForYou}>
              For you
            </MenuItem>
          )}
          <MenuItem icon={<Recycle size={15} />} onClick={onOpenRecovered}>
            Recovered posts
          </MenuItem>
          <MenuItem icon={<BookOpen size={15} />} onClick={onOpenWiki}>
            Wiki
          </MenuItem>
          <MenuItem icon={<Bookmark size={15} />} onClick={onOpenSavedSearches}>
            Saved searches
          </MenuItem>
          <MenuItem icon={<Gamepad2 size={15} />} onClick={onOpenGames}>
            Games
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
          <MenuItem icon={<Hash size={15} />} onClick={onOpenIdList}>
            Open post IDs…
          </MenuItem>

          <MenuSeparator />
          <MenuItem icon={<BarChart3 size={15} />} onClick={onOpenDashboard}>
            Dashboard
          </MenuItem>
          <MenuItem icon={<LifeBuoy size={15} />} onClick={onOpenHelp}>
            Help
          </MenuItem>
          <MenuItem icon={<Keyboard size={15} />} trailing="?" onClick={onOpenCheatsheet}>
            Keyboard shortcuts
          </MenuItem>
          <MenuItem icon={<Info size={15} />} onClick={onOpenAbout}>
            About
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
              <MenuItem icon={<Recycle size={15} />} onClick={onOpenDeletedFavorites ?? undefined}>
                Deleted favorites
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
              {onOpenUpload && (
                <MenuItem icon={<Upload size={15} />} onClick={onOpenUpload}>
                  Upload
                </MenuItem>
              )}
            </>
          ) : (
            <MenuItem icon={<LogIn size={15} />} onClick={onOpenSettings}>
              Sign in (Settings)
            </MenuItem>
          )}

          <MenuSeparator />
          {/* Every site listed, the current one checked (with its reachability dot) - picking
              another switches to it. Clearer than "Switch to X" lines that omit where you are. */}
          <MenuLabel>Site</MenuLabel>
          {SITES.map((s) => {
            const current = s === site;
            return (
              <MenuItem
                key={s}
                onClick={current ? undefined : () => setSite(s)}
                keepOpen={current}
                trailing={
                  current ? (
                    <span className="flex items-center gap-1.5" title={healthText}>
                      <span className={`h-1.5 w-1.5 rounded-full ${healthColor}`} />
                      {health.status === "error" ? "unreachable" : health.status === "success" ? "online" : "checking"}
                    </span>
                  ) : signedInSites.split(",").includes(s) ? null : (
                    "signed out"
                  )
                }
              >
                <span className="flex items-center gap-2.5">
                  <SiteMenuAvatar site={s} signedIn={signedInSites.split(",").includes(s)} current={current} />
                  <span className={current ? "font-semibold" : ""}>{SITE_DISPLAY_NAME[s]}</span>
                </span>
              </MenuItem>
            );
          })}
          {health.status === "error" && (
            <div className="px-2.5 pb-1.5 text-xs text-red-500 opacity-80">{healthText}</div>
          )}
        </Menu>
      </header>

      <TopProgressBar active={isLoadingPosts} />

      {tabBar}

      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}

/** A site row's identifier in the profile menu: your avatar on that site (each site is a separate
 *  account), with a check badge over it on the current site. Only mounted while the menu is open,
 *  so the users/me + avatar lookups for other sites happen on open and are cached after that (the
 *  current site's are already cached by App's own profile query). */
function SiteMenuAvatar({ site, signedIn, current }: { site: Site; signedIn: boolean; current: boolean }) {
  const { data: profile } = useUserProfileQuery(site, "me", signedIn);
  const { data: url } = useAvatarUrl(site, profile?.avatar_id ?? null);
  return (
    // The ring is padding on this wrapper (not a box-shadow `ring-*`) and the badge sits inside
    // its bounds: MenuItem's label span truncates (overflow: hidden), which would clip anything
    // drawn outside the box.
    <span className={`relative flex shrink-0 rounded-full p-[2px] ${current ? "bg-[rgb(var(--accent))]" : ""}`}>
      <Avatar
        url={signedIn ? url : null}
        name={signedIn ? (profile?.name ?? SITE_DISPLAY_NAME[site]) : `Not signed in to ${SITE_DISPLAY_NAME[site]}`}
        size={22}
        className={signedIn ? "" : "opacity-50"}
      />
      {current && (
        <span className="absolute bottom-0 right-0 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[rgb(var(--lt-surface))] bg-[rgb(var(--accent))] text-white dark:border-[rgb(var(--dk-surface-2))]">
          <Check size={8} strokeWidth={4} />
        </span>
      )}
    </span>
  );
}
