import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { FolderOpen, X } from "lucide-react";
import {
  DEFAULT_THUMBNAIL_SIZE_PX,
  MAX_VIDEO_SPEED,
  MIN_VIDEO_SPEED,
  STEP_VIDEO_SPEED,
  useSettingsStore,
} from "../../state/settingsStore";
import { useAccountStore } from "../../state/accountStore";
import type { Rating } from "../../models/post";
import { randomGreeting } from "../../lib/greetings";
import { SiteAccountCard } from "./SiteAccountCard";
import { BlacklistSection } from "./BlacklistSection";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Section } from "../ui/Section";

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
  const adultModeEnabled = useSettingsStore((s) => s.adultModeEnabled);
  const setAdultModeEnabled = useSettingsStore((s) => s.setAdultModeEnabled);
  const enabledRatings = useSettingsStore((s) => s.enabledRatings);
  const setEnabledRatings = useSettingsStore((s) => s.setEnabledRatings);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
    <div className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl animate-[scale-in_150ms_ease-out] flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <h1 className="text-sm font-semibold">Settings</h1>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
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

          <Section title="Appearance">
            <div className="flex items-center gap-2">
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAccentColor(color)}
                  title={color}
                  className={`h-7 w-7 rounded-full ${accentColor === color ? "ring-2 ring-offset-2 ring-offset-[rgb(250,250,250)] dark:ring-offset-[rgb(24,24,24)] ring-black/50 dark:ring-white/70" : ""}`}
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

          <CreditsFooter />
        </div>
      </div>
    </div>
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
      <p>e621 Desktop{version ? ` v${version}` : ""}</p>
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
