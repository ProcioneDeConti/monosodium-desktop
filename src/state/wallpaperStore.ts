// Desktop wallpaper mode's choices + rotation bookkeeping. Own tauri-plugin-store file, same
// pattern as savedSearchesStore.ts - device-local (the wallpaper is this PC's desktop), so it's
// deliberately not part of Settings > Backup.

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { e621Api } from "../api/client";
import { SITES } from "../models/site";
import {
  DEFAULT_ROTATION_INTERVAL_MIN,
  pushRecent,
  type WallpaperFit,
  type WallpaperSource,
} from "../lib/wallpaper";
import type { Site } from "../models/site";

const STORE_FILE = "wallpaper.json";

interface Persisted {
  rotationEnabled: boolean;
  source: WallpaperSource | null;
  intervalMin: number;
  fit: WallpaperFit;
  /** Rotation shows Safe-rated posts only (default on - anyone can see a desktop). */
  safeOnly: boolean;
  lastChangedAt: number;
  current: { postId: number; site: Site } | null;
  recentIds: number[];
}

interface WallpaperState extends Persisted {
  isLoaded: boolean;
  /** Last rotation failure, for Settings; not persisted. */
  lastError: string | null;
  /** After a failed rotation, when to try again; not persisted. */
  retryAt: number | null;
  setRotationEnabled: (enabled: boolean) => void;
  setSource: (source: WallpaperSource | null) => void;
  setIntervalMin: (min: number) => void;
  setFit: (fit: WallpaperFit) => void;
  setSafeOnly: (safeOnly: boolean) => void;
  /** A wallpaper was just applied (by rotation or by hand) - restarts the interval. */
  recordChange: (postId: number, site: Site) => void;
  recordFailure: (message: string, retryAt: number) => void;
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = e621Api
      .getDataDir()
      .then((dir) => load(`${dir}/${STORE_FILE}`, { autoSave: true }));
  }
  return storePromise;
}

async function persist<K extends keyof Persisted>(key: K, value: Persisted[K]) {
  const store = await getStore();
  await store.set(key, value);
}

const DEFAULTS: Persisted = {
  rotationEnabled: false,
  source: null,
  intervalMin: DEFAULT_ROTATION_INTERVAL_MIN,
  fit: "fill",
  safeOnly: true,
  lastChangedAt: 0,
  current: null,
  recentIds: [],
};

export const useWallpaperStore = create<WallpaperState>((set, get) => ({
  ...DEFAULTS,
  isLoaded: false,
  lastError: null,
  retryAt: null,

  setRotationEnabled: (rotationEnabled) => {
    set({ rotationEnabled, lastError: null, retryAt: null });
    void persist("rotationEnabled", rotationEnabled);
  },
  setSource: (source) => {
    // A new source should show its first picture now, not after the old interval runs out.
    set({ source, recentIds: [], lastChangedAt: 0, lastError: null, retryAt: null });
    void persist("source", source);
    void persist("recentIds", []);
    void persist("lastChangedAt", 0);
  },
  setIntervalMin: (intervalMin) => {
    set({ intervalMin });
    void persist("intervalMin", intervalMin);
  },
  setFit: (fit) => {
    set({ fit });
    void persist("fit", fit);
  },
  setSafeOnly: (safeOnly) => {
    set({ safeOnly });
    void persist("safeOnly", safeOnly);
  },
  recordChange: (postId, site) => {
    const recentIds = pushRecent(get().recentIds, postId);
    const lastChangedAt = Date.now();
    const current = { postId, site };
    set({ recentIds, lastChangedAt, current, lastError: null, retryAt: null });
    void persist("recentIds", recentIds);
    void persist("lastChangedAt", lastChangedAt);
    void persist("current", current);
  },
  recordFailure: (lastError, retryAt) => set({ lastError, retryAt }),
}));

export async function loadWallpaperSettings(): Promise<void> {
  const store = await getStore();
  const values = Object.fromEntries(await store.entries<unknown>()) as Partial<Persisted>;
  // A source/current saved against a site that's gone (e6AI, shut down Nov 2026) would fail every
  // rotation - drop it instead.
  const live = <T extends { site: string }>(v: T | null | undefined): T | null => (v && SITES.includes(v.site as never) ? v : null);
  useWallpaperStore.setState({
    rotationEnabled: values.rotationEnabled ?? DEFAULTS.rotationEnabled,
    source: live(values.source) ?? DEFAULTS.source,
    intervalMin: values.intervalMin ?? DEFAULTS.intervalMin,
    fit: values.fit ?? DEFAULTS.fit,
    safeOnly: values.safeOnly ?? DEFAULTS.safeOnly,
    lastChangedAt: values.lastChangedAt ?? DEFAULTS.lastChangedAt,
    current: live(values.current) ?? DEFAULTS.current,
    recentIds: values.recentIds ?? DEFAULTS.recentIds,
    isLoaded: true,
  });
}
