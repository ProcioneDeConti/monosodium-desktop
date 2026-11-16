// Settings: a two-pane sheet - category sidebar (with a search box that filters every card across
// all categories) on the left, the selected category's cards on the right. Each card is its own
// component in SettingsCards.tsx that reads the stores directly, so the panel itself only does
// navigation. Card titles + keywords live in SETTINGS_INDEX below; that's what the search hits.

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Bot,
  ChevronRight,
  Film,
  Image as ImageIcon,
  Info,
  Palette,
  Plug,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { MASCOT_NAME } from "../../lib/mascot";
import { useSettingsStore } from "../../state/settingsStore";
import { useAccountStore } from "../../state/accountStore";
import { useBlacklistSyncStore } from "../../state/blacklistSync";
import { randomGreeting } from "../../lib/greetings";
import { IconButton } from "../ui/IconButton";
import { Overlay, type OverlayHandle } from "../ui/Overlay";
import { EulaReadOnlyDialog } from "../Eula/EulaReadOnlyDialog";
import * as Cards from "./SettingsCards";

interface SettingsPanelProps {
  onClose: () => void;
  onOpenProfile: () => void;
}

type PageId =
  | "account"
  | "content"
  | "appearance"
  | "mascot"
  | "media"
  | "wallpaper"
  | "integrations"
  | "privacy"
  | "about";

