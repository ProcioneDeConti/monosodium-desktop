// Favourites-analysis result cache + a light "don't hammer it" gap, both to honour e621's "make
// as few API requests as possible" guidance:
//   - a completed analysis (per site + user) is kept & shown for 30 minutes, so re-opening the
//     Dashboard doesn't silently re-fetch;
//   - starting *any* analysis is gated to once per 30 seconds (so flipping between users, or
//     re-running the same one, can't kick off back-to-back multi-request jobs).
// Its own plaintext tauri-plugin-store file (same pattern as searchHistoryStore); not in the
// backup snapshot.

import { load, type Store } from "@tauri-apps/plugin-store";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import type { FavoritesAnalysisResult } from "../queries/useFavoritesAnalysis";

const STORE_FILE = "favorites-analysis-cache.json";
const ENTRIES_KEY = "entries";
const LAST_STARTED_KEY = "lastStartedAt";

export const ANALYSIS_FRESH_MS = 30 * 60_000;
export const ANALYSIS_MIN_GAP_MS = 30_000;
const MAX_ENTRIES = 10;

export interface AnalysisCacheEntry {
  key: string;
  at: number;
  result: FavoritesAnalysisResult;
}

export interface RecentAnalysis {
  /** Lookup ref (lowercased username) - pass to the runner to re-open this cached result. */
  ref: string;
  name: string;
  sampled: number;
  /** epoch ms the cache entry stops being fresh. */
  expiresAt: number;
}

let entries: AnalysisCacheEntry[] = [];
let lastStartedAt = 0;

function cacheKey(site: Site, ref: string): string {
  return `${site}::${ref.trim().toLowerCase()}`;
}
function refFromKey(site: Site, key: string): string {
  return key.slice(`${site}::`.length);
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
export async function loadFavoritesAnalysisCache(): Promise<void> {
  try {
    const store = await getStore();
    entries = (await store.get<AnalysisCacheEntry[]>(ENTRIES_KEY)) ?? [];
    lastStartedAt = (await store.get<number>(LAST_STARTED_KEY)) ?? 0;
  } catch {
    entries = [];
    lastStartedAt = 0;
  }
}

async function persist(): Promise<void> {
  try {
    const store = await getStore();
    await store.set(ENTRIES_KEY, entries);
    await store.set(LAST_STARTED_KEY, lastStartedAt);
    await store.save();
  } catch {
    /* best effort */
  }
}

// --- result cache ---

/** The stored entry for this user, fresh or stale, or null. */
export function getCachedAnalysis(site: Site, ref: string): AnalysisCacheEntry | null {
  const k = cacheKey(site, ref);
  return entries.find((e) => e.key === k) ?? null;
}

export function isAnalysisFresh(entry: AnalysisCacheEntry): boolean {
  return Date.now() - entry.at < ANALYSIS_FRESH_MS;
}

/** A fresh (< 30 min) entry for this user, or null. */
export function getFreshAnalysis(site: Site, ref: string): AnalysisCacheEntry | null {
  const entry = getCachedAnalysis(site, ref);
  return entry && isAnalysisFresh(entry) ? entry : null;
}

/** `ref` should be the *resolved* username, so the entry is findable by name whether the user
 *  originally typed a name or a numeric id. */
export function cacheAnalysis(site: Site, ref: string, result: FavoritesAnalysisResult): void {
  const k = cacheKey(site, ref);
  entries = [{ key: k, at: Date.now(), result }, ...entries.filter((e) => e.key !== k)].slice(
    0,
    MAX_ENTRIES,
  );
  void persist();
}

export function removeCachedAnalysis(site: Site, ref: string): void {
  const k = cacheKey(site, ref);
  entries = entries.filter((e) => e.key !== k);
  void persist();
}

/** Fresh (< 30 min) cached analyses for this site, most-recent first - the "recently analyzed"
 *  history list. */
export function listFreshAnalyses(site: Site): RecentAnalysis[] {
  const prefix = `${site}::`;
  return entries
    .filter((e) => e.key.startsWith(prefix) && isAnalysisFresh(e))
    .sort((a, b) => b.at - a.at)
    .map((e) => ({
      ref: refFromKey(site, e.key),
      name: e.result.name,
      sampled: e.result.sampled,
      expiresAt: e.at + ANALYSIS_FRESH_MS,
    }));
}

// --- start gap ---

export function markAnalysisStarted(): void {
  lastStartedAt = Date.now();
  void persist();
}

/** Milliseconds until another analysis may be started (0 = ready now). Pass a clock value to
 *  make the result reactive in a component that ticks it. */
export function analysisGapRemaining(nowMs: number = Date.now()): number {
  return Math.max(0, ANALYSIS_MIN_GAP_MS - (nowMs - lastStartedAt));
}
