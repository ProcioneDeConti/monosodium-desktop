import { describe, expect, it } from "vitest";
import {
  isBlacklisted,
  matchingBlacklistTags,
  parseBlacklist,
  testBlacklist,
  visiblePosts,
} from "./blacklist";
import { makePost } from "../test/makePost";

describe("parseBlacklist", () => {
  it("splits lines, lowercases, trims, and drops blank lines", () => {
    expect(parseBlacklist("  Gore  \n\n Scat   Feral \n")).toEqual([["gore"], ["scat", "feral"]]);
  });

  it("returns no entries for an empty blacklist", () => {
    expect(parseBlacklist("")).toEqual([]);
    expect(parseBlacklist("\n  \n")).toEqual([]);
  });
});

describe("isBlacklisted", () => {
  const post = makePost(1, { tags: { general: ["Solo", "feral"], artist: ["someone"] }, rating: "e" });

  it("matches a single tag case-insensitively", () => {
    expect(isBlacklisted(parseBlacklist("solo"), post)).toBe(true);
  });

  it("ANDs tags within a line", () => {
    expect(isBlacklisted(parseBlacklist("solo feral"), post)).toBe(true);
    expect(isBlacklisted(parseBlacklist("solo duo"), post)).toBe(false);
  });

  it("ORs lines together", () => {
    expect(isBlacklisted(parseBlacklist("duo\nsomeone"), post)).toBe(true);
  });

  it("treats the post's rating as a rating:<full name> pseudo-tag", () => {
    expect(isBlacklisted(parseBlacklist("rating:explicit"), post)).toBe(true);
    expect(isBlacklisted(parseBlacklist("rating:safe"), post)).toBe(false);
    expect(isBlacklisted(parseBlacklist("feral rating:explicit"), post)).toBe(true);
  });

  it("never matches with no entries", () => {
    expect(isBlacklisted([], post)).toBe(false);
  });
});

describe("matchingBlacklistTags", () => {
  it("returns only tags from lines that fully matched", () => {
    const post = makePost(1, { tags: { general: ["solo", "feral"] } });
    const tags = matchingBlacklistTags(parseBlacklist("solo\nferal duo"), post);
    expect([...tags]).toEqual(["solo"]);
  });
});

describe("testBlacklist", () => {
  it("reports per-line matches and the tags that were missing", () => {
    const post = makePost(1, { tags: { general: ["solo"] } });
    expect(testBlacklist(parseBlacklist("solo\nsolo duo"), post)).toEqual([
      { line: "solo", tags: ["solo"], matched: true, missingTags: [] },
      { line: "solo duo", tags: ["solo", "duo"], matched: false, missingTags: ["duo"] },
    ]);
  });
});

describe("visiblePosts", () => {
  const a = makePost(1, { tags: { general: ["solo"] } });
  const b = makePost(2, { tags: { general: ["duo"] } });
  const entries = parseBlacklist("solo");

  it("filters blacklisted posts out", () => {
    expect(visiblePosts([a, b], entries, false)).toEqual([b]);
  });

  it("returns the same array untouched when disabled or empty", () => {
    const posts = [a, b];
    expect(visiblePosts(posts, entries, true)).toBe(posts);
    expect(visiblePosts(posts, [], false)).toBe(posts);
  });
});
