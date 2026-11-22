// Blacklist <-> account sync. Each site keeps its own blacklist (settingsStore's blacklistBySite),
// synced only with that site's account (needs that site's credentials) - so e621's lines never end
// up on a floofgens/blep account or vice versa. Every sync is a three-way merge
// (lib/blacklistMerge.ts) against the per-site "base" saved after the previous sync, so lines
// added on another client (the Android app) survive instead of being overwritten.
//
// With Settings > Blacklist > "Sync automatically" on, every local change (a tag menu's "Add to
// blacklist", or Save in the editor) syncs that site; app launch syncs every signed-in site, and
// switching to a site syncs it. Syncs are serialised: a burst of adds becomes back-to-back syncs,
// each starting from the latest text. Two API calls per sync (users/me + the PATCH, skipped when
// nothing changed on the account side), both through the Rust rate limiter like everything else.

import { create } from "zustand";
import { e621Api } from "../api/client";
import { SITES, type Site } from "../models/site";
import { mergeBlacklists, sameBlacklist, type BlacklistMerge } from "../lib/blacklistMerge";
import { errorMessage } from "../lib/errors";
import { useAccountStore } from "./accountStore";
import { useSettingsStore } from "./settingsStore";

export interface BlacklistSyncStatus {
  state: "idle" | "syncing" | "ok" | "error";
  message: string | null;
  at: number | null;
}

const IDLE: BlacklistSyncStatus = { state: "idle", message: null, at: null };

/** Sync status per site, so one site's "Synced"/error doesn't show while editing another's. */
export const useBlacklistSyncStore = create<Partial<Record<Site, BlacklistSyncStatus>>>(() => ({}));

export function useBlacklistSyncStatus(site: Site): BlacklistSyncStatus {
  return useBlacklistSyncStore((s) => s[site] ?? IDLE);
}

function setStatus(site: Site, patch: Partial<BlacklistSyncStatus>): void {
  useBlacklistSyncStore.setState((s) => ({ [site]: { ...(s[site] ?? IDLE), ...patch } }));
}

let queue: Promise<unknown> = Promise.resolve();

function describe(r: BlacklistMerge): string {
  const parts: string[] = [];
  if (r.pulled) parts.push(`${r.pulled} pulled from account`);
  if (r.pushed) parts.push(`${r.pushed} pushed`);
  if (r.removed) parts.push(`${r.removed} removed`);
  return parts.length ? `Synced - ${parts.join(", ")}.` : "Synced - already up to date.";
}

const blacklistOf = (site: Site) => useSettingsStore.getState().blacklistBySite[site];

/** Merge `site`'s local blacklist with that site's account and save the result on both ends.
 *  Resolves to the merge summary, or null when not signed in to that site. Throws on network
 *  errors. */
export function syncBlacklist(site: Site = useSettingsStore.getState().site): Promise<BlacklistMerge | null> {
  const run = queue.then(async () => {
    if (!useAccountStore.getState().isAuthenticated(site)) return null;
    setStatus(site, { state: "syncing", message: "Syncing…" });
    try {
      const profile = await e621Api.getCurrentUser(site);
      const remote = profile.blacklisted_tags ?? "";
      const local = blacklistOf(site);
      const result = mergeBlacklists(useSettingsStore.getState().blacklistSyncBase[site] ?? null, local, remote);
      if (!sameBlacklist(result.merged, remote)) {
        await e621Api.updateBlacklist(site, profile.id, result.merged);
      }
      // The user may have edited while the request was in flight: replay those edits on top of
      // the merge (old local as the base) so the queued follow-up sync sees them as local
      // changes, not the pulled lines as local deletions.
      const current = blacklistOf(site);
      const next = current === local ? result.merged : mergeBlacklists(local, current, result.merged).merged;
      if (next !== current) useSettingsStore.getState().setBlacklist(next, site);
      useSettingsStore.getState().setBlacklistSyncBase(site, result.merged);
      setStatus(site, { state: "ok", message: describe(result), at: Date.now() });
      return result;
    } catch (e) {
      setStatus(site, { state: "error", message: errorMessage(e, "Sync failed."), at: Date.now() });
      throw e;
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Fire-and-forget sync of `site` (default: active), only when auto-sync is on. Errors land in
 *  useBlacklistSyncStore. */
export function autoSyncBlacklist(site?: Site): void {
  if (!useSettingsStore.getState().blacklistAutoSync) return;
  syncBlacklist(site).catch(() => undefined);
}

/** Launch: auto-sync every site that's signed in (others are skipped inside syncBlacklist). */
export function autoSyncAllBlacklists(): void {
  for (const site of SITES) autoSyncBlacklist(site);
}

/** Append a line to `site`'s blacklist (default: active) from a tag menu etc., then auto-sync. */
export function addToBlacklist(line: string, site: Site = useSettingsStore.getState().site): void {
  const blacklist = blacklistOf(site);
  useSettingsStore
    .getState()
    .setBlacklist(blacklist.trim() === "" ? line : `${blacklist.replace(/\s+$/, "")}\n${line}`, site);
  autoSyncBlacklist(site);
}

/** Record that local and account text now agree (after a manual import or push). */
export function markBlacklistSynced(site: Site, text: string): void {
  useSettingsStore.getState().setBlacklistSyncBase(site, text);
}
