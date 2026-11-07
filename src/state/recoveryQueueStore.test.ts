import { describe, expect, it, vi } from "vitest";
import { makePost } from "../test/makePost";
import type { Post } from "../models/post";

// The store pulls in Tauri-backed modules; only the pure selection logic is under test here.
vi.mock("../api/client", () => ({ e621Api: { recoveredThumb: () => Promise.resolve(null) } }));
vi.mock("../lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("./mascotStore", () => ({ mascotReact: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => `asset://${p}` }));

const { recoverablePosts } = await import("./recoveryQueueStore");
const { useRecoveredStore } = await import("./recoveredStore");

function deleted(id: number, opts: { sources?: string[]; md5?: string } = {}): Post {
  const p = makePost(id);
  return {
    ...p,
    sources: opts.sources ?? [],
    file: { ...p.file, md5: opts.md5 ?? "" },
    flags: { ...p.flags, deleted: true },
  };
}

describe("recoverablePosts", () => {
  it("takes deleted posts with something to search with and no recovered copy yet", () => {
    useRecoveredStore.getState().setThumb("e621", 3, { path: "C:/r/3.png", is_video: false, not_found_at: null });
    useRecoveredStore.getState().setThumb("e621", 5, { path: null, is_video: false, not_found_at: 1 });
    const live = { ...makePost(1), flags: { ...makePost(1).flags, deleted: false } };
    const picked = recoverablePosts("e621", [
      live, // not deleted
      deleted(2, { sources: ["https://x.com/a/status/1"] }),
      deleted(3, { sources: ["https://x.com/a/status/2"] }), // already recovered
      deleted(4), // nothing to search with
      deleted(5, { md5: "0123456789abcdef0123456789abcdef" }), // searched before, not found: try again
      deleted(6, { sources: ["not a url"], md5: "0123456789abcdef0123456789abcdef" }),
    ]);
    expect(picked.map((p) => p.id)).toEqual([2, 5, 6]);
    // The recovered copy only counts on its own site.
    expect(recoverablePosts("e6ai", [deleted(3, { sources: ["https://x.com/a/status/2"] })]).map((p) => p.id)).toEqual([3]);
  });
});
