import { expect, it, vi } from "vitest";

const disk = new Map<string, unknown>();
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    get: async (k: string) => disk.get(k),
    set: async (k: string, v: unknown) => void disk.set(k, v),
    save: async () => {},
  }),
}));
vi.mock("../api/client", () => ({ e621Api: { getDataDir: async () => "/data" } }));

const { useStatsStore, loadStats, flushStats } = await import("./statsStore");

it("resets pre-fix search term counts once, keeping everything else", async () => {
  disk.set("stats", {
    firstLaunch: 123,
    lifetime: { searches: 50 },
    searchTermCounts: { female: 40 },
    viewedTags: { artist: { someone: 3 }, character: {}, copyright: {} },
  });
  await loadStats();
  const s = useStatsStore.getState();
  expect(s.searchTermCounts).toEqual({});
  expect(s.lifetime.searches).toBe(50);
  expect(s.firstLaunch).toBe(123);
  expect(s.viewedTags.artist).toEqual({ someone: 3 });

  useStatsStore.setState({ searchTermCounts: { fox: 1 } });
  await flushStats();
  await loadStats();
  expect(useStatsStore.getState().searchTermCounts).toEqual({ fox: 1 });
});
