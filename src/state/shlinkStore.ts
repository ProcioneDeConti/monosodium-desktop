// The user's own Shlink URL shortener (Settings > Integrations > Link shortener). Server URL, API
// key and tag live in the encrypted credentials.dat (src-tauri/src/shlink.rs); this store only ever
// sees the server URL and tag - the key stays in the backend. Restored by Backup & Restore via the
// backend's secret splicing (backup.rs), hence the "source-secrets-restored" reload in App.tsx.

import { create } from "zustand";
import { e621Api } from "../api/client";

export const DEFAULT_SHLINK_TAG = "monosodium-desktop";

interface ShlinkState {
  serverUrl: string | null;
  tag: string;
  load: () => Promise<void>;
  save: (serverUrl: string, apiKey: string, tag: string) => Promise<void>;
  clear: () => Promise<void>;
}

/** Long URL -> short URL, for this session. Shlink's findIfExists would return the same link
 *  anyway; this just skips the round trip on a repeat share. Cleared whenever the config changes. */
const shortened = new Map<string, string>();

export const useShlinkStore = create<ShlinkState>((set, get) => ({
  serverUrl: null,
  tag: DEFAULT_SHLINK_TAG,

  load: async () => {
    const status = await e621Api.shlinkStatus().catch(() => null);
    shortened.clear();
    set({ serverUrl: status?.server_url ?? null, tag: status?.tag ?? get().tag });
  },

  save: async (serverUrl, apiKey, tag) => {
    await e621Api.saveShlinkConfig(serverUrl, apiKey, tag);
    await get().load();
  },

  clear: async () => {
    await e621Api.deleteShlinkConfig();
    shortened.clear();
    set({ serverUrl: null, tag: DEFAULT_SHLINK_TAG });
  },
}));

/** Shortens via Shlink when it's configured; otherwise (or on any failure, if `fallback`) returns
 *  the long URL unchanged - a share should never fail just because the shortener is down. */
export async function maybeShorten(longUrl: string, fallback = true): Promise<string> {
  if (!useShlinkStore.getState().serverUrl) return longUrl;
  const hit = shortened.get(longUrl);
  if (hit) return hit;
  try {
    const short = await e621Api.shortenUrl(longUrl);
    shortened.set(longUrl, short);
    return short;
  } catch (e) {
    if (fallback) return longUrl;
    throw e;
  }
}
