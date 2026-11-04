import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import type { TagInfo } from "../models/wiki";
import {
  addToTaste,
  createTasteAccumulator,
  finalizeTaste,
  progressiveWords,
  tagNamesForLookup,
} from "./tasteProfile";

const META = {
  site: "e621" as const,
  user: { id: 1, name: "tester", avatarId: null },
  mode: "recent" as const,
  usedVotes: false,
  builtAt: 0,
};

function info(name: string, post_count: number): TagInfo {
  return { id: 0, name, post_count, category: 0, related_tags: "" };
}

describe("tasteProfile", () => {
  it("counts the five taste categories and skips meta/lore/noise tags", () => {
    const acc = createTasteAccumulator();
    addToTaste(
      acc,
      [
        makePost(1, {
          tags: {
            artist: ["artist_a", "conditional_dnp", "unknown_artist"],
            general: ["solo"],
            meta: ["hi_res"],
            lore: ["some_lore"],
            species: ["fox"],
          },
        }),
      ],
      "fav",
    );
    expect([...acc.tags.keys()].sort()).toEqual(["artist_a", "fox", "solo"]);
    expect(acc.favCount).toBe(1);
  });

  it("weights rare tags above common ones (idf)", () => {
    const acc = createTasteAccumulator();
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost(i, { tags: { general: ["solo", "niche_theme"] } }),
    );
    addToTaste(acc, posts, "fav");
    const p = finalizeTaste(acc, [info("solo", 3_000_000), info("niche_theme", 800)], META);
    expect(p.tags[0].name).toBe("niche_theme");
    expect(p.tags[0].weight).toBeGreaterThan(p.tags[1].weight);
  });

  it("drops one-off tags in a sizeable sample", () => {
    const acc = createTasteAccumulator();
    const posts = Array.from({ length: 25 }, (_, i) =>
      makePost(i, { tags: { artist: i === 0 ? ["one_off"] : ["regular"] } }),
    );
    addToTaste(acc, posts, "fav");
    const names = finalizeTaste(acc, [], META).tags.map((t) => t.name);
    expect(names).toContain("regular");
    expect(names).not.toContain("one_off");
  });

  it("damps general tags relative to artists with the same counts", () => {
    const acc = createTasteAccumulator();
    addToTaste(
      acc,
      [1, 2, 3].map((i) => makePost(i, { tags: { artist: ["art"], general: ["gen"] } })),
      "fav",
    );
    const p = finalizeTaste(acc, [info("art", 5000), info("gen", 5000)], META);
    const w = Object.fromEntries(p.tags.map((t) => [t.name, t.weight]));
    expect(w.art).toBeGreaterThan(w.gen);
  });

  it("upvotes count half a favourite; downvote-dominated tags become avoid tags", () => {
    const acc = createTasteAccumulator();
    addToTaste(acc, [makePost(1, { tags: { general: ["liked"] } })], "fav");
    addToTaste(acc, [makePost(2, { tags: { general: ["liked"] } })], "up");
    expect(acc.tags.get("liked")!.pos).toBe(1.5);
    addToTaste(
      acc,
      [3, 4, 5].map((i) => makePost(i, { tags: { general: ["disliked"] } })),
      "down",
    );
    const p = finalizeTaste(acc, [], META);
    expect(p.avoid).toEqual(["disliked"]);
    expect(p.tags.map((t) => t.name)).not.toContain("disliked");
    expect(p.sampled).toBe(1);
  });

  it("looks up the most frequent positive tags only", () => {
    const acc = createTasteAccumulator();
    addToTaste(acc, [makePost(1, { tags: { general: ["a", "b"] } })], "fav");
    addToTaste(acc, [makePost(2, { tags: { general: ["b"] } })], "fav");
    addToTaste(acc, [makePost(3, { tags: { general: ["bad"] } })], "down");
    expect(tagNamesForLookup(acc, 1)).toEqual(["b"]);
    expect(tagNamesForLookup(acc)).not.toContain("bad");
  });

  it("progressive words favour specific categories over general ones", () => {
    const acc = createTasteAccumulator();
    addToTaste(
      acc,
      [1, 2].map((i) => makePost(i, { tags: { character: ["hero"], general: ["solo"] } })),
      "fav",
    );
    expect(progressiveWords(acc, 2).map((w) => w.name)).toEqual(["hero", "solo"]);
  });
});
