// Auto-recorded recent searches - distinct from savedSearchesStore.ts (those are deliberate,
// named, and never auto-pruned). Local-only, its own tauri-plugin-store file, same pattern as
// saved searches. Most-recent-first, deduped, capped.

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { e621Api } from "../api/client";

const STORE_FILE = "search-history.json";
const KEY = "queries";
const MAX_ENTRIES = 25;

interface SearchHistoryState {
  isLoaded: boolean;
  history: string[];
  /** No-op on a blank query. Moves an existing entry to the front rather than duplicating it. */
  record: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = e621Api.getDataDir().then((dir) => load(`${dir}/${STORE_FILE}`, { autoSave: true }));
  }
  return storePromise;
}

async function persist(history: string[]) {
  const store = await getStore();
  await store.set(KEY, history);
}

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => ({
  isLoaded: false,
  history: [],

  record: (query) => {
    const q = query.trim();
    if (!q) return;
    const next = [q, ...get().history.filter((x) => x !== q)].slice(0, MAX_ENTRIES);
    set({ history: next });
    void persist(next);
  },

  remove: (query) => {
    const next = get().history.filter((x) => x !== query);
    set({ history: next });
    void persist(next);
  },

  clear: () => {
    set({ history: [] });
    void persist([]);
  },
}));

/** Hydrates from disk on app boot. Call once, before rendering the shell. */
export async function loadSearchHistory(): Promise<void> {
  const store = await getStore();
  const entries = (await store.get<string[]>(KEY)) ?? [];
  useSearchHistoryStore.setState({ history: entries, isLoaded: true });
}
