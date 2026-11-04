// Saved "For you" taste profiles (per site + user + mode), so reopening the panel doesn't refetch
// hundreds/thousands of favourites. Its own plaintext tauri-plugin-store file, same pattern as
// state/favoritesAnalysisCache.ts (including a short gap between profile builds, honouring
// e621's "make as few requests as possible" guidance). Not in the backup snapshot.

import { load, type Store } from "@tauri-apps/plugin-store";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import type { TasteMode, TasteProfile } from "../lib/tasteProfile";

const STORE_FILE = "taste-profile.json";
const ENTRIES_KEY = "entries";

/** A profile older than this is rebuilt automatically on open. */
export const PROFILE_FRESH_MS = 7 * 24 * 60 * 60_000;
/** Minimum gap between two profile builds. */
export const PROFILE_MIN_GAP_MS = 30_000;
const MAX_ENTRIES = 10;

let entries: TasteProfile[] = [];
let lastBuiltAt = 0;

function sameKey(p: TasteProfile, site: Site, name: string, mode: TasteMode): boolean {
  return p.site === site && p.mode === mode && p.user.name.toLowerCase() === name.toLowerCase();
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = e621Api
      .getDataDir()
      .then((dir) => load(`${dir}/${STORE_FILE}`, { autoSave: false }));
  }
  return storePromise;
}

/** Hydrate from disk on boot. Never rejects. */
export async function loadTasteProfiles(): Promise<void> {
  try {
    const store = await getStore();
    entries = (await store.get<TasteProfile[]>(ENTRIES_KEY)) ?? [];
  } catch {
    entries = [];
  }
}

async function persist(): Promise<void> {
  try {
    const store = await getStore();
    await store.set(ENTRIES_KEY, entries);
    await store.save();
  } catch {
    /* best effort */
  }
}

export function getTasteProfile(site: Site, name: string, mode: TasteMode): TasteProfile | null {
  return entries.find((p) => sameKey(p, site, name, mode)) ?? null;
}

export function isProfileFresh(p: TasteProfile, now = Date.now()): boolean {
  return now - p.builtAt < PROFILE_FRESH_MS;
}

export function saveTasteProfile(profile: TasteProfile): void {
  entries = [
    profile,
    ...entries.filter((p) => !sameKey(p, profile.site, profile.user.name, profile.mode)),
  ].slice(0, MAX_ENTRIES);
  void persist();
}

export function removeTasteProfiles(site: Site, name: string): void {
  entries = entries.filter(
    (p) => !(p.site === site && p.user.name.toLowerCase() === name.toLowerCase()),
  );
  void persist();
}

export interface RecentTarget {
  name: string;
  id: number;
  avatarId: number | null;
  builtAt: number;
}

/** Distinct users with a saved profile on this site, most recent first. */
export function listTasteTargets(site: Site): RecentTarget[] {
  const seen = new Set<string>();
  const out: RecentTarget[] = [];
  for (const p of [...entries].sort((a, b) => b.builtAt - a.builtAt)) {
    const k = p.user.name.toLowerCase();
    if (p.site !== site || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: p.user.name, id: p.user.id, avatarId: p.user.avatarId, builtAt: p.builtAt });
  }
  return out;
}

export function markProfileBuildStarted(now = Date.now()): void {
  lastBuiltAt = now;
}

/** Milliseconds until another profile build may start (0 = now). In-memory only. */
export function profileGapRemaining(now = Date.now()): number {
  return Math.max(0, lastBuiltAt + PROFILE_MIN_GAP_MS - now);
}
