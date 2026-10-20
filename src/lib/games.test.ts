import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import {
  bingoCandidates,
  bingoCard,
  bingoDeckTags,
  bingoFits,
  bingoLine,
  bingoWin,
  buildChoices,
  dailyBingoCard,
  oddOneOutCandidates,
  oddOneOutFromPosts,
  uploadYear,
  yearPoints,
  yearRangeTag,
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

const withGeneral = (id: number, general: string[]) => makePost(id, { tags: { general } });

describe("oddOneOutCandidates", () => {
  it("keeps general tags only, dropping the biggest", () => {
    const pool: PoolTag[] = [
      { name: "solo", post_count: 900, category: 0 },
      { name: "rain", post_count: 50, category: 0 },
      { name: "fox", post_count: 60, category: 5 },
      { name: "hat", post_count: 40, category: 0 },
    ];
    expect(oddOneOutCandidates(pool, 1)).toEqual(["rain", "hat"]);
  });
});

describe("oddOneOutFromPosts", () => {
  it("builds three sharing posts plus one without the tag", () => {
    const posts = [
      withGeneral(1, ["rain"]),
      withGeneral(2, ["rain"]),
      withGeneral(3, ["rain", "hat"]),
      withGeneral(4, ["hat"]),
    ];
    const round = oddOneOutFromPosts(posts, new Set(["rain", "hat"]), new Set(), seededRandom(3))!;
    expect(round.tag).toBe("rain");
    expect(round.posts).toHaveLength(4);
    round.posts.forEach((p, i) => expect(p.tags.general.includes("rain")).toBe(i !== round.odd));
  });

  it("returns null when no tag fits or posts are used up", () => {
    const posts = [withGeneral(1, ["rain"]), withGeneral(2, ["rain"]), withGeneral(3, ["rain"]), withGeneral(4, [])];
    expect(oddOneOutFromPosts(posts, new Set(["hat"]), new Set())).toBeNull();
    expect(oddOneOutFromPosts(posts, new Set(["rain"]), new Set([4]))).toBeNull();
  });
});

describe("year guesser", () => {
  it("scores 25 less per year off", () => {
    expect(yearPoints(2015, 2015)).toBe(100);
    expect(yearPoints(2013, 2015)).toBe(50);
    expect(yearPoints(2009, 2015)).toBe(0);
  });

  it("reads the UTC upload year and builds the date range", () => {
    expect(uploadYear({ ...makePost(1), created_at: "2016-12-31T23:30:00-05:00" })).toBe(2017);
    expect(uploadYear({ ...makePost(1), created_at: null })).toBeNull();
    expect(yearRangeTag(2012)).toBe("date:2012-01-01..2012-12-31");
  });
});

describe("tag bingo", () => {
  const names = Array.from({ length: 40 }, (_, i) => `t${i}`);

  it("detects rows, columns and diagonals only", () => {
    const marked = Array(9).fill(false);
    expect(bingoLine(marked)).toBeNull();
    expect(bingoLine(marked.map((_, i) => [2, 4, 6].includes(i)))).toEqual([2, 4, 6]);
    expect(bingoLine(marked.map((_, i) => [1, 4, 7].includes(i)))).toEqual([1, 4, 7]);
    expect(bingoLine(marked.map((_, i) => [0, 1, 5].includes(i)))).toBeNull();
  });

  it("blackout needs every square", () => {
    const allButOne = Array(9).fill(true).map((_, i) => i !== 8);
    expect(bingoWin(allButOne, false)).toEqual([0, 1, 2]);
    expect(bingoWin(allButOne, true)).toBeNull();
    expect(bingoWin(Array(9).fill(true), true)).toHaveLength(9);
  });

  it("deals nine distinct tags, no free square", () => {
    const card = bingoCard(names, seededRandom(5))!;
    expect(card).toHaveLength(9);
    expect(new Set(card).size).toBe(9);
    expect(bingoCard(names.slice(0, 5), seededRandom(5))).toBeNull();
  });

  it("deals the same daily card for the same day and site", () => {
    expect(dailyBingoCard(names, "e621", "2026-10-19")).toEqual(dailyBingoCard([...names].reverse(), "e621", "2026-10-19"));
    expect(dailyBingoCard(names, "e621", "2026-10-19")).not.toEqual(dailyBingoCard(names, "e621", "2026-10-20"));
  });

  it("skips the biggest general/species tags", () => {
    const pool: PoolTag[] = [
      { name: "mammal", post_count: 100, category: 5 },
      { name: "rain", post_count: 50, category: 0 },
      { name: "nintendo", post_count: 70, category: 3 },
    ];
    expect(bingoCandidates(pool, 1)).toEqual(["rain"]);
  });

  it("drops tags you can't see in the picture", () => {
    const pool: PoolTag[] = ["simple_background", "english_text", "5_fingers", "digital_media_(artwork)", "absurd_res", "hat"].map(
      (name) => ({ name, post_count: 10, category: 0 }),
    );
    expect(bingoCandidates(pool, 0)).toEqual(["hat"]);
  });

  it("finds the squares a post fits and ORs the open ones", () => {
    const card = ["hat", "fox", "rain", "a", "b", "c", "d", "e", "f"];
    const post = makePost(1, { tags: { general: ["rain", "hat"], species: ["fox"] } });
    expect(bingoFits(card, post)).toEqual([0, 1, 2]);
    expect(bingoDeckTags(card, [0, 2])).toBe("~hat ~rain");
  });
});
