import { MASCOT_NAME } from "../../lib/mascot";
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { CheckCircle2, FolderOpen, Monitor, Moon, Sun, X } from "lucide-react";
import {
  DEFAULT_THUMBNAIL_SIZE_PX,
  MAX_VIDEO_SPEED,
  MIN_VIDEO_SPEED,
  STEP_VIDEO_SPEED,
  useSettingsStore,
  type MascotMode,
  type MascotTalk,
} from "../../state/settingsStore";
import { useMascotStore } from "../../state/mascotStore";
import { useAccountStore } from "../../state/accountStore";
import { e621Api } from "../../api/client";
import type { Rating } from "../../models/post";
import { randomGreeting } from "../../lib/greetings";
import { SiteAccountCard } from "./SiteAccountCard";
import { BlacklistSection } from "./BlacklistSection";
import { BackupSection } from "./BackupSection";
import { CacheSection } from "./CacheSection";
import { UpdateSection } from "./UpdateSection";
import { EncryptionSection } from "./EncryptionSection";
import { ResetSection } from "./ResetSection";
import { EulaReadOnlyDialog } from "../Eula/EulaReadOnlyDialog";
import { SaucenaoSection } from "./SaucenaoSection";
import { SourceLoginsSection } from "./SourceLoginsSection";
import { SeenPostsSection } from "./SeenPostsSection";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Overlay, type OverlayHandle } from "../ui/Overlay";
import { MOTION_MODES, PALETTES } from "../../lib/theme";
import { Section } from "../ui/Section";

const MASCOT_TALK: { value: MascotTalk; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "sometimes", label: "Sometimes" },
  { value: "always", label: "Always" },
];

const MASCOT_MODES: { value: MascotMode; label: string }[] = [
  { value: "companion", label: "Companion" },
  { value: "cameos", label: "Cameos" },
  { value: "off", label: "Off" },
];

interface SettingsPanelProps {
  onClose: () => void;
  onOpenProfile: () => void;
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

const THEME_OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

const RATING_OPTIONS: { value: Rating; label: string }[] = [
  { value: "s", label: "Safe" },
  { value: "q", label: "Questionable" },
  { value: "e", label: "Explicit" },
];

export function SettingsPanel({ onClose, onOpenProfile }: SettingsPanelProps) {
  const site = useSettingsStore((s) => s.site);
  const account = useAccountStore((s) => s.accounts[site]);
  // Re-picked every time Settings opens (mount = open, since this component is only ever
  // rendered while open) - mirrors the reference Android app's nav drawer, which re-rolls its
  // greeting every time it's opened rather than keeping the same one all session.
  const [greeting] = useState(randomGreeting);
  const [showEula, setShowEula] = useState(false);
  const [passwordProtected, setPasswordProtected] = useState<boolean | null>(null);
  const overlay = useRef<OverlayHandle>(null);
  const adultModeEnabled = useSettingsStore((s) => s.adultModeEnabled);
  const setAdultModeEnabled = useSettingsStore((s) => s.setAdultModeEnabled);
  const enabledRatings = useSettingsStore((s) => s.enabledRatings);
  const setEnabledRatings = useSettingsStore((s) => s.setEnabledRatings);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const palette = useSettingsStore((s) => s.palette);
  const setPalette = useSettingsStore((s) => s.setPalette);
  const motionMode = useSettingsStore((s) => s.motionMode);
  const mascotMode = useSettingsStore((s) => s.mascotMode);
  const setMascotMode = useSettingsStore((s) => s.setMascotMode);
  const mascotTalk = useSettingsStore((s) => s.mascotTalk);
  const setMascotTalk = useSettingsStore((s) => s.setMascotTalk);
  const mascotSpicy = useSettingsStore((s) => s.mascotSpicy);
  const setMascotSpicy = useSettingsStore((s) => s.setMascotSpicy);
  const explicitOn = useSettingsStore((s) => s.adultModeEnabled && s.enabledRatings.includes("e"));
  const mascotHidden = useMascotStore((s) => s.hiddenForSession);
  const restoreMascot = useMascotStore((s) => s.restore);
  const setMotionMode = useSettingsStore((s) => s.setMotionMode);
  const ambientHeader = useSettingsStore((s) => s.ambientHeader);
  const setAmbientHeader = useSettingsStore((s) => s.setAmbientHeader);
  const viewerAmbient = useSettingsStore((s) => s.viewerAmbient);
  const setViewerAmbient = useSettingsStore((s) => s.setViewerAmbient);
  const videoLoopEnabled = useSettingsStore((s) => s.videoLoopEnabled);
  const setVideoLoopEnabled = useSettingsStore((s) => s.setVideoLoopEnabled);
  const videoAutoplayEnabled = useSettingsStore((s) => s.videoAutoplayEnabled);
  const setVideoAutoplayEnabled = useSettingsStore((s) => s.setVideoAutoplayEnabled);
  const videoPlaybackSpeed = useSettingsStore((s) => s.videoPlaybackSpeed);
  const setVideoPlaybackSpeed = useSettingsStore((s) => s.setVideoPlaybackSpeed);
  const gridThumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const setGridThumbnailSizePx = useSettingsStore((s) => s.setGridThumbnailSizePx);
  const downloadDir = useSettingsStore((s) => s.downloadDir);
  const setDownloadDir = useSettingsStore((s) => s.setDownloadDir);

  useEffect(() => {
    void e621Api.getVaultStatus().then((status) => setPasswordProtected(status.password_protected));
  }, []);

  function toggleRating(rating: Rating) {
    const next = enabledRatings.includes(rating)
      ? enabledRatings.filter((r) => r !== rating)
      : [...enabledRatings, rating];
    if (next.length > 0) setEnabledRatings(next);
  }

  async function chooseDownloadFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setDownloadDir(selected);
  }

