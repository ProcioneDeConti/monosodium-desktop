// One component per Settings card (see SETTINGS_INDEX in SettingsPanel.tsx for where each one
// lives and what the search matches it on). Each reads the stores it needs directly.

import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import {
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Heart,
  Image as ImageIcon,
  KeyRound,
  Link2,
  Network,
  Lock,
  Monitor,
  Moon,
  Paintbrush,
  PlayCircle,
  RotateCcw,
  ScanSearch,
  ShieldBan,
  ShieldAlert,
  Sparkles,
  Sun,
  SunMoon,
  LayoutGrid,
  Bot,
  Archive,
  UserRound,
} from "lucide-react";
import {
  DEFAULT_THUMBNAIL_SIZE_PX,
  MAX_THUMBNAIL_SIZE_PX,
  MAX_VIDEO_SPEED,
  MIN_THUMBNAIL_SIZE_PX,
  MIN_VIDEO_SPEED,
  STEP_VIDEO_SPEED,
  useSettingsStore,
  type MascotMode,
  type MascotTalk,
} from "../../state/settingsStore";
import { useMascotStore } from "../../state/mascotStore";
import { e621Api } from "../../api/client";
import type { Rating } from "../../models/post";
import { MASCOT_NAME } from "../../lib/mascot";
import { MOTION_MODES, PALETTES } from "../../lib/theme";
import { Button } from "../ui/Button";
import { SettingCard, SettingRow, Segmented, ToggleRow } from "./controls";
import { SiteAccountCard } from "./SiteAccountCard";
import { BlacklistEditor } from "./BlacklistEditor";
import { BackupSection } from "./BackupSection";
import { CacheSection } from "./CacheSection";
import { UpdateSection } from "./UpdateSection";
import { EncryptionSection } from "./EncryptionSection";
import { ResetSection } from "./ResetSection";
import { SaucenaoSection } from "./SaucenaoSection";
import { ShlinkSection } from "./ShlinkSection";
import { VpnSection } from "./VpnSection";
import { SourceLoginsSection } from "./SourceLoginsSection";
import { SeenPostsSection } from "./SeenPostsSection";
import { WallpaperSection } from "./WallpaperSection";
import { SITES, SITE_DISPLAY_NAME, type Site } from "../../models/site";

interface CardProps {
  onOpenEula: () => void;
}

const ICON = 16;

// ---------------------------------------------------------------------------------- Account

export function AccountsCard(_: CardProps) {
  return (
    <SettingCard
      title="Site accounts"
      icon={<UserRound size={ICON} />}
      description="Your username and API key for each site. Stored encrypted on this device and only ever sent to that site."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {SITES.map((s) => (
          <SiteAccountCard key={s} site={s} />
        ))}
      </div>
    </SettingCard>
  );
}

// ---------------------------------------------------------------------------------- Content

const RATING_OPTIONS: { value: Rating; label: string; tone: string }[] = [
  { value: "s", label: "Safe", tone: "bg-green-500" },
  { value: "q", label: "Questionable", tone: "bg-amber-500" },
  { value: "e", label: "Explicit", tone: "bg-red-500" },
];

