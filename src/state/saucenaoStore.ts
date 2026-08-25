// The user's own SauceNAO API key (Settings > Reverse Image Search) - optional, works without
// one at a much lower rate limit. Goes through Windows Credential Manager (src-tauri/src/
// credentials.rs's save/load/delete_saucenao_key), same as e621/e6AI credentials - not the plain
// settings.json store, and not part of lib/backup.ts's snapshot either.

import { create } from "zustand";
import { e621Api } from "../api/client";

interface SaucenaoState {
  apiKey: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  save: (apiKey: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useSaucenaoStore = create<SaucenaoState>((set) => ({
  apiKey: null,
  loaded: false,

  load: async () => {
    const apiKey = await e621Api.loadSaucenaoKey();
    set({ apiKey, loaded: true });
  },

  save: async (apiKey) => {
    await e621Api.saveSaucenaoKey(apiKey);
    set({ apiKey });
  },

  clear: async () => {
    await e621Api.deleteSaucenaoKey();
    set({ apiKey: null });
  },
}));
