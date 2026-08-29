// Assembles/applies Settings > Backup & Restore's portable snapshot - the desktop analogue of
// the reference Android app's SettingsBackup.kt (same idea: everything in the settings store
// worth restoring), plus both sites' credentials, the SauceNAO key, and the Cache size limit -
// all covered on the same "a settings backup should just cover everything on the Settings
// screen" reasoning, even where (SauceNAO, Cache) that meant reaching outside settingsStore.ts
// itself. `buildBackup` is async for exactly one reason: the Cache limit lives in its own file
// (src-tauri/src/cache.rs), not tauri-plugin-store, so it needs a real round trip rather than
// coming along for free with the rest of the (synchronous, in-memory) Zustand state. Deliberately
// still excludes saved searches (state/savedSearchesStore.ts) and blacklistDisabled (a
// session-only toggle, never persisted in the first place) - same boundary the reference app's
// own SettingsBackup draws around its UserSettings, not SavedSearchStore.
// src-tauri/src/backup.rs's export/import commands know nothing about this shape - they just
// encrypt/decrypt whatever opaque JSON string this module hands them.

import { e621Api } from "../api/client";
import type { Rating } from "../models/post";
import type { Site } from "../models/site";
import type { SlideshowTransition } from "./slideshow";
import type { ThemeMode } from "./theme";
import { useAccountStore } from "../state/accountStore";
import { useSaucenaoStore } from "../state/saucenaoStore";
import { useSettingsStore } from "../state/settingsStore";

export interface SettingsBackup {
  version: 1;
  e621Username: string;
  e621ApiKey: string;
  e6aiUsername: string;
  e6aiApiKey: string;
  /** `?? ""` on read for forward compatibility with a backup made before this field existed. */
  saucenaoApiKey?: string;
  /** Settings > Cache's size limit - lives outside settingsStore.ts entirely (src-tauri/src/
   *  cache.rs owns its own file, not tauri-plugin-store), so it needs its own round trip here
   *  rather than coming along for free with the rest of the store. `null` is a meaningful value
   *  (Unlimited), so restoring checks the field's presence, not its truthiness - see applyBackup.
   *  Absent on a backup made before this field existed. */
  cacheLimitMb?: number | null;
  site: Site;
  enabledRatings: Rating[];
  adultModeEnabled: boolean;
  blacklist: string;
  accentColor: string;
  /** Absent on a backup made before this field existed - `?? "system"` on read. */
  themeMode?: ThemeMode;
  gridThumbnailSizePx: number;
  videoLoopEnabled: boolean;
  videoPlaybackSpeed: number;
  videoAutoplayEnabled: boolean;
  downloadDir: string | null;
  slideshowIntervalSec: number;
  slideshowTransition: SlideshowTransition;
  /** Absent on a backup made before this field existed - `?? false` on read. */
  slideshowShuffle?: boolean;
  eulaAcceptedHash: string | null;
}

export async function buildBackup(): Promise<SettingsBackup> {
  const settings = useSettingsStore.getState();
  const accounts = useAccountStore.getState().accounts;
  // `undefined` (fetch failed) leaves cacheLimitMb out of the object entirely, same as an old
  // backup that predates the field - `null` is reserved for a verified "Unlimited" reading.
  const cacheInfo = await e621Api.getCacheInfo().catch(() => undefined);
  return {
    version: 1,
    e621Username: accounts.e621?.username ?? "",
    e621ApiKey: accounts.e621?.apiKey ?? "",
    e6aiUsername: accounts.e6ai?.username ?? "",
    e6aiApiKey: accounts.e6ai?.apiKey ?? "",
    saucenaoApiKey: useSaucenaoStore.getState().apiKey ?? "",
    cacheLimitMb: cacheInfo && cacheInfo.limit_mb,
    site: settings.site,
    enabledRatings: settings.enabledRatings,
    adultModeEnabled: settings.adultModeEnabled,
    blacklist: settings.blacklist,
    accentColor: settings.accentColor,
    themeMode: settings.themeMode,
    gridThumbnailSizePx: settings.gridThumbnailSizePx,
    videoLoopEnabled: settings.videoLoopEnabled,
    videoPlaybackSpeed: settings.videoPlaybackSpeed,
    videoAutoplayEnabled: settings.videoAutoplayEnabled,
    downloadDir: settings.downloadDir,
    slideshowIntervalSec: settings.slideshowIntervalSec,
    slideshowTransition: settings.slideshowTransition,
    slideshowShuffle: settings.slideshowShuffle,
    eulaAcceptedHash: settings.eulaAcceptedHash,
  };
}

/** A minimal shape check, not full validation - mirroring the reference app's own "just try to
 *  decode it, catch and report corrupted" approach rather than field-by-field schema checking. */
export function isSettingsBackup(value: unknown): value is SettingsBackup {
  return (
    typeof value === "object" &&
    value !== null &&
    "enabledRatings" in value &&
    "blacklist" in value
  );
}

/** Applies a parsed backup to the settings store and (if present) both sites' credentials. */
export async function applyBackup(backup: SettingsBackup): Promise<void> {
  const settings = useSettingsStore.getState();
  settings.setSite(backup.site);
  settings.setEnabledRatings(backup.enabledRatings);
  settings.setAdultModeEnabled(backup.adultModeEnabled);
  settings.setBlacklist(backup.blacklist);
  settings.setAccentColor(backup.accentColor);
  settings.setThemeMode(backup.themeMode ?? "system");
  settings.setGridThumbnailSizePx(backup.gridThumbnailSizePx);
  settings.setVideoLoopEnabled(backup.videoLoopEnabled);
  settings.setVideoPlaybackSpeed(backup.videoPlaybackSpeed);
  settings.setVideoAutoplayEnabled(backup.videoAutoplayEnabled);
  settings.setDownloadDir(backup.downloadDir);
  settings.setSlideshowIntervalSec(backup.slideshowIntervalSec);
  settings.setSlideshowTransition(backup.slideshowTransition);
  settings.setSlideshowShuffle(backup.slideshowShuffle ?? false);
  // `?? null` for forward compatibility with a backup made before this field existed.
  settings.setEulaAccepted(backup.eulaAcceptedHash ?? null);

  const accountStore = useAccountStore.getState();
  const tasks: Promise<void>[] = [];
  if (backup.e621Username || backup.e621ApiKey) {
    tasks.push(accountStore.save("e621", backup.e621Username, backup.e621ApiKey));
  }
  if (backup.e6aiUsername || backup.e6aiApiKey) {
    tasks.push(accountStore.save("e6ai", backup.e6aiUsername, backup.e6aiApiKey));
  }
  if (backup.saucenaoApiKey) {
    tasks.push(useSaucenaoStore.getState().save(backup.saucenaoApiKey));
  }
  // Field presence, not truthiness - `null` (Unlimited) is a real, meaningful value here, and
  // `"cacheLimitMb" in backup` being false is what actually means "not in this backup."
  if ("cacheLimitMb" in backup) {
    tasks.push(e621Api.setCacheLimitMb(backup.cacheLimitMb ?? null));
  }
  await Promise.all(tasks);
}
