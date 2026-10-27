import { describe, expect, it } from "vitest";
import { blacklistCulprits, dropSuggestions, lookupNames, withoutTerm } from "./emptyState";
import { parseBlacklist } from "./blacklist";
import { makePost } from "../test/makePost";
import type { TagInfo } from "../models/wiki";

const tag = (name: string, post_count: number): TagInfo => ({
  id: 0,
  name,
  post_count,
  category: 0,
  related_tags: "",
});

describe("lookupNames", () => {
  it("keeps plain and ~ tags, skips negations, metatags and wildcards", () => {
    expect(lookupNames("Wolf ~fox -cat order:score dra* wolf")).toEqual(["wolf", "fox"]);
  });
});

describe("dropSuggestions", () => {
  it("ranks unknown, then rare (rarest first), then the rest in order", () => {
    const out = dropSuggestions("wolf -cat bigrare smallrare wlof", [
      tag("wolf", 400000),
      tag("bigrare", 80),
      tag("smallrare", 3),
    ]);
    expect(out.map((s) => [s.term, s.reason])).toEqual([
      ["wlof", "unknown"],
      ["smallrare", "rare"],
      ["bigrare", "rare"],
      ["wolf", "other"],
      ["-cat", "other"],
    ]);
  });

  it("classifies nothing while the lookup is pending", () => {
    expect(dropSuggestions("a b", undefined).every((s) => s.reason === "other")).toBe(true);
  });

  it("treats a zero-count tag as unknown", () => {
    expect(dropSuggestions("dead", [tag("dead", 0)])[0].reason).toBe("unknown");
  });
});

describe("withoutTerm", () => {
  it("removes exactly one occurrence and normalises spacing", () => {
    expect(withoutTerm("  a  -b   c ", "-b")).toBe("a c");
  });
});

describe("blacklistCulprits", () => {
  it("counts posts per matching line, most first", () => {
    const entries = parseBlacklist("gore\nferal\nscat");
    const posts = [
      makePost(1, { tags: { general: ["feral"] } }),
      makePost(2, { tags: { general: ["feral", "gore"] } }),
      makePost(3, { tags: { general: ["feral"] } }),
    ];
    expect(blacklistCulprits(entries, posts)).toEqual([
      { line: "feral", count: 3 },
      { line: "gore", count: 1 },
    ]);
  });
});
