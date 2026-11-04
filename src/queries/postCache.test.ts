import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { makePost } from "../test/makePost";
import type { Post } from "../models/post";
import { subscribePostUpdates, updatePostInCache } from "./postCache";

const fav = (p: Post): Post => ({ ...p, is_favorited: true });

describe("updatePostInCache", () => {
  it("patches the post in every list shape that holds it, and leaves others alone", () => {
    const qc = new QueryClient();
    const a = makePost(1);
    const b = makePost(2);
    qc.setQueryData(["posts", "search"], { pages: [{ posts: [a, b] }], pageParams: [undefined] });
    qc.setQueryData(["popular", "e621", "2026-11-03", "day"], [b, a]);
    qc.setQueryData(["poolPosts", "e621", 5], [a]);
    qc.setQueryData(["single"], { posts: [a] });
    qc.setQueryData(["unrelated"], { name: "not posts" });
    const untouched = [b];
    qc.setQueryData(["popular", "other"], untouched);

    updatePostInCache(qc, 1, fav);

    const search = qc.getQueryData<{ pages: { posts: Post[] }[] }>(["posts", "search"])!;
    expect(search.pages[0].posts.map((p) => p.is_favorited)).toEqual([true, false]);
    expect(qc.getQueryData<Post[]>(["popular", "e621", "2026-11-03", "day"])!.map((p) => p.is_favorited)).toEqual([false, true]);
    expect(qc.getQueryData<Post[]>(["poolPosts", "e621", 5])![0].is_favorited).toBe(true);
    expect(qc.getQueryData<{ posts: Post[] }>(["single"])!.posts[0].is_favorited).toBe(true);
    expect(qc.getQueryData(["unrelated"])).toEqual({ name: "not posts" });
    // A list without the post keeps its identity (no needless re-render).
    expect(qc.getQueryData(["popular", "other"])).toBe(untouched);
  });

  it("tells subscribers (out-of-cache lists like For you) until they unsubscribe", () => {
    const qc = new QueryClient();
    const seen: number[] = [];
    const off = subscribePostUpdates((id, updater) => {
      seen.push(id);
      expect(updater(makePost(id)).is_favorited).toBe(true);
    });
    updatePostInCache(qc, 7, fav);
    off();
    updatePostInCache(qc, 8, fav);
    expect(seen).toEqual([7]);
  });
});