  return (
    <Overlay ref={overlay} onClose={onClose} variant="sheet" sheetWidth="max-w-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <h1 className="text-sm font-semibold">Settings</h1>
          <IconButton onClick={() => overlay.current?.close()} title="Close (Esc)" className="ml-auto">
            <X size={18} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-5">
            <p className="text-xl font-black tracking-tight text-[rgb(var(--accent))]">{greeting},</p>
            {account?.username && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProfile();
                }}
                className="text-sm font-medium opacity-70 transition-opacity hover:text-[rgb(var(--accent))] hover:opacity-100"
              >
                {account.username}
              </button>
            )}
          </div>

          <Section title="Accounts">
            <div className="flex flex-col gap-3">
              <SiteAccountCard site="e621" />
              <SiteAccountCard site="e6ai" />
            </div>
          </Section>

          <Section title="Content ratings">
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={adultModeEnabled}
                onChange={(e) => setAdultModeEnabled(e.target.checked)}
                className="accent-[rgb(var(--accent))]"
              />
              Adult mode (allow non-safe content)
            </label>
            <p className="mb-2 pl-1 text-xs opacity-60">
              Master switch - while off, results are locked to Safe regardless of the checkboxes
              below.
            </p>
            <div className="flex gap-4 pl-1">
              {RATING_OPTIONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-1.5 text-sm ${!adultModeEnabled ? "opacity-40" : ""}`}
                >
                  <input
                    type="checkbox"
                    disabled={!adultModeEnabled}
                    checked={enabledRatings.includes(r.value)}
                    onChange={() => toggleRating(r.value)}
                    className="accent-[rgb(var(--accent))]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Blacklist">
            <BlacklistSection site={site} />
          </Section>

          <Section title="Seen posts">
            <SeenPostsSection />
          </Section>

          <Section title="Appearance">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm w-36 shrink-0">Theme</span>
              <div className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-black/10 dark:border-white/10">
                {THEME_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setThemeMode(o.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                      themeMode === o.value
                        ? "bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]"
                        : "hover:bg-black/5 dark:hover:bg-white/10"
                    }`}
                  >
                    <o.icon size={14} />
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm w-36 shrink-0">Palette</span>
              <Segmented value={palette} options={PALETTES} onChange={setPalette} />
            </div>
            <p className="-mt-3 mb-4 pl-[9.5rem] text-xs opacity-60">
              Background and panel colours. Navy, OLED and Warm restyle dark mode; Warm also tints
              light mode.
            </p>

            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm w-36 shrink-0">Motion</span>
              <Segmented value={motionMode} options={MOTION_MODES} onChange={setMotionMode} />
            </div>
            <p className="-mt-3 mb-4 pl-[9.5rem] text-xs opacity-60">
              Reduced turns off animations and transitions. System follows Windows' "Animation
              effects" setting.
            </p>

            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ambientHeader}
                onChange={(e) => setAmbientHeader(e.target.checked)}
                className="accent-[rgb(var(--accent))]"
              />
              Ambient title bar (soft accent-coloured glow)
            </label>
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={viewerAmbient}
                onChange={(e) => setViewerAmbient(e.target.checked)}
                className="accent-[rgb(var(--accent))]"
              />
              Post viewer glows with each post's colours
            </label>

            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm w-36 shrink-0">Mascot ({MASCOT_NAME})</span>
              <Segmented value={mascotMode} options={MASCOT_MODES} onChange={setMascotMode} />
            </div>
            <p className="-mt-3 mb-2 pl-[9.5rem] text-xs opacity-60">
              {MASCOT_NAME} the raccoon reacts to favorites, votes, searches and more. Companion sits in a corner
              of the grid (drag it to move, right-click to hide); Cameos pops in briefly instead.
            </p>
            <div className={`mb-4 flex items-center gap-2 ${mascotMode === "off" ? "pointer-events-none opacity-40" : ""}`}>
              <span className="text-sm w-36 shrink-0">Talkativeness</span>
              <Segmented value={mascotTalk} options={MASCOT_TALK} onChange={setMascotTalk} />
            </div>
            <p className="-mt-3 mb-3 pl-[9.5rem] text-xs opacity-60">
              {mascotTalk === "always"
                ? `Every reaction with something to say gets a line. ${MASCOT_NAME} will not shut up.`
                : mascotTalk === "never"
                  ? `${MASCOT_NAME} still reacts, but never says a word.`
                  : `A line now and then - at most one every few minutes.`}
            </p>
            {explicitOn && (
              <label
                className={`-mt-2 mb-4 flex items-center gap-2 pl-[9.5rem] text-sm ${mascotMode === "off" || mascotTalk === "never" ? "opacity-40" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={mascotSpicy}
                  disabled={mascotMode === "off" || mascotTalk === "never"}
                  onChange={(e) => setMascotSpicy(e.target.checked)}
                  className="accent-[rgb(var(--accent))]"
                />
                Let {MASCOT_NAME} get cheeky 😏
              </label>
            )}
            {mascotHidden && mascotMode !== "off" && (
              <div className="-mt-2 mb-4 flex items-center gap-2 pl-[9.5rem] text-xs">
                <span className="opacity-60">{MASCOT_NAME} hidden</span>
                <span className="opacity-30">-</span>
                <button
                  type="button"
                  onClick={restoreMascot}
                  className="font-semibold text-[rgb(var(--accent))] hover:underline"
                >
                  Restore
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAccentColor(color)}
                  title={color}
                  className={`h-7 w-7 rounded-full ${accentColor === color ? "ring-2 ring-offset-2 ring-offset-[rgb(var(--lt-surface))] dark:ring-offset-[rgb(var(--dk-surface))] ring-black/50 dark:ring-white/70" : ""}`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded border border-black/10 dark:border-white/10 bg-transparent"
                title="Custom color"
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm w-36 shrink-0">Default thumbnail size</span>
              <span className="text-xs tabular-nums opacity-60">{gridThumbnailSizePx}px</span>
              {gridThumbnailSizePx !== DEFAULT_THUMBNAIL_SIZE_PX && (
                <button
                  type="button"
                  onClick={() => setGridThumbnailSizePx(DEFAULT_THUMBNAIL_SIZE_PX)}
                  className="text-xs text-[rgb(var(--accent))] hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </Section>

          <Section title="Video">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={videoLoopEnabled}
                  onChange={(e) => setVideoLoopEnabled(e.target.checked)}
                  className="accent-[rgb(var(--accent))]"
                />
                Loop videos by default
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={videoAutoplayEnabled}
                  onChange={(e) => setVideoAutoplayEnabled(e.target.checked)}
                  className="accent-[rgb(var(--accent))]"
                />
                Autoplay videos when opened
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm w-36 shrink-0">Default speed</span>
                <input
                  type="range"
                  min={MIN_VIDEO_SPEED}
                  max={MAX_VIDEO_SPEED}
                  step={STEP_VIDEO_SPEED}
                  value={videoPlaybackSpeed}
                  onChange={(e) => setVideoPlaybackSpeed(Number(e.target.value))}
                  className="w-40 accent-[rgb(var(--accent))]"
                />
                <span className="text-xs tabular-nums opacity-60">{videoPlaybackSpeed}×</span>
              </div>
            </div>
          </Section>

          <Section title="Downloads">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm opacity-80">
                {downloadDir ?? "Default (Pictures/Videos folder)"}
              </span>
              <Button icon={<FolderOpen size={13} />} onClick={() => void chooseDownloadFolder()}>
                Choose folder…
              </Button>
              {downloadDir && (
                <button
                  type="button"
                  onClick={() => setDownloadDir(null)}
                  className="text-xs text-[rgb(var(--accent))] hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </Section>

          <Section title="Encryption">
            {passwordProtected !== null && <EncryptionSection passwordProtected={passwordProtected} />}
          </Section>

          <Section title="Backup & Restore">
            <BackupSection />
          </Section>

          <Section title="Reverse Image Search">
            <SaucenaoSection />
          </Section>

          <Section title="Source logins">
            <SourceLoginsSection />
          </Section>

          <Section title="Cache">
            <CacheSection />
          </Section>

          <Section title="Legal">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={16} className="text-[rgb(var(--accent))]" />
              User has agreed to EULA
            </div>
            <Button onClick={() => setShowEula(true)} className="mt-2">
              Read EULA Again
            </Button>
          </Section>

          <Section title="Updates">
            <UpdateSection />
          </Section>

          <Section title="Reset">
            <ResetSection />
          </Section>

          <CreditsFooter />
        </div>

      {showEula && <EulaReadOnlyDialog onClose={() => setShowEula(false)} />}
    </Overlay>
  );
}

/** Matches the reference Android app's Settings footer (app name + version, copyright, and a
 *  link to the developer's handle). The version comes from `getVersion()` rather than being
 *  hardcoded, so it always matches whatever's actually declared in tauri.conf.json/Cargo.toml. */
function CreditsFooter() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  return (
    <div className="mt-2 flex flex-col items-center gap-0.5 pb-2 text-center text-xs opacity-60">
      <p>Monosodium Desktop{version ? ` v${version}` : ""}</p>
      <p>© {new Date().getFullYear()} Procione DeConti</p>
      <button
        type="button"
        onClick={() => void openUrl("https://t.me/ProcioneDeConti")}
        className="text-[rgb(var(--accent))] underline-offset-2 hover:underline"
      >
        @ProcioneDeConti
      </button>
    </div>
  );
}

/** A small segmented control - same look as the Theme switcher above, without icons. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-black/10 dark:border-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs transition-colors ${
            value === o.value
              ? "bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]"
              : "hover:bg-black/5 dark:hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
