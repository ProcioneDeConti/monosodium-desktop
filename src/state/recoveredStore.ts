// Which deleted posts have a recovered copy cached on disk (src-tauri/src/recovered.rs), per site,
// so the grid can show the recovered file as the post's thumbnail. Loaded once per site from the
// backend's index (a directory listing - no network), then kept in step by the viewer's
// DeletedPostRecovery whenever a recovery finishes, the pick changes, or the copy is removed.

import { create } from "zustand";
import { convertFileSrc } from "@tauri-apps/api/core";
import { e621Api, type RecoveredThumb } from "../api/client";
import type { Site } from "../models/site";

export interface RecoveredThumbEntry {
  /** asset-protocol URL of the picked file; null when a search found nothing. */
  src: string | null;
  isVideo: boolean;
  /** When a search found nothing (unix seconds) - the grid shows a "not found" tile. */
  notFoundAt: number | null;
}

interface RecoveredState {
  bySite: Partial<Record<Site, Record<number, RecoveredThumbEntry>>>;
  /** Replaces (or, with null, removes) one post's entry. */
  setThumb: (site: Site, postId: number, thumb: RecoveredThumb | null) => void;
}

function toEntry(t: RecoveredThumb): RecoveredThumbEntry {
  return { src: t.path ? convertFileSrc(t.path) : null, isVideo: t.is_video, notFoundAt: t.not_found_at };
}

/** "searched 3 Nov 2026" style text for a not-found marker. */
export function searchedOn(notFoundAt: number): string {
  return new Date(notFoundAt * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const useRecoveredStore = create<RecoveredState>((set) => ({
  bySite: {},
  setThumb: (site, postId, thumb) =>
    set((s) => {
      const current = { ...(s.bySite[site] ?? {}) };
      if (thumb) current[postId] = toEntry(thumb);
      else delete current[postId];
      return { bySite: { ...s.bySite, [site]: current } };
    }),
}));

const requested = new Set<Site>();

/** Loads a site's recovered index the first time anything asks for it. */
function ensureLoaded(site: Site) {
  if (requested.has(site)) return;
  requested.add(site);
  e621Api
    .listRecovered(site)
    .then((list) => {
      const entries: Record<number, RecoveredThumbEntry> = {};
      for (const [id, t] of Object.entries(list)) entries[Number(id)] = toEntry(t);
      // Anything set by a recovery that finished while this was loading wins.
      useRecoveredStore.setState((s) => ({
        bySite: { ...s.bySite, [site]: { ...entries, ...(s.bySite[site] ?? {}) } },
      }));
    })
    .catch(() => requested.delete(site));
}

/** The recovered thumbnail for a post, or null. Only meaningful for deleted posts. */
export function useRecoveredThumb(site: Site, postId: number, enabled: boolean): RecoveredThumbEntry | null {
  if (enabled) ensureLoaded(site);
  return useRecoveredStore((s) => (enabled ? (s.bySite[site]?.[postId] ?? null) : null));
}
