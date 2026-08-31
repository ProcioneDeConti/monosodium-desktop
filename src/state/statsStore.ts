// Local-only usage statistics for the User Dashboard (components/Dashboard/DashboardPanel.tsx).
// Everything here is recorded on this device and never sent anywhere - e621 has no concept of any
// of it. Its own `stats.json` tauri-plugin-store file in the data folder (same pattern as
// savedSearchesStore / searchHistoryStore), vault-encrypted and .bak-guarded like the rest.
//
// Every recorder is gated on `settingsStore.usageStatsEnabled` (Dashboard > Manage toggle) - when
// off they're all no-ops, existing data is untouched. Persistence is debounced (see
// PERSIST_DEBOUNCE_MS) since some recorders fire often; `flushStats()` forces an immediate write
// on session end / unload.

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { e621Api } from "../api/client";
import { useSettingsStore } from "./settingsStore";
import type { Post } from "../models/post";
import type { Site } from "../models/site";

const STORE_FILE = "stats.json";
const KEY = "stats";

const SEEN_CAP = 20_000; // most-recent post ids kept (the running "unique" count is separate + exact)
const DAILY_CAP = 140; // dated activity buckets kept
const TAG_MAP_CAP = 400; // per-category viewed-tag tallies; pruned to TAG_MAP_KEEP when exceeded
const TAG_MAP_KEEP = 300;
const TERM_MAP_CAP = 400;
const TERM_MAP_KEEP = 300;

export interface StatsLifetime {
  postsViewed: number;
  uniquePostsViewed: number;
  searches: number;
  favoritesAdded: number;
  favoritesRemoved: number;
  votesUp: number;
  votesDown: number;
  downloads: number;
  downloadBytes: number;
  slideshowMs: number;
  apiCalls: number;
  apiResponseBytes: number;
  /** Estimated media bytes: sum of `file.size` for each distinct post opened full-size in the
   *  viewer this session, plus completed downloads. Thumbnails aren't counted (small, cached). */
  mediaBytesEst: number;
  activeMs: number;
  sessions: number;
  longestSessionMs: number;
}

export interface StatsDailyEntry {
  postsViewed: number;
  searches: number;
  activeMs: number;
  apiCalls: number;
}

interface SiteCounters {
  postsViewed: number;
  searches: number;
  apiCalls: number;
}

export interface StatsSnapshot {
  /** epoch ms of the first launch that had stats loaded - "using MD for N days". */
  firstLaunch: number | null;
  lifetime: StatsLifetime;
  perSite: Record<Site, SiteCounters>;
  daily: Record<string, StatsDailyEntry>;
  seenPostIds: number[];
  searchTermCounts: Record<string, number>;
  viewedTags: {
    artist: Record<string, number>;
    character: Record<string, number>;
    copyright: Record<string, number>;
  };
}

interface StatsState extends StatsSnapshot {
  isLoaded: boolean;
  recordPostView: (post: Post, site: Site) => void;
  recordSearch: (query: string, site: Site) => void;
  recordFavorite: (added: boolean) => void;
  recordVote: (direction: 1 | -1) => void;
  recordDownload: (bytes: number) => void;
  recordSlideshow: (ms: number) => void;
  recordApiActivity: (calls: number, bytes: number, site: Site) => void;
  recordActive: (ms: number) => void;
  recordSession: (durationMs: number) => void;
  reset: () => void;
}

// --- module state not worth persisting ---
const seenSet = new Set<number>(); // membership mirror of seenPostIds
const countedMediaThisSession = new Set<number>();

// --- helpers ---

