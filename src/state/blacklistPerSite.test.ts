import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the tauri-plugin-store settings file.
const disk = new Map<string, unknown>();
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    entries: async () => [...disk.entries()],
    set: async (k: string, v: unknown) => void disk.set(k, v),
  }),
}));

const remote: Record<string, string> = {};
const pushed: { site: string; text: string }[] = [];
vi.mock("../api/client", () => ({
  e621Api: {
    getDataDir: async () => "/data",
    getCurrentUser: async (site: string) => ({ id: 1, blacklisted_tags: remote[site] ?? "" }),
    updateBlacklist: async (site: string, _id: number, text: string) => {
      pushed.push({ site, text });
      remote[site] = text;
    },
  },
}));

const { useSettingsStore, loadSettings } = await import("./settingsStore");
const { useAccountStore } = await import("./accountStore");
const { syncBlacklist, addToBlacklist } = await import("./blacklistSync");

async function freshLoad(saved: Record<string, unknown>) {
  disk.clear();
  for (const [k, v] of Object.entries(saved)) disk.set(k, v);
  await loadSettings();
}

beforeEach(() => {
  for (const k of Object.keys(remote)) delete remote[k];
  pushed.length = 0;
  useAccountStore.setState({ accounts: {} });
});

describe("per-site blacklists", () => {
  it("migrates the old shared list to e621 only, and drops other sites' stale sync bases", async () => {
    await freshLoad({ site: "floofgens", blacklist: "gore", blacklistSyncBase: { e621: "gore", floofgens: "gore\nscat" } });
    const s = useSettingsStore.getState();
    expect(s.blacklistBySite).toEqual({ e621: "gore", floofgens: "", blep: "" });
    expect(s.blacklist).toBe(""); // active site is floofgens
    expect(s.blacklistSyncBase).toEqual({ e621: "gore" });
    expect(disk.get("blacklistBySite")).toEqual({ e621: "gore", floofgens: "", blep: "" });
  });

  it("swaps the active list on site switch and edits only the target site", async () => {
    await freshLoad({ site: "e621", blacklistBySite: { e621: "gore", floofgens: "", blep: "feet" } });
    const st = useSettingsStore.getState();
    st.setBlacklist("scat", "floofgens");
    expect(useSettingsStore.getState().blacklist).toBe("gore"); // active (e621) untouched
    st.setSite("blep");
    expect(useSettingsStore.getState().blacklist).toBe("feet");
    expect(useSettingsStore.getState().blacklistEntries).toEqual([["feet"]]);
    addToBlacklist("vore");
    expect(useSettingsStore.getState().blacklistBySite).toEqual({ e621: "gore", floofgens: "scat", blep: "feet\nvore" });
  });

  it("syncs a site's own list with only that site's account", async () => {
    await freshLoad({ site: "e621", blacklist: "gore" });
    useAccountStore.setState({ accounts: { floofgens: { username: "u", apiKey: "k" } } });
    remote.floofgens = "scat";
    await syncBlacklist("floofgens");
    // First sync after migration is a pull: e621's "gore" must not reach the floofgens account.
    expect(pushed).toEqual([]);
    expect(useSettingsStore.getState().blacklistBySite).toEqual({ e621: "gore", floofgens: "scat", blep: "" });
  });
});
