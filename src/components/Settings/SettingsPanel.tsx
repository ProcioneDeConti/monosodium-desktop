import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  DEFAULT_THUMBNAIL_SIZE_PX,
  MAX_VIDEO_SPEED,
  MIN_VIDEO_SPEED,
  STEP_VIDEO_SPEED,
  useSettingsStore,
} from "../../state/settingsStore";
import type { Rating } from "../../models/post";
import { SiteAccountCard } from "./SiteAccountCard";
import { BlacklistSection } from "./BlacklistSection";

interface SettingsPanelProps {
  onClose: () => void;
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide opacity-60">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const site = useSettingsStore((s) => s.site);
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
    <div className="fixed inset-0 z-50 flex justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <h1 className="text-sm font-semibold">Settings</h1>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded px-2 py-1 text-lg hover:bg-black/5 dark:hover:bg-white/10"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
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
              <button
                type="button"
                onClick={() => void chooseDownloadFolder()}
                className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5"
              >
                Choose folder…
              </button>
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
        </div>
      </div>
    </div>
  );
}
