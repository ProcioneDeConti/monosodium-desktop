import { describe, expect, it } from "vitest";
import { parseSiteUrl, unwrapDeepLink } from "./deepLink";

describe("deep links", () => {
  it("unwraps monosodium:// links", () => {
    const inner = "https://e621.net/posts/123?q=wolf";
    expect(unwrapDeepLink(`monosodium://open?url=${encodeURIComponent(inner)}`)).toBe(inner);
    expect(unwrapDeepLink("not a url")).toBeNull();
  });

  it("maps e621 pages to in-app targets", () => {
    expect(parseSiteUrl("https://e621.net/posts/42")).toEqual({ kind: "post", site: "e621", id: 42 });
    expect(parseSiteUrl("https://e6ai.net/posts?tags=wolf+rating%3As")).toEqual({ kind: "search", site: "e6ai", query: "wolf rating:s" });
    expect(parseSiteUrl("https://e621.net/pools/7")).toEqual({ kind: "pool", site: "e621", id: 7 });
    expect(parseSiteUrl("https://e621.net/users/99")).toEqual({ kind: "user", site: "e621", id: 99 });
    expect(parseSiteUrl("https://e621.net/wiki_pages/show_or_new?title=wolf")).toEqual({ kind: "wiki", site: "e621", tag: "wolf" });
    expect(parseSiteUrl("https://e621.net/artists/someone")).toEqual({ kind: "artist", site: "e621", tag: "someone" });
    expect(parseSiteUrl("https://e621.net/explore/posts/popular")).toEqual({ kind: "popular", site: "e621" });
    expect(parseSiteUrl("https://e621.net/favorites?user_name=bob")).toEqual({ kind: "search", site: "e621", query: "fav:bob" });
  });

  it("rejects other sites and unhandled pages", () => {
    expect(parseSiteUrl("https://example.com/posts/1")).toBeNull();
    expect(parseSiteUrl("https://e621.net/forum_topics/5")).toBeNull();
    expect(parseSiteUrl("https://e621.net/wiki_pages/show_or_new")).toBeNull();
    expect(parseSiteUrl("https://e621.net/artists/show_or_new?name=123")).toBeNull();
    expect(parseSiteUrl("https://e621.net/wiki_pages/%E0%A4")).toBeNull();
  });
});