export function RatingsCard(_: CardProps) {
  const adultModeEnabled = useSettingsStore((s) => s.adultModeEnabled);
  const setAdultModeEnabled = useSettingsStore((s) => s.setAdultModeEnabled);
  const enabledRatings = useSettingsStore((s) => s.enabledRatings);
  const setEnabledRatings = useSettingsStore((s) => s.setEnabledRatings);

  function toggleRating(rating: Rating) {
    const next = enabledRatings.includes(rating)
      ? enabledRatings.filter((r) => r !== rating)
      : [...enabledRatings, rating];
    if (next.length > 0) setEnabledRatings(next);
  }

  return (
    <SettingCard title="Content ratings" icon={<ShieldAlert size={ICON} />}>
      <ToggleRow
        label="Adult mode"
        hint="Master switch - while off, results are locked to Safe whatever is picked below."
        checked={adultModeEnabled}
        onChange={setAdultModeEnabled}
      />
      <SettingRow label="Show ratings" hint="At least one stays on." disabled={!adultModeEnabled}>
        <div className="flex gap-1.5">
          {RATING_OPTIONS.map((r) => {
            const on = enabledRatings.includes(r.value);
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleRating(r.value)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  on
                    ? "border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent))]/15"
                    : "border-black/10 opacity-50 hover:opacity-80 dark:border-white/10"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${r.tone} ${on ? "" : "opacity-40"}`} />
                {r.label}
              </button>
            );
          })}
        </div>
      </SettingRow>
    </SettingCard>
  );
}

export function BlacklistCard(_: CardProps) {
  const activeSite = useSettingsStore((s) => s.site);
  // Which site's list is being edited - starts on the site being browsed, switchable here without
  // changing the browsing site.
  const [site, setSite] = useState<Site>(activeSite);
  const lineCounts = useSettingsStore((s) => s.blacklistBySite);
  return (
    <SettingCard
      title="Blacklist"
      icon={<ShieldBan size={ICON} />}
      description="Each site has its own blacklist, synced with that site's account. Posts matching any line of the current site's list are hidden everywhere in the app."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={site}
          onChange={setSite}
          options={SITES.map((s) => {
            const n = lineCounts[s].split("\n").filter((l) => l.trim()).length;
            return { value: s, label: `${SITE_DISPLAY_NAME[s]}${n ? ` (${n})` : ""}` };
          })}
        />
        {site !== activeSite && (
          <span className="text-xs opacity-60">Not the site you're browsing - applies when you switch to {SITE_DISPLAY_NAME[site]}.</span>
        )}
      </div>
      {/* key: a fresh editor per site, so one site's unsaved draft never lands in another's list */}
      <BlacklistEditor key={site} site={site} />
    </SettingCard>
  );
}

export function SeenCard(_: CardProps) {
  return (
    <SettingCard title="Seen posts" icon={<Eye size={ICON} />}>
      <SeenPostsSection />
    </SettingCard>
  );
}

// ---------------------------------------------------------------------------------- Appearance

const THEME_OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function ThemeCard(_: CardProps) {
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const palette = useSettingsStore((s) => s.palette);
  const setPalette = useSettingsStore((s) => s.setPalette);
  return (
    <SettingCard title="Theme" icon={<SunMoon size={ICON} />}>
      <SettingRow label="Mode" hint="System follows Windows' light/dark setting.">
        <Segmented value={themeMode} options={THEME_OPTIONS} onChange={setThemeMode} />
      </SettingRow>
      <SettingRow
        label="Palette"
        hint="Background and panel colours. Navy, OLED and Warm restyle dark mode; Warm also tints light mode."
      >
        <Segmented value={palette} options={PALETTES} onChange={setPalette} />
      </SettingRow>
    </SettingCard>
  );
}

const ACCENT_PRESETS = [
  "#6366f1", // indigo (default)
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
];

export function AccentCard(_: CardProps) {
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const custom = !ACCENT_PRESETS.includes(accentColor.toLowerCase());
  return (
    <SettingCard
      title="Accent colour"
      icon={<Paintbrush size={ICON} />}
      description="Buttons, highlights, the title bar glow."
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {ACCENT_PRESETS.map((color) => {
          const active = accentColor.toLowerCase() === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => setAccentColor(color)}
              title={color}
              aria-pressed={active}
              className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                active
                  ? "scale-110 ring-2 ring-black/50 ring-offset-2 ring-offset-[rgb(var(--lt-surface))] dark:ring-white/70 dark:ring-offset-[rgb(var(--dk-surface))]"
                  : ""
              }`}
              style={{ backgroundColor: color }}
            />
          );
        })}
        <label
          title="Custom colour"
          className={`relative flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-black/10 pl-1 pr-3 text-xs font-medium dark:border-white/10 ${
            custom ? "ring-2 ring-black/50 dark:ring-white/70" : ""
          }`}
        >
          <span
            className="h-6 w-6 rounded-full"
            style={{
              background: custom
                ? accentColor
                : "conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444)",
            }}
          />
          Custom
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </SettingCard>
  );
}

