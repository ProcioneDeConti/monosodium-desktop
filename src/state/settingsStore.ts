// Desktop analogue of the reference Android app's DataStore-backed UserPreferences/UserSettings
// (data/settings/UserPreferences.kt, UserSettings.kt). Non-secret settings persist via
// tauri-plugin-store (a JSON file under the app's config dir); account credentials are kept out
// of this store entirely and live in Windows Credential Manager (see api/client.ts's
// save/load/deleteCredentials, backed by src-tauri/src/credentials.rs).

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { Rating } from "../models/post";
import type { Site } from "../models/site";
import { parseBlacklist, type BlacklistEntries } from "../lib/blacklist";
import {
  clampSlideshowInterval,
  DEFAULT_SLIDESHOW_INTERVAL_SEC,
  DEFAULT_SLIDESHOW_TRANSITION,
  type SlideshowTransition,
} from "../lib/slideshow";

const STORE_FILE = "settings.json";
const DEFAULT_RATINGS: Rating[] = ["s", "q", "e"];
export const DEFAULT_THUMBNAIL_SIZE_PX = 220;
export const MIN_THUMBNAIL_SIZE_PX = 120;
export const MAX_THUMBNAIL_SIZE_PX = 420;
export const MIN_VIDEO_SPEED = 0.25;
export const MAX_VIDEO_SPEED = 2.0;
export const STEP_VIDEO_SPEED = 0.25;
export const DEFAULT_VIDEO_SPEED = 1;

interface SettingsState {
  isLoaded: boolean;
  site: Site;
  enabledRatings: Rating[];
  /** While false, the app is locked to safe-rated content regardless of enabledRatings. */
  adultModeEnabled: boolean;
  blacklist: string;
  blacklistEntries: BlacklistEntries;
  blacklistDisabled: boolean;
  accentColor: string;
  gridThumbnailSizePx: number;
  videoLoopEnabled: boolean;
  videoPlaybackSpeed: number;
  videoAutoplayEnabled: boolean;
  downloadDir: string | null;
  slideshowIntervalSec: number;
  slideshowTransition: SlideshowTransition;

  setSite: (site: Site) => void;
  setEnabledRatings: (ratings: Rating[]) => void;
  setAdultModeEnabled: (enabled: boolean) => void;
  setBlacklist: (blacklist: string) => void;
  setBlacklistDisabled: (disabled: boolean) => void;
  setAccentColor: (color: string) => void;
  setGridThumbnailSizePx: (size: number) => void;
  setVideoLoopEnabled: (enabled: boolean) => void;
  setVideoPlaybackSpeed: (speed: number) => void;
  setVideoAutoplayEnabled: (enabled: boolean) => void;
  setDownloadDir: (dir: string | null) => void;
  setSlideshowIntervalSec: (seconds: number) => void;
  setSlideshowTransition: (transition: SlideshowTransition) => void;

  /** e621 search syntax: leading `~` ORs ratings together; one enabled rating needs none; all enabled means no filter. */
  ratingTagFilter: () => string | null;
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(STORE_FILE, { autoSave: true });
  return storePromise;
}

async function persist<K extends string>(key: K, value: unknown) {
  const store = await getStore();
  await store.set(key, value);
}

