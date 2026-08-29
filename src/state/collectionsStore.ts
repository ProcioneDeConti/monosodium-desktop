// Purely local, client-side post collections - no e621 account, no server. Named, categorised,
// and with an optional auto-download folder for newly-added posts. Own tauri-plugin-store file,
// same pattern as savedSearchesStore.ts.

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { e621Api } from "../api/client";
import type { Collection } from "../models/collection";

const STORE_FILE = "collections.json";
const KEY = "collections";

interface CollectionsState {
  isLoaded: boolean;
  collections: Collection[];
  create: (title: string, category: string) => Promise<Collection | null>;
  update: (id: string, patch: Partial<Pick<Collection, "title" | "category" | "autoDownloadFolder">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Adds ids not already present. Returns the ids that were actually new. */
  addPosts: (id: string, postIds: number[]) => Promise<number[]>;
  removePost: (id: string, postId: number) => Promise<void>;
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = e621Api.getDataDir().then((dir) => load(`${dir}/${STORE_FILE}`, { autoSave: true }));
  }
  return storePromise;
}

async function persist(collections: Collection[]) {
  const store = await getStore();
  await store.set(KEY, collections);
}

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  isLoaded: false,
  collections: [],

  create: async (title, category) => {
    const t = title.trim();
    if (!t) return null;
    const collection: Collection = {
      id: crypto.randomUUID(),
      title: t,
      category: category.trim(),
      postIds: [],
      createdAt: Date.now(),
      autoDownloadFolder: null,
    };
    const next = [...get().collections, collection];
    set({ collections: next });
    await persist(next);
    return collection;
  },

  update: async (id, patch) => {
    const next = get().collections.map((c) => (c.id === id ? { ...c, ...patch } : c));
    set({ collections: next });
    await persist(next);
  },

  remove: async (id) => {
    const next = get().collections.filter((c) => c.id !== id);
    set({ collections: next });
    await persist(next);
  },

  addPosts: async (id, postIds) => {
    const target = get().collections.find((c) => c.id === id);
    if (!target) return [];
    const existing = new Set(target.postIds);
    const added = postIds.filter((pid) => !existing.has(pid));
    if (added.length === 0) return [];
    const next = get().collections.map((c) =>
      c.id === id ? { ...c, postIds: [...c.postIds, ...added] } : c,
    );
    set({ collections: next });
    await persist(next);
    return added;
  },

  removePost: async (id, postId) => {
    const next = get().collections.map((c) =>
      c.id === id ? { ...c, postIds: c.postIds.filter((p) => p !== postId) } : c,
    );
    set({ collections: next });
    await persist(next);
  },
}));

/** Hydrates from disk on app boot. Call once, before rendering the shell. */
export async function loadCollections(): Promise<void> {
  const store = await getStore();
  const entries = (await store.get<Collection[]>(KEY)) ?? [];
  useCollectionsStore.setState({ collections: entries, isLoaded: true });
}
