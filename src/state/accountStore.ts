// Per-site account credentials, loaded from/saved to the encrypted credentials.dat file next to
// the exe via the Rust `credentials` commands (src-tauri/src/credentials.rs) - never persisted in
// the plain-JSON settings store. e621 and e6AI are separate accounts (see the reference app's
// UserSettings.username/apiKey), so each site's credentials are tracked independently.

import { create } from "zustand";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

interface SiteAccount {
  username: string;
  apiKey: string;
}

interface AccountState {
  accounts: Partial<Record<Site, SiteAccount>>;
  loaded: Partial<Record<Site, boolean>>;
  loadFromKeyring: (site: Site) => Promise<void>;
  save: (site: Site, username: string, apiKey: string) => Promise<void>;
  clear: (site: Site) => Promise<void>;
  isAuthenticated: (site: Site) => boolean;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: {},
  loaded: {},

  loadFromKeyring: async (site) => {
    const creds = await e621Api.loadCredentials(site);
    set((s) => ({
      accounts: {
        ...s.accounts,
        [site]: creds ? { username: creds.username, apiKey: creds.api_key } : undefined,
      },
      loaded: { ...s.loaded, [site]: true },
    }));
  },

  save: async (site, username, apiKey) => {
    await e621Api.saveCredentials(site, username, apiKey);
    set((s) => ({ accounts: { ...s.accounts, [site]: { username, apiKey } } }));
  },

  clear: async (site) => {
    await e621Api.deleteCredentials(site);
    set((s) => ({ accounts: { ...s.accounts, [site]: undefined } }));
  },

  isAuthenticated: (site) => {
    const account = get().accounts[site];
    return !!account && account.username.trim() !== "" && account.apiKey.trim() !== "";
  },
}));

export async function loadAllAccounts(): Promise<void> {
  const store = useAccountStore.getState();
  await Promise.all([store.loadFromKeyring("e621"), store.loadFromKeyring("e6ai")]);
}