const RATING_TAGS: Record<Rating, string> = {
  s: "rating:safe",
  q: "rating:questionable",
  e: "rating:explicit",
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  isLoaded: false,
  site: "e621",
  enabledRatings: DEFAULT_RATINGS,
  adultModeEnabled: false,
  blacklist: "",
  blacklistEntries: [],
  blacklistDisabled: false,
  accentColor: "#6366f1",
  gridThumbnailSizePx: DEFAULT_THUMBNAIL_SIZE_PX,
  videoLoopEnabled: true,
  videoPlaybackSpeed: DEFAULT_VIDEO_SPEED,
  videoAutoplayEnabled: true,
  downloadDir: null,
  slideshowIntervalSec: DEFAULT_SLIDESHOW_INTERVAL_SEC,
  slideshowTransition: DEFAULT_SLIDESHOW_TRANSITION,

  setSite: (site) => {
    set({ site });
    void persist("site", site);
  },
  setEnabledRatings: (enabledRatings) => {
    set({ enabledRatings });
    void persist("enabledRatings", enabledRatings);
  },
  setAdultModeEnabled: (adultModeEnabled) => {
    set({ adultModeEnabled });
    void persist("adultModeEnabled", adultModeEnabled);
  },
  setBlacklist: (blacklist) => {
    set({ blacklist, blacklistEntries: parseBlacklist(blacklist) });
    void persist("blacklist", blacklist);
  },
  setBlacklistDisabled: (blacklistDisabled) => set({ blacklistDisabled }),
  setAccentColor: (accentColor) => {
    set({ accentColor });
    void persist("accentColor", accentColor);
  },
  setGridThumbnailSizePx: (size) => {
    const clamped = Math.min(MAX_THUMBNAIL_SIZE_PX, Math.max(MIN_THUMBNAIL_SIZE_PX, size));
    set({ gridThumbnailSizePx: clamped });
    void persist("gridThumbnailSizePx", clamped);
  },
  setVideoLoopEnabled: (videoLoopEnabled) => {
    set({ videoLoopEnabled });
    void persist("videoLoopEnabled", videoLoopEnabled);
  },
  setVideoPlaybackSpeed: (videoPlaybackSpeed) => {
    set({ videoPlaybackSpeed });
    void persist("videoPlaybackSpeed", videoPlaybackSpeed);
  },
  setVideoAutoplayEnabled: (videoAutoplayEnabled) => {
    set({ videoAutoplayEnabled });
    void persist("videoAutoplayEnabled", videoAutoplayEnabled);
  },
  setDownloadDir: (downloadDir) => {
    set({ downloadDir });
    void persist("downloadDir", downloadDir);
  },
  setSlideshowIntervalSec: (seconds) => {
    const slideshowIntervalSec = clampSlideshowInterval(seconds);
    set({ slideshowIntervalSec });
    void persist("slideshowIntervalSec", slideshowIntervalSec);
  },
  setSlideshowTransition: (slideshowTransition) => {
    set({ slideshowTransition });
    void persist("slideshowTransition", slideshowTransition);
  },

  ratingTagFilter: () => {
    const { adultModeEnabled, enabledRatings } = get();
    const effective = adultModeEnabled ? enabledRatings : (["s"] as Rating[]);
    if (effective.length === 0 || effective.length === 3) return null;
    if (effective.length === 1) return RATING_TAGS[effective[0]];
    return effective.map((r) => `~${RATING_TAGS[r]}`).join(" ");
  },
}));

/** Hydrates the store from disk on app boot. Call once, before rendering the shell. */
export async function loadSettings(): Promise<void> {
  const store = await getStore();
  const entries = await store.entries<unknown>();
  const values = Object.fromEntries(entries);
  useSettingsStore.setState((state) => {
    const blacklist = (values.blacklist as string) ?? state.blacklist;
    return {
      ...state,
      site: (values.site as Site) ?? state.site,
      enabledRatings: (values.enabledRatings as Rating[]) ?? state.enabledRatings,
      adultModeEnabled: (values.adultModeEnabled as boolean) ?? state.adultModeEnabled,
      blacklist,
      blacklistEntries: parseBlacklist(blacklist),
      accentColor: (values.accentColor as string) ?? state.accentColor,
      gridThumbnailSizePx: (values.gridThumbnailSizePx as number) ?? state.gridThumbnailSizePx,
      videoLoopEnabled: (values.videoLoopEnabled as boolean) ?? state.videoLoopEnabled,
      videoPlaybackSpeed: (values.videoPlaybackSpeed as number) ?? state.videoPlaybackSpeed,
      videoAutoplayEnabled: (values.videoAutoplayEnabled as boolean) ?? state.videoAutoplayEnabled,
      downloadDir: (values.downloadDir as string | null) ?? state.downloadDir,
      slideshowIntervalSec:
        (values.slideshowIntervalSec as number) ?? state.slideshowIntervalSec,
      slideshowTransition:
        (values.slideshowTransition as SlideshowTransition) ?? state.slideshowTransition,
      isLoaded: true,
    };
  });
}