interface PageDef {
  id: PageId;
  label: string;
  blurb: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

const PAGES: PageDef[] = [
  { id: "account", label: "Account", blurb: "Sign in to e621 and e6AI", icon: UserRound },
  { id: "content", label: "Content & filtering", blurb: "Ratings, blacklist, seen posts", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", blurb: "Theme, colours, motion, grid", icon: Palette },
  { id: "mascot", label: MASCOT_NAME, blurb: "Your raccoon companion", icon: Bot },
  { id: "media", label: "Viewing & downloads", blurb: "Video, voting, download folder", icon: Film },
  { id: "wallpaper", label: "Wallpaper", blurb: "Posts on your desktop", icon: ImageIcon },
  { id: "integrations", label: "Integrations", blurb: "Reverse image search, source logins", icon: Plug },
  { id: "privacy", label: "Privacy & data", blurb: "Encryption, backups, cache", icon: ShieldCheck },
  { id: "about", label: "About", blurb: "Updates, legal, reset", icon: Info },
];

interface CardDef {
  id: string;
  page: PageId;
  title: string;
  keywords: string;
  Component: ComponentType<{ onOpenEula: () => void }>;
}

/** Every card, in display order. `keywords` is extra search text beyond the title. */
const SETTINGS_INDEX: CardDef[] = [
  { id: "accounts", page: "account", title: "Site accounts", keywords: "username api key login sign in e621 e6ai credentials", Component: Cards.AccountsCard },
  { id: "ratings", page: "content", title: "Content ratings", keywords: "adult mode safe questionable explicit nsfw sfw rating filter", Component: Cards.RatingsCard },
  { id: "blacklist", page: "content", title: "Blacklist", keywords: "blacklist block hide tags sync auto-sync android import push tester", Component: Cards.BlacklistCard },
  { id: "seen", page: "content", title: "Seen posts", keywords: "seen viewed dim hide history clear", Component: Cards.SeenCard },
  { id: "theme", page: "appearance", title: "Theme", keywords: "dark light system mode palette navy oled warm", Component: Cards.ThemeCard },
  { id: "accent", page: "appearance", title: "Accent colour", keywords: "accent color colour highlight custom", Component: Cards.AccentCard },
  { id: "effects", page: "appearance", title: "Motion & effects", keywords: "motion animation reduced ambient glow title bar viewer", Component: Cards.EffectsCard },
  { id: "grid", page: "appearance", title: "Grid", keywords: "thumbnail size grid columns", Component: Cards.GridCard },
  { id: "mascot", page: "mascot", title: MASCOT_NAME, keywords: "mascot raccoon companion cameos talk chatty speech cheeky spicy hidden restore", Component: Cards.MascotCard },
  { id: "video", page: "media", title: "Video playback", keywords: "video loop autoplay speed playback webm mp4", Component: Cards.VideoCard },
  { id: "voting", page: "media", title: "Favorites & voting", keywords: "favorite favourite upvote vote", Component: Cards.VotingCard },
  { id: "downloads", page: "media", title: "Downloads", keywords: "download folder save location directory", Component: Cards.DownloadsCard },
  { id: "wallpaper", page: "wallpaper", title: "Desktop wallpaper", keywords: "wallpaper desktop background rotate", Component: Cards.WallpaperCard },
  { id: "saucenao", page: "integrations", title: "Reverse image search", keywords: "saucenao reverse image search sauce api key drag drop", Component: Cards.ReverseSearchCard },
  { id: "source-logins", page: "integrations", title: "Source logins", keywords: "source login furaffinity fa recovery deleted cookie", Component: Cards.SourceLoginsCard },
  { id: "encryption", page: "privacy", title: "Encryption", keywords: "password encryption lock vault protect", Component: Cards.EncryptionCard },
  { id: "backup", page: "privacy", title: "Backup & restore", keywords: "backup restore export import", Component: Cards.BackupCard },
  { id: "cache", page: "privacy", title: "Cache", keywords: "cache disk space clear size limit images", Component: Cards.CacheCard },
  { id: "updates", page: "about", title: "Updates", keywords: "update version check github release install", Component: Cards.UpdatesCard },
  { id: "legal", page: "about", title: "Legal", keywords: "eula license agreement terms", Component: Cards.LegalCard },
  { id: "reset", page: "about", title: "Reset", keywords: "reset factory clear all data danger", Component: Cards.ResetCard },
];

// Survives close/reopen within a session, so Settings reopens where you left it.
let lastPage: PageId = "account";

function matches(card: CardDef, words: string[]): boolean {
  const page = PAGES.find((p) => p.id === card.page)!;
  const hay = `${card.title} ${card.keywords} ${page.label}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function SettingsPanel({ onClose, onOpenProfile }: SettingsPanelProps) {
  const site = useSettingsStore((s) => s.site);
  const account = useAccountStore((s) => s.accounts[site]);
  const signedInE621 = useAccountStore((s) => s.isAuthenticated("e621"));
  const signedInE6ai = useAccountStore((s) => s.isAuthenticated("e6ai"));
  const blacklistLines = useSettingsStore((s) => s.blacklistEntries.length);
  const autoSync = useSettingsStore((s) => s.blacklistAutoSync);
  const syncState = useBlacklistSyncStore((s) => s.state);
  // Re-picked every time Settings opens - mirrors the reference Android app's nav drawer.
  const [greeting] = useState(randomGreeting);
  const [page, setPageState] = useState<PageId>(lastPage);
  const [query, setQuery] = useState("");
  const [showEula, setShowEula] = useState(false);
  const overlay = useRef<OverlayHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function setPage(id: PageId) {
    lastPage = id;
    setPageState(id);
    setQuery("");
    contentRef.current?.scrollTo({ top: 0 });
  }

  // Ctrl+F jumps to the settings search.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const results = searching ? SETTINGS_INDEX.filter((c) => matches(c, words)) : [];
  const hitPages = new Set(results.map((c) => c.page));

  const current = PAGES.find((p) => p.id === page)!;
  const cards = searching ? results : SETTINGS_INDEX.filter((c) => c.page === page);
  const openEula = () => setShowEula(true);

  function badge(id: PageId) {
    if (id === "account") {
      const n = Number(signedInE621) + Number(signedInE6ai);
      return n > 0 ? <Dot tone="ok" title={`${n} signed in`} /> : <Dot tone="muted" title="Not signed in" />;
    }
    if (id === "content" && blacklistLines > 0) {
      return (
        <span className="flex items-center gap-1 text-[10px] tabular-nums opacity-60">
          {autoSync && <Dot tone={syncState === "error" ? "error" : "ok"} title={syncState === "error" ? "Blacklist sync failed" : "Blacklist auto-sync on"} />}
          {blacklistLines}
        </span>
      );
    }
    return null;
  }

  return (
    <Overlay ref={overlay} onClose={onClose} variant="sheet" sheetWidth="max-w-5xl">
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="flex w-64 shrink-0 flex-col border-r border-black/10 bg-black/[0.025] dark:border-white/10 dark:bg-white/[0.02]">
          <div className="px-4 pb-3 pt-5">
            <p className="text-lg font-black leading-tight tracking-tight text-[rgb(var(--accent))]">{greeting},</p>
            {account?.username ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProfile();
                }}
                className="mt-0.5 flex items-center gap-1 text-sm font-medium opacity-70 transition-opacity hover:text-[rgb(var(--accent))] hover:opacity-100"
              >
                {account.username}
                <ChevronRight size={13} />
              </button>
            ) : (
              <p className="mt-0.5 text-sm opacity-50">stranger</p>
            )}
          </div>

          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-black/10 bg-white/70 px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-[rgb(var(--accent))] dark:border-white/10 dark:bg-black/30">
              <Search size={14} className="shrink-0 opacity-50" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder="Search settings"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-50"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="opacity-50 hover:opacity-100" title="Clear">
                  <X size={13} />
                </button>
              ) : (
                <kbd className="rounded border border-black/10 px-1 text-[10px] opacity-40 dark:border-white/15">Ctrl F</kbd>
              )}
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto px-2 pb-3">
            {PAGES.map((p) => {
              const active = !searching && p.id === page;
              const dimmed = searching && !hitPages.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setPage(p.id)}
                    className={`group relative flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm transition-colors ${
                      active
                        ? "bg-[rgb(var(--accent))]/15 font-semibold text-[rgb(var(--accent))]"
                        : "hover:bg-black/5 dark:hover:bg-white/[0.06]"
                    } ${dimmed ? "opacity-35" : ""}`}
                  >
                    {active && (
                      <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[rgb(var(--accent))]" />
                    )}
                    <p.icon size={16} className={active ? "" : "opacity-70"} />
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    {badge(p.id)}
                  </button>
                </li>
              );
            })}
          </ul>

          <Cards.CreditsFooter />
        </nav>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-start gap-3 border-b border-black/10 px-6 pb-4 pt-5 dark:border-white/10">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight">
                {searching ? `Results for “${query.trim()}”` : current.label}
              </h1>
              <p className="mt-0.5 text-xs opacity-60">
                {searching
                  ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
                  : current.blurb}
              </p>
            </div>
            <IconButton onClick={() => overlay.current?.close()} title="Close (Esc)">
              <X size={18} />
            </IconButton>
          </div>

          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-5">
            <div key={searching ? `q:${query}` : page} className="flex flex-col gap-4 animate-[fade-in_150ms_ease-out]">
              {cards.map((c) => (
                <div key={c.id}>
                  {searching && (
                    <button
                      type="button"
                      onClick={() => setPage(c.page)}
                      className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-50 hover:text-[rgb(var(--accent))] hover:opacity-100"
                    >
                      {PAGES.find((p) => p.id === c.page)!.label}
                      <ChevronRight size={11} />
                    </button>
                  )}
                  <c.Component onOpenEula={openEula} />
                </div>
              ))}
              {searching && results.length === 0 && (
                <div className="py-16 text-center text-sm opacity-60">
                  No settings match “{query.trim()}”.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showEula && <EulaReadOnlyDialog onClose={() => setShowEula(false)} />}
    </Overlay>
  );
}

function Dot({ tone, title }: { tone: "ok" | "muted" | "error"; title: string }) {
  const color = tone === "ok" ? "bg-green-500" : tone === "error" ? "bg-red-500" : "bg-black/25 dark:bg-white/25";
  return <span title={title} className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}
