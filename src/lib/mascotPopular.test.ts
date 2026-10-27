import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import { popularFacts, popularRemarks, spicyPopularRemarks } from "./mascotPopular";

describe("popularFacts", () => {
  const posts = [
    makePost(1, { rating: "e", tags: { artist: ["wolfy", "conditional_dnp"], species: ["canine"], general: ["solo", "beach"] } }),
    makePost(2, { rating: "e", tags: { artist: ["wolfy"], species: ["canine"], general: ["beach"] } }),
    makePost(3, { rating: "s", tags: { artist: ["other"], species: ["procyonid"] } }),
  ];

  it("ranks artists, species and themes, skipping non-artist and generic tags", () => {
    const f = popularFacts(posts, "day", true, "Today");
    expect(f.topArtist).toBe("wolfy");
    expect(f.dominantArtist).toEqual({ tag: "wolfy", posts: 2 });
    expect(f.topSpecies).toBe("canine");
    expect(f.topGeneral).toEqual(["beach"]);
    expect(f.explicitShare).toBeCloseTo(2 / 3);
  });

  it("always has something to say, including for an empty list", () => {
    const f = popularFacts(posts, "week", false, "Oct 1 – 7");
    expect(popularRemarks(f).length).toBeGreaterThan(3);
    expect(spicyPopularRemarks(f).length).toBeGreaterThan(3);
    expect(popularRemarks(popularFacts([], "day", true, "Today")).length).toBeGreaterThan(0);
  });
});
