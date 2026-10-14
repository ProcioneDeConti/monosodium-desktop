// Tagdle's local state, in its own JSON file (same reasoning as savedSearchesStore.ts - it's a
// self-contained feature, not general settings): the cached tag pools, the game preferences,
// finished daily results, and the best Endless streak per site.
//
// Pools are the top tags per category from tags.json (order=count). They're refreshed weekly,
// like e621dle's own data - counts don't move fast enough to matter, and a full refresh is
// POOL_PAGES requests per category through the shared 1 req/sec limiter.

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { e621Api } from "../api/client";
import type { Rating } from "../models/post";
import type { Site } from "../models/site";
import { ALL_TAGDLE_CATEGORIES, TAGDLE_CATEGORY_ID, type PoolTag, type TagdleCategory } from "../lib/tagdle";

const STORE_FILE = "tagdle.json";
const POOL_PAGES = 2;
const POOL_PAGE_SIZE = 320;
const POOL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedPool {
  fetchedAt: number;
  tags: PoolTag[];
}

export interface TagdlePrefs {
  /** Categories Endless draws from. Daily always uses all of them so every player's daily matches. */
  categories: TagdleCategory[];
  showImages: boolean;
  /** Ratings a sample image may have (still capped to safe while adult mode is off). */
  imageRatings: Rating[];
}

const DEFAULT_PREFS: TagdlePrefs = {
  categories: ALL_TAGDLE_CATEGORIES,
  showImages: false,
  imageRatings: ["s"],
};

interface TagdleState {
  isLoaded: boolean;
  prefs: TagdlePrefs;
  /** `${site}:${dayKey}` -> per-round correct/incorrect, written once the daily is finished. */
  daily: Record<string, boolean[]>;
  bestStreak: Partial<Record<Site, number>>;
  setPrefs: (patch: Partial<TagdlePrefs>) => void;
  recordDaily: (site: Site, dayKey: string, results: boolean[]) => void;
  recordStreak: (site: Site, streak: number) => void;
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

async function persist(key: string, value: unknown) {
  const store = await getStore();
  await store.set(key, value);
}

export const useTagdleStore = create<TagdleState>((set, get) => ({
  isLoaded: false,
  prefs: DEFAULT_PREFS,
  daily: {},
  bestStreak: {},

  setPrefs: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    void persist("prefs", prefs);
  },

  recordDaily: (site, dayKey, results) => {
    const daily = { ...get().daily, [`${site}:${dayKey}`]: results };
    set({ daily });
    void persist("daily", daily);
  },

  recordStreak: (site, streak) => {
    if (streak <= (get().bestStreak[site] ?? 0)) return;
    const bestStreak = { ...get().bestStreak, [site]: streak };
    set({ bestStreak });
    void persist("bestStreak", bestStreak);
  },
}));

export async function loadTagdle(): Promise<void> {
  if (useTagdleStore.getState().isLoaded) return;
  const store = await getStore();
  const prefs = { ...DEFAULT_PREFS, ...((await store.get<Partial<TagdlePrefs>>("prefs")) ?? {}) };
  const daily = (await store.get<Record<string, boolean[]>>("daily")) ?? {};
  const bestStreak = (await store.get<Partial<Record<Site, number>>>("bestStreak")) ?? {};
  useTagdleStore.setState({ prefs, daily, bestStreak, isLoaded: true });
}

/** The tag pool for the given categories, from the on-disk cache where it's under a week old,
 *  otherwise fetched (and cached) per category. `onProgress` reports categories done. */
export async function loadPool(
  site: Site,
  categories: TagdleCategory[],
  onProgress?: (done: number, total: number) => void,
): Promise<PoolTag[]> {
  const store = await getStore();
  const out: PoolTag[] = [];
  for (const [i, category] of categories.entries()) {
    const id = TAGDLE_CATEGORY_ID[category];
    const key = `pool:${site}:${id}`;
    let cached = await store.get<CachedPool>(key);
    if (!cached || Date.now() - cached.fetchedAt > POOL_MAX_AGE_MS) {
      const tags: PoolTag[] = [];
      for (let page = 1; page <= POOL_PAGES; page++) {
        const batch = await e621Api.getTopTags(site, id, page, POOL_PAGE_SIZE);
        tags.push(...batch.map((t) => ({ name: t.name, post_count: t.post_count, category: t.category })));
        if (batch.length < POOL_PAGE_SIZE) break;
      }
      cached = { fetchedAt: Date.now(), tags };
      await store.set(key, cached);
    }
    out.push(...cached.tags);
    onProgress?.(i + 1, categories.length);
  }
  return out;
}
