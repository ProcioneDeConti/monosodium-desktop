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
// encrypt/decrypt whatever opaque JSON string this module hands them, with one addition: the
// deleted-post recovery sources' API keys and sign-in cookies, which never reach the frontend, are
// spliced in (export) and stripped back out + saved (import) by backup.rs itself.

import { e621Api } from "../api/client";
import type { Rating } from "../models/post";
import { SITES, toSite, type Site } from "../models/site";
import type { SlideshowTransition } from "./slideshow";
import type { MotionMode, Palette, ThemeMode } from "./theme";
import { useAccountStore } from "../state/accountStore";
import { useSaucenaoStore } from "../state/saucenaoStore";
import { DEFAULT_VIEWER_SIDEBAR_PX, useSettingsStore, type MascotCorner, type MascotMode, type MascotTalk, type SeenMode } from "../state/settingsStore";
import {
  applyStatsBackup,
  statsBackupAggregates,
  type StatsBackupAggregates,
} from "../state/statsStore";

export interface SettingsBackup {
  version: 1;
  e621Username: string;
  e621ApiKey: string;
  /** Optional: backups made before these sites were added don't have them (and their old
   *  `e6aiUsername`/`e6aiApiKey` fields - e6AI shut down Nov 2026 - are ignored on restore). */
  floofgensUsername?: string;
  floofgensApiKey?: string;
  blepUsername?: string;
  blepApiKey?: string;
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
  /** e621's blacklist (the only one before per-site lists). */
  blacklist: string;
  /** Every site's blacklist; absent in older backups. */
  blacklistBySite?: Partial<Record<Site, string>>;
  accentColor: string;
  /** Absent on a backup made before this field existed - `?? "system"` on read. */
  themeMode?: ThemeMode;
  /** Appearance additions - absent on older backups, defaults applied on read. */
  palette?: Palette;
  motionMode?: MotionMode;
  ambientHeader?: boolean;
  viewerAmbient?: boolean;
  seenMode?: SeenMode;
  mascotMode?: MascotMode;
  mascotTalk?: MascotTalk;
  /** Pre-talkativeness backups: false = "never". */
  mascotSpeech?: boolean;
  mascotSpicy?: boolean;
  mascotCorner?: MascotCorner;
  gridThumbnailSizePx: number;
  /** Absent on a backup made before this field existed - `?? DEFAULT_VIEWER_SIDEBAR_PX` on read. */
  viewerSidebarWidthPx?: number;
  videoLoopEnabled: boolean;
  videoPlaybackSpeed: number;
  videoAutoplayEnabled: boolean;
  downloadDir: string | null;
  slideshowIntervalSec: number;
  slideshowTransition: SlideshowTransition;
  /** Absent on a backup made before this field existed - `?? false` on read. */
  slideshowShuffle?: boolean;
  eulaAcceptedHash: string | null;
  /** Absent on a backup made before this field existed - `?? true` on read. */
  usageStatsEnabled?: boolean;
  /** User Dashboard lifetime totals only (per-day history, seen-post list and tag tallies are
   *  deliberately left out - see state/statsStore.ts). Absent on an older backup. */
  usageStats?: StatsBackupAggregates;
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
    floofgensUsername: accounts.floofgens?.username ?? "",
    floofgensApiKey: accounts.floofgens?.apiKey ?? "",
    blepUsername: accounts.blep?.username ?? "",
    blepApiKey: accounts.blep?.apiKey ?? "",
    saucenaoApiKey: useSaucenaoStore.getState().apiKey ?? "",
    cacheLimitMb: cacheInfo && cacheInfo.limit_mb,
    site: settings.site,
    enabledRatings: settings.enabledRatings,
    adultModeEnabled: settings.adultModeEnabled,
    // `blacklist` stays e621's list (what older builds and the Android app read); the rest of the
    // sites ride along in blacklistBySite.
    blacklist: settings.blacklistBySite.e621,
    blacklistBySite: settings.blacklistBySite,
    accentColor: settings.accentColor,
    themeMode: settings.themeMode,
    palette: settings.palette,
    motionMode: settings.motionMode,
    ambientHeader: settings.ambientHeader,
    viewerAmbient: settings.viewerAmbient,
    seenMode: settings.seenMode,
    mascotMode: settings.mascotMode,
    mascotTalk: settings.mascotTalk,
    mascotSpicy: settings.mascotSpicy,
    mascotCorner: settings.mascotCorner,
    gridThumbnailSizePx: settings.gridThumbnailSizePx,
    viewerSidebarWidthPx: settings.viewerSidebarWidthPx,
    videoLoopEnabled: settings.videoLoopEnabled,
    videoPlaybackSpeed: settings.videoPlaybackSpeed,
    videoAutoplayEnabled: settings.videoAutoplayEnabled,
    downloadDir: settings.downloadDir,
    slideshowIntervalSec: settings.slideshowIntervalSec,
    slideshowTransition: settings.slideshowTransition,
    slideshowShuffle: settings.slideshowShuffle,
    eulaAcceptedHash: settings.eulaAcceptedHash,
    usageStatsEnabled: settings.usageStatsEnabled,
    usageStats: statsBackupAggregates(),
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
  settings.setSite(toSite(backup.site));
  settings.setEnabledRatings(backup.enabledRatings);
  settings.setAdultModeEnabled(backup.adultModeEnabled);
  settings.setBlacklist(backup.blacklist, "e621");
  // Only sites the backup actually has: blanking a list the backup predates would read as "every
  // line deleted" on the next sync and wipe that account's blacklist.
  for (const s of SITES) {
    const text = backup.blacklistBySite?.[s];
    if (s !== "e621" && typeof text === "string") settings.setBlacklist(text, s);
  }
  settings.setAccentColor(backup.accentColor);
  settings.setThemeMode(backup.themeMode ?? "system");
  settings.setPalette(backup.palette ?? "default");
  settings.setMotionMode(backup.motionMode ?? "system");
  settings.setAmbientHeader(backup.ambientHeader ?? true);
  settings.setViewerAmbient(backup.viewerAmbient ?? true);
  settings.setSeenMode(backup.seenMode ?? "dim");
  settings.setMascotMode(backup.mascotMode ?? "companion");
  settings.setMascotTalk(backup.mascotTalk ?? (backup.mascotSpeech === false ? "never" : "sometimes"));
  settings.setMascotSpicy(backup.mascotSpicy ?? true);
  settings.setMascotCorner(backup.mascotCorner ?? "bl");
  settings.setGridThumbnailSizePx(backup.gridThumbnailSizePx);
  settings.setViewerSidebarWidthPx(backup.viewerSidebarWidthPx ?? DEFAULT_VIEWER_SIDEBAR_PX);
  settings.setVideoLoopEnabled(backup.videoLoopEnabled);
  settings.setVideoPlaybackSpeed(backup.videoPlaybackSpeed);
  settings.setVideoAutoplayEnabled(backup.videoAutoplayEnabled);
  settings.setDownloadDir(backup.downloadDir);
  settings.setSlideshowIntervalSec(backup.slideshowIntervalSec);
  settings.setSlideshowTransition(backup.slideshowTransition);
  settings.setSlideshowShuffle(backup.slideshowShuffle ?? false);
  // `?? null` for forward compatibility with a backup made before this field existed.
  settings.setEulaAccepted(backup.eulaAcceptedHash ?? null);
  settings.setUsageStatsEnabled(backup.usageStatsEnabled ?? true);
  applyStatsBackup(backup.usageStats);

  const accountStore = useAccountStore.getState();
  const tasks: Promise<void>[] = [];
  if (backup.e621Username || backup.e621ApiKey) {
    tasks.push(accountStore.save("e621", backup.e621Username, backup.e621ApiKey));
  }
  if (backup.floofgensUsername || backup.floofgensApiKey) {
    tasks.push(accountStore.save("floofgens", backup.floofgensUsername ?? "", backup.floofgensApiKey ?? ""));
  }
  if (backup.blepUsername || backup.blepApiKey) {
    tasks.push(accountStore.save("blep", backup.blepUsername ?? "", backup.blepApiKey ?? ""));
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