export function EffectsCard(_: CardProps) {
  const motionMode = useSettingsStore((s) => s.motionMode);
  const setMotionMode = useSettingsStore((s) => s.setMotionMode);
  const ambientHeader = useSettingsStore((s) => s.ambientHeader);
  const setAmbientHeader = useSettingsStore((s) => s.setAmbientHeader);
  const viewerAmbient = useSettingsStore((s) => s.viewerAmbient);
  const setViewerAmbient = useSettingsStore((s) => s.setViewerAmbient);
  return (
    <SettingCard title="Motion & effects" icon={<Sparkles size={ICON} />}>
      <SettingRow
        label="Motion"
        hint={`Reduced turns off animations and transitions. System follows Windows' "Animation effects" setting.`}
      >
        <Segmented value={motionMode} options={MOTION_MODES} onChange={setMotionMode} />
      </SettingRow>
      <ToggleRow
        label="Ambient title bar"
        hint="A soft accent-coloured glow behind the title bar."
        checked={ambientHeader}
        onChange={setAmbientHeader}
      />
      <ToggleRow
        label="Post viewer glow"
        hint="The viewer's backdrop takes on each post's colours."
        checked={viewerAmbient}
        onChange={setViewerAmbient}
      />
    </SettingCard>
  );
}

export function GridCard(_: CardProps) {
  const size = useSettingsStore((s) => s.gridThumbnailSizePx);
  const setSize = useSettingsStore((s) => s.setGridThumbnailSizePx);
  return (
    <SettingCard title="Grid" icon={<LayoutGrid size={ICON} />}>
      <SettingRow label="Thumbnail size" hint="Also adjustable from the slider in the top bar.">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={MIN_THUMBNAIL_SIZE_PX}
            max={MAX_THUMBNAIL_SIZE_PX}
            step={10}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-40 accent-[rgb(var(--accent))]"
          />
          <span className="w-12 text-right text-xs tabular-nums opacity-60">{size}px</span>
          <button
            type="button"
            onClick={() => setSize(DEFAULT_THUMBNAIL_SIZE_PX)}
            disabled={size === DEFAULT_THUMBNAIL_SIZE_PX}
            title="Reset to default"
            className="opacity-60 hover:text-[rgb(var(--accent))] hover:opacity-100 disabled:invisible"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </SettingRow>
    </SettingCard>
  );
}

// ---------------------------------------------------------------------------------- Mascot

const MASCOT_TALK: { value: MascotTalk; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "sometimes", label: "Sometimes" },
  { value: "chatty", label: "Chatty" },
  { value: "always", label: "Always" },
];

const MASCOT_MODES: { value: MascotMode; label: string }[] = [
  { value: "companion", label: "Companion" },
  { value: "cameos", label: "Cameos" },
  { value: "off", label: "Off" },
];

