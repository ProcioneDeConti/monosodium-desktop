// Assembles/applies Settings > Backup & Restore's portable snapshot - the desktop analogue of
// the reference Android app's SettingsBackup.kt (same idea: everything in the settings store
// worth restoring), plus both sites' credentials, since the reference app's own backup bundles
// those too (that's the reason a backup can be password-protected at all). Deliberately excludes
// saved searches (state/savedSearchesStore.ts) and blacklistDisabled (a session-only toggle,
// never persisted in the first place) - same boundary the reference app's own SettingsBackup
// draws around its UserSettings, not SavedSearchStore. src-tauri/src/backup.rs's export/import
// commands know nothing about this shape - they just encrypt/decrypt whatever opaque JSON string
// this module hands them.

import type { Rating } from "../models/post";
import type { Site } from "../models/site";
import type { SlideshowTransition } from "./slideshow";
import { useAccountStore } from "../state/accountStore";
import { useSettingsStore } from "../state/settingsStore";

export interface SettingsBackup {
  version: 1;
  e621Username: string;
  e621ApiKey: string;
  e6aiUsername: string;
  e6aiApiKey: string;
  site: Site;
  enabledRatings: Rating[];
  adultModeEnabled: boolean;
  blacklist: string;
  accentColor: string;
  gridThumbnailSizePx: number;
  videoLoopEnabled: boolean;
  videoPlaybackSpeed: number;
  videoAutoplayEnabled: boolean;
  downloadDir: string | null;
  slideshowIntervalSec: number;
  slideshowTransition: SlideshowTransition;
}

export function buildBackup(): SettingsBackup {
  const settings = useSettingsStore.getState();
  const accounts = useAccountStore.getState().accounts;
  return {
    version: 1,
    e621Username: accounts.e621?.username ?? "",
    e621ApiKey: accounts.e621?.apiKey ?? "",
    e6aiUsername: accounts.e6ai?.username ?? "",
    e6aiApiKey: accounts.e6ai?.apiKey ?? "",
    site: settings.site,
    enabledRatings: settings.enabledRatings,
    adultModeEnabled: settings.adultModeEnabled,
    blacklist: settings.blacklist,
    accentColor: settings.accentColor,
    gridThumbnailSizePx: settings.gridThumbnailSizePx,
    videoLoopEnabled: settings.videoLoopEnabled,
    videoPlaybackSpeed: settings.videoPlaybackSpeed,
    videoAutoplayEnabled: settings.videoAutoplayEnabled,
    downloadDir: settings.downloadDir,
    slideshowIntervalSec: settings.slideshowIntervalSec,
    slideshowTransition: settings.slideshowTransition,
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
  settings.setGridThumbnailSizePx(backup.gridThumbnailSizePx);
  settings.setVideoLoopEnabled(backup.videoLoopEnabled);
  settings.setVideoPlaybackSpeed(backup.videoPlaybackSpeed);
  settings.setVideoAutoplayEnabled(backup.videoAutoplayEnabled);
  settings.setDownloadDir(backup.downloadDir);
  settings.setSlideshowIntervalSec(backup.slideshowIntervalSec);
  settings.setSlideshowTransition(backup.slideshowTransition);

  const accountStore = useAccountStore.getState();
  const tasks: Promise<void>[] = [];
  if (backup.e621Username || backup.e621ApiKey) {
    tasks.push(accountStore.save("e621", backup.e621Username, backup.e621ApiKey));
  }
  if (backup.e6aiUsername || backup.e6aiApiKey) {
    tasks.push(accountStore.save("e6ai", backup.e6aiUsername, backup.e6aiApiKey));
  }
  await Promise.all(tasks);
}