export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Descending list of the last `n` day keys, today first. */
export function lastNDayKeys(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(dayKey(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

function freshLifetime(): StatsLifetime {
  return {
    postsViewed: 0,
    uniquePostsViewed: 0,
    searches: 0,
    favoritesAdded: 0,
    favoritesRemoved: 0,
    votesUp: 0,
    votesDown: 0,
    downloads: 0,
    downloadBytes: 0,
    slideshowMs: 0,
    apiCalls: 0,
    apiResponseBytes: 0,
    mediaBytesEst: 0,
    activeMs: 0,
    sessions: 0,
    longestSessionMs: 0,
  };
}

function freshSnapshot(): StatsSnapshot {
  return {
    firstLaunch: null,
    lifetime: freshLifetime(),
    perSite: {
      e621: { postsViewed: 0, searches: 0, apiCalls: 0 },
      e6ai: { postsViewed: 0, searches: 0, apiCalls: 0 },
    },
    daily: {},
    seenPostIds: [],
    searchTermCounts: {},
    viewedTags: { artist: {}, character: {}, copyright: {} },
  };
}

function tracking(): boolean {
  return useSettingsStore.getState().usageStatsEnabled;
}

function bumpSite(
  perSite: Record<Site, SiteCounters>,
  site: Site,
  patch: Partial<SiteCounters>,
): Record<Site, SiteCounters> {
  const cur = perSite[site];
  return {
    ...perSite,
    [site]: {
      postsViewed: cur.postsViewed + (patch.postsViewed ?? 0),
      searches: cur.searches + (patch.searches ?? 0),
      apiCalls: cur.apiCalls + (patch.apiCalls ?? 0),
    },
  };
}

function bumpDay(
  daily: Record<string, StatsDailyEntry>,
  key: string,
  patch: Partial<StatsDailyEntry>,
): Record<string, StatsDailyEntry> {
  const cur = daily[key] ?? { postsViewed: 0, searches: 0, activeMs: 0, apiCalls: 0 };
  const next: Record<string, StatsDailyEntry> = {
    ...daily,
    [key]: {
      postsViewed: cur.postsViewed + (patch.postsViewed ?? 0),
      searches: cur.searches + (patch.searches ?? 0),
      activeMs: cur.activeMs + (patch.activeMs ?? 0),
      apiCalls: cur.apiCalls + (patch.apiCalls ?? 0),
    },
  };
  const keys = Object.keys(next).sort();
  if (keys.length > DAILY_CAP) {
    for (const k of keys.slice(0, keys.length - DAILY_CAP)) delete next[k];
  }
  return next;
}

function pruneMap(map: Record<string, number>, cap: number, keep: number): Record<string, number> {
  if (Object.keys(map).length <= cap) return map;
  return Object.fromEntries(
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, keep),
  );
}

function addToMap(
  map: Record<string, number>,
  names: string[],
  cap: number,
  keep: number,
): Record<string, number> {
  if (names.length === 0) return map;
  const next = { ...map };
  for (const n of names) next[n] = (next[n] ?? 0) + 1;
  return pruneMap(next, cap, keep);
}

/** Real tag tokens from a query - lowercased, leading `-` stripped, metatags (`foo:bar`) dropped. */
function queryTerms(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/^-+/, ""))
    .filter((t) => t.length > 0 && !t.includes(":") && t !== "~");
}

// --- persistence (debounced) ---

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = e621Api
      .getDataDir()
      .then((dir) => load(`${dir}/${STORE_FILE}`, { autoSave: false }));
  }
  return storePromise;
}

function snapshotOf(s: StatsState): StatsSnapshot {
  return {
    firstLaunch: s.firstLaunch,
    lifetime: s.lifetime,
    perSite: s.perSite,
    daily: s.daily,
    seenPostIds: s.seenPostIds,
    searchTermCounts: s.searchTermCounts,
    viewedTags: s.viewedTags,
  };
}

// Coalesce writes. Stats are derived data (a lost tail just under-counts slightly), and the
// snapshot includes a multi-KB `seenPostIds` array that gets JSON-serialised and AES-encrypted
// on every write - so a longer debounce meaningfully cuts churn while browsing. usageSession
// flushes every 15s regardless, and `flushStats()` forces a write on window-hide / unload.
const PERSIST_DEBOUNCE_MS = 12_000;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow().catch(() => {});
  }, PERSIST_DEBOUNCE_MS);
}
async function persistNow() {
  const store = await getStore();
  await store.set(KEY, snapshotOf(useStatsStore.getState()));
  await store.save();
}

