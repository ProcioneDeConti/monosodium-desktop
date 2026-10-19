import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import {
  buildChoices,
  dailySixDegrees,
  favoriteEndpoints,
  gameImageUrl,
  leafSpecies,
  pickSixDegrees,
  realArtists,
  sixDegreesCandidates,
  wikiSummary,
  speedPoints,
  zoomPoints,
  ZOOM_LEVELS,
} from "./games";
import { seededRandom, type PoolTag } from "./tagdle";

describe("buildChoices", () => {
  it("includes the answer once and never an excluded tag", () => {
    const choices = buildChoices("fox", ["fox", "wolf", "cat", "dog", "bat"], new Set(["wolf"]), 4, seededRandom(1));
    expect(choices).toHaveLength(4);
    expect(choices.filter((c) => c === "fox")).toHaveLength(1);
    expect(choices).not.toContain("wolf");
  });

  it("returns fewer choices when the bank runs short", () => {
    expect(buildChoices("a", ["a", "b"], new Set())).toHaveLength(2);
  });
});

describe("speedPoints / zoomPoints", () => {
  it("scales from 100 down to 10", () => {
    expect(speedPoints(0, 1000)).toBe(100);
    expect(speedPoints(1000, 1000)).toBe(10);
    expect(speedPoints(5000, 1000)).toBe(10);
  });

  it("gives one fewer zoom point per level, 1 at the last", () => {
    expect(zoomPoints(0)).toBe(ZOOM_LEVELS.length);
    expect(zoomPoints(ZOOM_LEVELS.length - 1)).toBe(1);
  });
});

describe("post helpers", () => {
  it("drops non-artist bookkeeping tags", () => {
    const post = makePost(1, { tags: { artist: ["conditional_dnp", "someone"] } });
    expect(realArtists(post)).toEqual(["someone"]);
  });

  it("only gives an image url for still images", () => {
    const post = makePost(2);
    post.file.ext = "webm";
    expect(gameImageUrl(post)).toBeNull();
  });
});

describe("six degrees", () => {
  const pool: PoolTag[] = [
    { name: "wolf", post_count: 90000, category: 5 },
    { name: "fox", post_count: 80000, category: 5 },
    { name: "pokemon", post_count: 70000, category: 3 },
    { name: "nick_wilde", post_count: 9000, category: 4 },
    { name: "tiny_tag", post_count: 10, category: 5 },
    { name: "solo", post_count: 900000, category: 0 },
  ];

  it("keeps only big species/copyright tags", () => {
    expect(sixDegreesCandidates(pool).map((t) => t.name).sort()).toEqual(["fox", "pokemon", "wolf"]);
  });

  it("picks distinct endpoints, preferring different categories", () => {
    const puzzle = pickSixDegrees(sixDegreesCandidates(pool), seededRandom(3))!;
    expect(puzzle.start).not.toBe(puzzle.target);
  });

  it("is deterministic per site and day", () => {
    const c = sixDegreesCandidates(pool);
    expect(dailySixDegrees(c, "e621", "2026-10-18")).toEqual(dailySixDegrees(c, "e621", "2026-10-18"));
  });
});

describe("leafSpecies", () => {
  it("drops implied (grouping) tags and small tags", () => {
    const pool: PoolTag[] = [
      { name: "fox", post_count: 50000, category: 5 },
      { name: "canine", post_count: 90000, category: 5 },
      { name: "mammal", post_count: 900000, category: 5 },
      { name: "rare_beast", post_count: 20, category: 5 },
    ];
    const implications = [
      { antecedent_name: "fox", consequent_name: "canine" },
      { antecedent_name: "canine", consequent_name: "mammal" },
    ];
    expect(leafSpecies(pool, implications)).toEqual(["fox"]);
  });
});

describe("wikiSummary", () => {
  it("skips headings/lists and strips DText markup", () => {
    const body =
      'h4. About\n\n[b]Lifewonders[/b] is a Japanese [[game_developer|studio]] known for "Tokyo Afterschool Summoners":https://example.com and [[bara]].\n* list item';
    expect(wikiSummary(body)).toBe("Lifewonders is a Japanese studio known for Tokyo Afterschool Summoners and bara.");
  });

  it("truncates long prose and returns empty without any", () => {
    expect(wikiSummary("x".repeat(500), 20)).toHaveLength(20);
    expect(wikiSummary("h1. Only a heading")).toBe("");
  });
});

describe("favoriteEndpoints", () => {
  it("counts species/copyright tags across favorites and keeps the common ones", () => {
    const posts = [
      makePost(1, { tags: { species: ["fox"], copyright: ["pokemon"] } }),
      makePost(2, { tags: { species: ["fox", "wolf"], copyright: ["pokemon"] } }),
      makePost(3, { tags: { species: ["fox"], general: ["solo"] } }),
    ];
    expect(favoriteEndpoints(posts, 2)).toEqual([
      { name: "fox", post_count: 3, category: 5 },
      { name: "pokemon", post_count: 2, category: 3 },
    ]);
  });
});
