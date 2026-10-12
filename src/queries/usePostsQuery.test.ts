import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePost } from "../test/makePost";
import { parseBlacklist } from "../lib/blacklist";
import type { Post } from "../models/post";

const getPosts = vi.fn();
vi.mock("../api/client", () => ({ e621Api: { getPosts: (...args: unknown[]) => getPosts(...args) } }));

const { fetchLogicalPage, paginationMode } = await import("./usePostsQuery");

/** `n` posts with descending ids starting at `fromId`, all tagged `tag`. */
function posts(n: number, fromId: number, tag = "ok"): Post[] {
  return Array.from({ length: n }, (_, i) => makePost(fromId - i, { tags: { general: [tag] } }));
}

beforeEach(() => getPosts.mockReset());

describe("paginationMode", () => {
  it("uses keyset cursors only for the default id order", () => {
    expect(paginationMode("cat")).toBe("keyset");
    expect(paginationMode("cat order:id")).toBe("keyset");
    expect(paginationMode("cat order:id_desc")).toBe("keyset");
  });

  it("uses numbered pages for every other order (regression: order:score paging)", () => {
    expect(paginationMode("cat order:score")).toBe("numbered");
    expect(paginationMode("order:favcount cat")).toBe("numbered");
    expect(paginationMode("cat ORDER:Random")).toBe("numbered");
  });
});

describe("fetchLogicalPage", () => {
  it("keyset: next cursor is b<last id>", async () => {
    getPosts.mockResolvedValueOnce({ posts: posts(100, 500) });
    const page = await fetchLogicalPage("e621", "cat", undefined, [], "keyset");
    expect(page.nextCursor).toBe("b401");
    expect(page.posts).toHaveLength(100);
  });

  it("numbered: advances the page number and stops on a short page", async () => {
    getPosts.mockResolvedValueOnce({ posts: posts(100, 500) });
    expect((await fetchLogicalPage("e621", "order:score", "3", [], "numbered")).nextCursor).toBe("4");

    getPosts.mockResolvedValueOnce({ posts: posts(7, 500) });
    expect((await fetchLogicalPage("e621", "order:score", "4", [], "numbered")).nextCursor).toBeNull();
  });

  it("numbered: stops at e621's page-750 cap", async () => {
    getPosts.mockResolvedValueOnce({ posts: posts(100, 500) });
    expect((await fetchLogicalPage("e621", "order:score", "750", [], "numbered")).nextCursor).toBeNull();
  });

  it("an empty response ends pagination", async () => {
    getPosts.mockResolvedValueOnce({ posts: [] });
    expect(await fetchLogicalPage("e621", "cat", "b10", [], "keyset")).toEqual({
      posts: [],
      nextCursor: null,
    });
  });

  it("hops past fully-blacklisted pages, keeping the hidden posts", async () => {
    getPosts
      .mockResolvedValueOnce({ posts: posts(100, 500, "hidden") })
      .mockResolvedValueOnce({ posts: posts(100, 400, "ok") });
    const page = await fetchLogicalPage("e621", "cat", undefined, parseBlacklist("hidden"), "keyset");
    expect(getPosts).toHaveBeenCalledTimes(2);
    expect(getPosts.mock.calls[1][3]).toBe("b401");
    expect(page.posts).toHaveLength(200);
    expect(page.nextCursor).toBe("b301");
  });

  it("gives up after a bounded number of hops", async () => {
    let id = 100_000;
    getPosts.mockImplementation(async () => {
      id -= 100;
      return { posts: posts(100, id, "hidden") };
    });
    const page = await fetchLogicalPage("e621", "cat", undefined, parseBlacklist("hidden"), "keyset");
    expect(getPosts.mock.calls.length).toBeLessThanOrEqual(20);
    expect(page.nextCursor).not.toBeNull();
  });
});
