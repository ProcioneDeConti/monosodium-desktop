// Blacklist <-> account sync. The local blacklist is one text shared by both sites; sync talks to
// whichever site is active (needs that site's credentials). Every sync is a three-way merge
// (lib/blacklistMerge.ts) against the per-site "base" saved after the previous sync, so lines
// added on another client (the Android app) survive instead of being overwritten.
//
// With Settings > Blacklist > "Sync automatically" on, every local change (a tag menu's "Add to
// blacklist", or Save in the editor) and app launch runs a sync. Syncs are serialised: a burst of
// adds becomes back-to-back syncs, each starting from the latest text. Two API calls per sync
// (users/me + the PATCH, skipped when nothing changed on the account side), both through the
// Rust rate limiter like everything else.

import { create } from "zustand";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import { mergeBlacklists, sameBlacklist, type BlacklistMerge } from "../lib/blacklistMerge";
import { errorMessage } from "../lib/errors";
import { useAccountStore } from "./accountStore";
import { useSettingsStore } from "./settingsStore";

export interface BlacklistSyncStatus {
  state: "idle" | "syncing" | "ok" | "error";
  message: string | null;
  at: number | null;
}

export const useBlacklistSyncStore = create<BlacklistSyncStatus>(() => ({
  state: "idle",
  message: null,
  at: null,
}));

let queue: Promise<unknown> = Promise.resolve();

function describe(r: BlacklistMerge): string {
  const parts: string[] = [];
  if (r.pulled) parts.push(`${r.pulled} pulled from account`);
  if (r.pushed) parts.push(`${r.pushed} pushed`);
  if (r.removed) parts.push(`${r.removed} removed`);
  return parts.length ? `Synced - ${parts.join(", ")}.` : "Synced - already up to date.";
}

/** Merge the local blacklist with `site`'s account and save the result on both ends. Resolves
 *  to the merge summary, or null when not signed in to that site. Throws on network errors. */
export function syncBlacklist(site: Site = useSettingsStore.getState().site): Promise<BlacklistMerge | null> {
  const run = queue.then(async () => {
    if (!useAccountStore.getState().isAuthenticated(site)) return null;
    useBlacklistSyncStore.setState({ state: "syncing", message: "Syncing…" });
    try {
      const profile = await e621Api.getCurrentUser(site);
      const remote = profile.blacklisted_tags ?? "";
      const settings = useSettingsStore.getState();
      const local = settings.blacklist;
      const result = mergeBlacklists(settings.blacklistSyncBase[site] ?? null, local, remote);
      if (!sameBlacklist(result.merged, remote)) {
        await e621Api.updateBlacklist(site, profile.id, result.merged);
      }
      // The user may have edited while the request was in flight: replay those edits on top of
      // the merge (old local as the base) so the queued follow-up sync sees them as local
      // changes, not the pulled lines as local deletions.
      const current = useSettingsStore.getState().blacklist;
      const next = current === local ? result.merged : mergeBlacklists(local, current, result.merged).merged;
      if (next !== current) useSettingsStore.getState().setBlacklist(next);
      useSettingsStore.getState().setBlacklistSyncBase(site, result.merged);
      useBlacklistSyncStore.setState({ state: "ok", message: describe(result), at: Date.now() });
      return result;
    } catch (e) {
      useBlacklistSyncStore.setState({
        state: "error",
        message: errorMessage(e, "Sync failed."),
        at: Date.now(),
      });
      throw e;
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Fire-and-forget sync, only when auto-sync is on. Errors land in useBlacklistSyncStore. */
export function autoSyncBlacklist(): void {
  if (!useSettingsStore.getState().blacklistAutoSync) return;
  syncBlacklist().catch(() => undefined);
}

/** Append a line to the blacklist (from a tag menu etc.), then auto-sync if enabled. */
export function addToBlacklist(line: string): void {
  const { blacklist, setBlacklist } = useSettingsStore.getState();
  setBlacklist(blacklist.trim() === "" ? line : `${blacklist.replace(/\s+$/, "")}\n${line}`);
  autoSyncBlacklist();
}

/** Record that local and account text now agree (after a manual import or push). */
export function markBlacklistSynced(site: Site, text: string): void {
  useSettingsStore.getState().setBlacklistSyncBase(site, text);
}