/** Force an immediate write (session end / beforeunload). */
export async function flushStats(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await persistNow().catch(() => {});
}

// --- store ---

export const useStatsStore = create<StatsState>((set) => ({
  ...freshSnapshot(),
  isLoaded: false,

  recordPostView: (post, site) => {
    if (!tracking()) return;
    const id = post.id;
    const isNew = !seenSet.has(id);
    if (isNew) seenSet.add(id);
    let mediaBytes = 0;
    if (!countedMediaThisSession.has(id)) {
      countedMediaThisSession.add(id);
      mediaBytes = post.file?.size || 0;
    }
    set((s) => {
      // One allocation, not two (`.concat().slice()` copied the whole array twice). Only trims
      // once actually over cap, which is the rare case.
      let seenPostIds = s.seenPostIds;
      if (isNew) {
        const start = s.seenPostIds.length >= SEEN_CAP ? s.seenPostIds.length - SEEN_CAP + 1 : 0;
        seenPostIds = start > 0 ? s.seenPostIds.slice(start) : s.seenPostIds.slice();
        seenPostIds.push(id);
      }
      return {
        seenPostIds,
        lifetime: {
          ...s.lifetime,
          postsViewed: s.lifetime.postsViewed + 1,
          uniquePostsViewed: s.lifetime.uniquePostsViewed + (isNew ? 1 : 0),
          mediaBytesEst: s.lifetime.mediaBytesEst + mediaBytes,
        },
        perSite: bumpSite(s.perSite, site, { postsViewed: 1 }),
        daily: bumpDay(s.daily, dayKey(), { postsViewed: 1 }),
        viewedTags: {
          artist: addToMap(s.viewedTags.artist, post.tags.artist, TAG_MAP_CAP, TAG_MAP_KEEP),
          character: addToMap(
            s.viewedTags.character,
            post.tags.character,
            TAG_MAP_CAP,
            TAG_MAP_KEEP,
          ),
          copyright: addToMap(
            s.viewedTags.copyright,
            post.tags.copyright,
            TAG_MAP_CAP,
            TAG_MAP_KEEP,
          ),
        },
      };
    });
    schedulePersist();
  },

  recordSearch: (query, site) => {
    if (!tracking()) return;
    set((s) => ({
      lifetime: { ...s.lifetime, searches: s.lifetime.searches + 1 },
      perSite: bumpSite(s.perSite, site, { searches: 1 }),
      daily: bumpDay(s.daily, dayKey(), { searches: 1 }),
      searchTermCounts: addToMap(
        s.searchTermCounts,
        queryTerms(query),
        TERM_MAP_CAP,
        TERM_MAP_KEEP,
      ),
    }));
    schedulePersist();
  },

  recordFavorite: (added) => {
    if (!tracking()) return;
    set((s) => ({
      lifetime: {
        ...s.lifetime,
        favoritesAdded: s.lifetime.favoritesAdded + (added ? 1 : 0),
        favoritesRemoved: s.lifetime.favoritesRemoved + (added ? 0 : 1),
      },
    }));
    schedulePersist();
  },

  recordVote: (direction) => {
    if (!tracking()) return;
    set((s) => ({
      lifetime: {
        ...s.lifetime,
        votesUp: s.lifetime.votesUp + (direction === 1 ? 1 : 0),
        votesDown: s.lifetime.votesDown + (direction === -1 ? 1 : 0),
      },
    }));
    schedulePersist();
  },

  recordDownload: (bytes) => {
    if (!tracking()) return;
    set((s) => ({
      lifetime: {
        ...s.lifetime,
        downloads: s.lifetime.downloads + 1,
        downloadBytes: s.lifetime.downloadBytes + Math.max(0, bytes),
      },
    }));
    schedulePersist();
  },

  recordSlideshow: (ms) => {
    if (!tracking() || ms <= 0) return;
    set((s) => ({ lifetime: { ...s.lifetime, slideshowMs: s.lifetime.slideshowMs + ms } }));
    schedulePersist();
  },

  recordApiActivity: (calls, bytes, site) => {
    if (!tracking() || calls <= 0) return;
    set((s) => ({
      lifetime: {
        ...s.lifetime,
        apiCalls: s.lifetime.apiCalls + calls,
        apiResponseBytes: s.lifetime.apiResponseBytes + Math.max(0, bytes),
      },
      perSite: bumpSite(s.perSite, site, { apiCalls: calls }),
      daily: bumpDay(s.daily, dayKey(), { apiCalls: calls }),
    }));
    schedulePersist();
  },

  recordActive: (ms) => {
    if (!tracking() || ms <= 0) return;
    set((s) => ({
      lifetime: { ...s.lifetime, activeMs: s.lifetime.activeMs + ms },
      daily: bumpDay(s.daily, dayKey(), { activeMs: ms }),
    }));
    schedulePersist();
  },

  recordSession: (durationMs) => {
    if (!tracking() || durationMs <= 0) return;
    set((s) => ({
      lifetime: {
        ...s.lifetime,
        sessions: s.lifetime.sessions + 1,
        longestSessionMs: Math.max(s.lifetime.longestSessionMs, durationMs),
      },
    }));
    schedulePersist();
  },

  reset: () => {
    seenSet.clear();
    countedMediaThisSession.clear();
    set({ ...freshSnapshot(), firstLaunch: Date.now(), isLoaded: true });
    void flushStats();
  },
}));