export function MascotCard(_: CardProps) {
  const mascotMode = useSettingsStore((s) => s.mascotMode);
  const setMascotMode = useSettingsStore((s) => s.setMascotMode);
  const mascotTalk = useSettingsStore((s) => s.mascotTalk);
  const setMascotTalk = useSettingsStore((s) => s.setMascotTalk);
  const mascotSpicy = useSettingsStore((s) => s.mascotSpicy);
  const setMascotSpicy = useSettingsStore((s) => s.setMascotSpicy);
  const explicitOn = useSettingsStore((s) => s.adultModeEnabled && s.enabledRatings.includes("e"));
  const mascotHidden = useMascotStore((s) => s.hiddenForSession);
  const restoreMascot = useMascotStore((s) => s.restore);
  const off = mascotMode === "off";

  return (
    <SettingCard
      title={MASCOT_NAME}
      icon={<Bot size={ICON} />}
      description={`${MASCOT_NAME} the raccoon reacts to favorites, votes, searches and more.`}
      action={
        mascotHidden && !off ? (
          <Button onClick={restoreMascot}>Hidden - restore</Button>
        ) : undefined
      }
    >
      <SettingRow
        label="Mode"
        hint="Companion sits in a corner of the grid (drag to move, right-click to hide); Cameos pops in briefly instead."
      >
        <Segmented value={mascotMode} options={MASCOT_MODES} onChange={setMascotMode} />
      </SettingRow>
      <SettingRow
        label="Talkativeness"
        disabled={off}
        hint={
          mascotTalk === "always"
            ? `Every reaction with something to say gets a line. ${MASCOT_NAME} will not shut up.`
            : mascotTalk === "never"
              ? `${MASCOT_NAME} still reacts, but never says a word.`
              : mascotTalk === "chatty"
                ? "About twice as talkative - most reactions get a line, with a short breather between."
                : "A line now and then - at most one every few minutes."
        }
      >
        <Segmented value={mascotTalk} options={MASCOT_TALK} onChange={setMascotTalk} />
      </SettingRow>
      {explicitOn && (
        <ToggleRow
          label={`Let ${MASCOT_NAME} get cheeky 😏`}
          hint="Only while adult mode and Explicit are on."
          checked={mascotSpicy}
          disabled={off || mascotTalk === "never"}
          onChange={setMascotSpicy}
        />
      )}
    </SettingCard>
  );
}

// ---------------------------------------------------------------------------------- Media

export function VideoCard(_: CardProps) {
  const loop = useSettingsStore((s) => s.videoLoopEnabled);
  const setLoop = useSettingsStore((s) => s.setVideoLoopEnabled);
  const autoplay = useSettingsStore((s) => s.videoAutoplayEnabled);
  const setAutoplay = useSettingsStore((s) => s.setVideoAutoplayEnabled);
  const speed = useSettingsStore((s) => s.videoPlaybackSpeed);
  const setSpeed = useSettingsStore((s) => s.setVideoPlaybackSpeed);
  return (
    <SettingCard title="Video playback" icon={<PlayCircle size={ICON} />}>
      <ToggleRow label="Autoplay when opened" checked={autoplay} onChange={setAutoplay} />
      <ToggleRow label="Loop by default" checked={loop} onChange={setLoop} />
      <SettingRow label="Default speed">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={MIN_VIDEO_SPEED}
            max={MAX_VIDEO_SPEED}
            step={STEP_VIDEO_SPEED}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-40 accent-[rgb(var(--accent))]"
          />
          <span className="w-10 text-right text-xs tabular-nums opacity-60">{speed}×</span>
        </div>
      </SettingRow>
    </SettingCard>
  );
}

export function VotingCard(_: CardProps) {
  const favUpvoteSync = useSettingsStore((s) => s.favUpvoteSync);
  const setFavUpvoteSync = useSettingsStore((s) => s.setFavUpvoteSync);
  return (
    <SettingCard title="Favorites & voting" icon={<Heart size={ICON} />}>
      <ToggleRow
        label="Upvote posts when I favorite them"
        hint="One-way: unfavoriting keeps the upvote, and upvoting never adds a favorite."
        checked={favUpvoteSync}
        onChange={setFavUpvoteSync}
      />
    </SettingCard>
  );
}

export function DownloadsCard(_: CardProps) {
  const downloadDir = useSettingsStore((s) => s.downloadDir);
  const setDownloadDir = useSettingsStore((s) => s.setDownloadDir);

  async function choose() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setDownloadDir(selected);
  }

  return (
    <SettingCard title="Downloads" icon={<Download size={ICON} />}>
      <SettingRow
        label="Save to"
        hint={
          <span className="block truncate font-mono" title={downloadDir ?? undefined}>
            {downloadDir ?? "Default - your Pictures / Videos folder"}
          </span>
        }
      >
        <div className="flex items-center gap-2">
          <Button icon={<FolderOpen size={13} />} onClick={() => void choose()}>
            Choose folder…
          </Button>
          {downloadDir && <Button onClick={() => setDownloadDir(null)}>Reset</Button>}
        </div>
      </SettingRow>
    </SettingCard>
  );
}

