// The user's own SauceNAO API key (Settings > Reverse Image Search) - required, not optional:
// SauceNAO's API rejects anonymous requests outright (confirmed live - see saucenao.rs's doc
// comment), it isn't just a lower rate limit without one. Goes through the encrypted
// credentials.dat file next to the exe (src-tauri/src/credentials.rs's
// save/load/delete_saucenao_key), same as e621/e6AI credentials - not the plain settings.json
// store. It IS included in lib/backup.ts's snapshot, same as e621/e6AI credentials.

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