/** Hydrate from disk on boot. Call once (App.tsx boot), before rendering the dashboard. Never
 *  rejects - a missing/corrupt stats file just starts fresh (it's derived data, not settings). */
export async function loadStats(): Promise<void> {
  let saved: Partial<StatsSnapshot> | null = null;
  try {
    const store = await getStore();
    saved = (await store.get<Partial<StatsSnapshot>>(KEY)) ?? null;
  } catch {
    saved = null;
  }
  const base = freshSnapshot();
  const merged: StatsSnapshot = {
    firstLaunch: saved?.firstLaunch ?? Date.now(),
    lifetime: { ...base.lifetime, ...saved?.lifetime },
    perSite: {
      e621: { ...base.perSite.e621, ...saved?.perSite?.e621 },
      e6ai: { ...base.perSite.e6ai, ...saved?.perSite?.e6ai },
    },
    daily: saved?.daily ?? {},
    seenPostIds: saved?.seenPostIds ?? [],
    searchTermCounts: saved?.searchTermCounts ?? {},
    viewedTags: {
      artist: saved?.viewedTags?.artist ?? {},
      character: saved?.viewedTags?.character ?? {},
      copyright: saved?.viewedTags?.copyright ?? {},
    },
  };
  seenSet.clear();
  for (const id of merged.seenPostIds) seenSet.add(id);
  useStatsStore.setState({ ...merged, isLoaded: true });
  if (!saved || saved.firstLaunch == null) schedulePersist();
}

// --- backup (aggregates only - see lib/backup.ts) ---

export interface StatsBackupAggregates {
  firstLaunch: number | null;
  lifetime: StatsLifetime;
  perSite: Record<Site, SiteCounters>;
}

export function statsBackupAggregates(): StatsBackupAggregates {
  const s = useStatsStore.getState();
  return { firstLaunch: s.firstLaunch, lifetime: s.lifetime, perSite: s.perSite };
}

export function applyStatsBackup(agg: StatsBackupAggregates | undefined): void {
  if (!agg) return;
  const base = freshSnapshot();
  useStatsStore.setState((s) => ({
    firstLaunch: agg.firstLaunch ?? s.firstLaunch,
    lifetime: { ...base.lifetime, ...agg.lifetime },
    perSite: {
      e621: { ...base.perSite.e621, ...agg.perSite?.e621 },
      e6ai: { ...base.perSite.e6ai, ...agg.perSite?.e6ai },
    },
  }));
  void flushStats();
}