export function WallpaperCard(_: CardProps) {
  return (
    <SettingCard title="Desktop wallpaper" icon={<ImageIcon size={ICON} />}>
      <WallpaperSection />
    </SettingCard>
  );
}

// ---------------------------------------------------------------------------------- Integrations

export function ReverseSearchCard(_: CardProps) {
  return (
    <SettingCard title="Reverse image search" icon={<ScanSearch size={ICON} />}>
      <SaucenaoSection />
    </SettingCard>
  );
}

export function VpnCard(_: CardProps) {
  return (
    <SettingCard title="WireGuard VPN" icon={<Network size={ICON} />}>
      <VpnSection />
    </SettingCard>
  );
}

export function ShlinkCard(_: CardProps) {
  return (
    <SettingCard title="Link shortener" icon={<Link2 size={ICON} />}>
      <ShlinkSection />
    </SettingCard>
  );
}

export function SourceLoginsCard(_: CardProps) {
  return (
    <SettingCard title="Source logins" icon={<KeyRound size={ICON} />}>
      <SourceLoginsSection />
    </SettingCard>
  );
}

// ---------------------------------------------------------------------------------- Privacy

export function EncryptionCard(_: CardProps) {
  const [passwordProtected, setPasswordProtected] = useState<boolean | null>(null);
  useEffect(() => {
    void e621Api.getVaultStatus().then((status) => setPasswordProtected(status.password_protected));
  }, []);
  return (
    <SettingCard
      title="Encryption"
      icon={<Lock size={ICON} />}
      action={
        passwordProtected ? (
          <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-600 dark:text-green-400">
            Password on
          </span>
        ) : undefined
      }
    >
      {passwordProtected !== null && <EncryptionSection passwordProtected={passwordProtected} />}
    </SettingCard>
  );
}

export function BackupCard(_: CardProps) {
  return (
    <SettingCard title="Backup & restore" icon={<Archive size={ICON} />}>
      <BackupSection />
    </SettingCard>
  );
}

export function CacheCard(_: CardProps) {
  return (
    <SettingCard title="Cache" icon={<Database size={ICON} />}>
      <CacheSection />
    </SettingCard>
  );
}

// ---------------------------------------------------------------------------------- About

export function UpdatesCard(_: CardProps) {
  return (
    <SettingCard title="Updates" icon={<Download size={ICON} />}>
      <UpdateSection />
    </SettingCard>
  );
}

export function LegalCard({ onOpenEula }: CardProps) {
  return (
    <SettingCard title="Legal" icon={<FileText size={ICON} />}>
      <SettingRow
        label={
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={15} className="text-[rgb(var(--accent))]" />
            You've agreed to the EULA
          </span>
        }
      >
        <Button onClick={onOpenEula}>Read it again</Button>
      </SettingRow>
    </SettingCard>
  );
}

export function ResetCard(_: CardProps) {
  return (
    <section className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/[0.04] p-4">
      <header className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-red-500/15 text-red-500">
          <RotateCcw size={ICON} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Reset</h3>
          <p className="text-xs opacity-60">Danger zone - these can't be undone.</p>
        </div>
      </header>
      <ResetSection />
    </section>
  );
}

/** App name + version, copyright and the developer's handle - matches the reference Android
 *  app's Settings footer. Version comes from `getVersion()`, never hardcoded. */
export function CreditsFooter() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);
  return (
    <div className="flex flex-col gap-0.5 border-t border-black/10 px-4 py-3 text-[11px] opacity-60 dark:border-white/10">
      <p className="font-semibold">Monosodium Desktop{version ? ` v${version}` : ""}</p>
      <p>© {new Date().getFullYear()} Procione DeConti</p>
      <button
        type="button"
        onClick={() => void openUrl("https://t.me/ProcioneDeConti")}
        className="self-start text-[rgb(var(--accent))] underline-offset-2 hover:underline"
      >
        @ProcioneDeConti
      </button>
    </div>
  );
}
