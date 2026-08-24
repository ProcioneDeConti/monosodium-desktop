// Desktop analogue of the reference Android app's data/settings/SavedSearchStore.kt: a small,
// purely local list of {label, query} shortcuts (e621 itself has no saved-search feature to sync
// against). Kept in its own JSON file rather than folded into settingsStore.ts, matching the
// reference app's decision to use a separate DataStore for this rather than its general
// UserPreferences - the whole list is stored as one JSON array under a single key, same shape as
// there, rather than one store key per field like settingsStore.ts does for scalar settings.

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { SavedSearch } from "../models/savedSearch";

const STORE_FILE = "saved-searches.json";
const ENTRIES_KEY = "entries";

interface SavedSearchesState {
  isLoaded: boolean;
  savedSearches: SavedSearch[];
  /** No-ops on a blank label or query, matching the reference app's ViewModel guard - the UI
   *  also disables the save control while the label is blank, and only offers this at all while
   *  there's a non-blank current search to save. */
  add: (label: string, query: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(STORE_FILE, { autoSave: true });
  return storePromise;
}

export const useSavedSearchesStore = create<SavedSearchesState>((set, get) => ({
  isLoaded: false,
  savedSearches: [],

  add: async (label, query) => {
    const trimmedLabel = label.trim();
    const trimmedQuery = query.trim();
    if (!trimmedLabel || !trimmedQuery) return;
    const next = [
      ...get().savedSearches,
      { id: crypto.randomUUID(), label: trimmedLabel, query: trimmedQuery, createdAt: Date.now() },
    ];
    set({ savedSearches: next });
    const store = await getStore();
    await store.set(ENTRIES_KEY, next);
  },

  remove: async (id) => {
    const next = get().savedSearches.filter((s) => s.id !== id);
    set({ savedSearches: next });
    const store = await getStore();
    await store.set(ENTRIES_KEY, next);
  },
}));

/** Hydrates the store from disk on app boot. Call once, before rendering the shell. */
export async function loadSavedSearches(): Promise<void> {
  const store = await getStore();
  const entries = (await store.get<SavedSearch[]>(ENTRIES_KEY)) ?? [];
  useSavedSearchesStore.setState({ savedSearches: entries, isLoaded: true });
}
