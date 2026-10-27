import { mascotReact } from "./mascotStore";
// Seen-post tracking: every post opened in the main viewer is remembered (per site - e621 and
// e6AI ids are separate spaces) so the grid can dim or hide it later. Local-only, its own
// tauri-plugin-store file, same pattern as searchHistoryStore. Insertion-ordered and capped, so
// the oldest ids fall off first; writes are debounced since arrow-key/slideshow nav can mark a
// post every second.

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

const STORE_FILE = "seen-posts.json";
const MAX_PER_SITE = 50_000;
const PERSIST_DEBOUNCE_MS = 2_000;

type SeenBySite = Record<string, Set<number>>;

interface SeenState {
  isLoaded: boolean;
  /** Replaced (not mutated) on every change so selectors re-render. */
  seen: SeenBySite;
  markSeen: (site: Site, postId: number) => void;
  clear: () => void;
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = e621Api.getDataDir().then((dir) => load(`${dir}/${STORE_FILE}`, { autoSave: false }));
  }
  return storePromise;
}

let persistTimer: number | undefined;
function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => void flushSeen(), PERSIST_DEBOUNCE_MS);
}

/** Writes pending changes now - called on the debounce, and when the window hides. */
export async function flushSeen(): Promise<void> {
  window.clearTimeout(persistTimer);
  const store = await getStore();
  const { seen } = useSeenStore.getState();
  for (const [site, ids] of Object.entries(seen)) await store.set(site, [...ids]);
  await store.save();
}

export const useSeenStore = create<SeenState>((set, get) => ({
  isLoaded: false,
  seen: {},

  markSeen: (site, postId) => {
    const current = get().seen[site];
    if (current?.has(postId)) return;
    const next = new Set(current);
    next.add(postId);
    if (next.size > MAX_PER_SITE) next.delete(next.values().next().value!);
    set({ seen: { ...get().seen, [site]: next } });
    schedulePersist();
  },

  clear: () => {
    set({ seen: {} });
    mascotReact("wipeSeen");
    void getStore().then(async (store) => {
      await store.clear();
      await store.save();
    });
  },
}));

/** Hydrates from disk on app boot. Call once, before rendering the shell. */
export async function loadSeen(): Promise<void> {
  const store = await getStore();
  const seen: SeenBySite = {};
  for (const [site, ids] of await store.entries<number[]>()) seen[site] = new Set(ids);
  useSeenStore.setState({ seen, isLoaded: true });
}

const EMPTY = new Set<number>();
/** The seen-id set for one site (stable empty set when nothing's been seen yet). */
export function useSeenIds(site: Site): Set<number> {
  return useSeenStore((s) => s.seen[site] ?? EMPTY);
}
