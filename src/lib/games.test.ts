import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import {
  BINGO_MISS_PENALTY,
  bingoCandidates,
  bingoCard,
  bingoFamily,
  bingoMissPenalty,
  bingoDeckTags,
  bingoFits,
  bingoLine,
  bingoWin,
  buildChoices,
  dailyBingoCard,
  oddOneOutCandidates,
  oddOneOutFromPosts,
  oddRelatedTags,
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
  currentStreak,
  launcherBest,
  longestStreak,
  runGrade,
  runShareText,
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
  it("holds 100 through the grace period, then eases down to 50", () => {
    expect(speedPoints(0, 10_000)).toBe(100);
    expect(speedPoints(1500, 10_000)).toBe(100);
    expect(speedPoints(4800, 10_000)).toBe(92);
    expect(speedPoints(10_000, 10_000)).toBe(50);
    expect(speedPoints(50_000, 10_000)).toBe(50);
  });

  it("gives one fewer zoom point per level, 1 at the last", () => {
    expect(zoomPoints(0)).toBe(ZOOM_LEVELS.length);
    expect(zoomPoints(ZOOM_LEVELS.length - 1)).toBe(1);
  });
});

describe("run summaries", () => {
  it("counts streaks of fully-right rounds only", () => {
    const r = [1, 1, 0, 1, 1, 1, 0.5, 1];
    expect(longestStreak(r)).toBe(3);
    expect(currentStreak(r)).toBe(1);
    expect(currentStreak([1, 0])).toBe(0);
  });

  it("grades by share of the max", () => {
    expect(runGrade(10, 10).letter).toBe("S");
    expect(runGrade(8, 10).letter).toBe("A");
    expect(runGrade(565, 1000).letter).toBe("C");
    expect(runGrade(0, 10).letter).toBe("F");
  });

  it("formats share text in rows of five", () => {
    expect(runShareText("Whodunnit", "e621", 8, 10, "correct", [1, 1, 0, 1, 1, 1, 1, 1, 0, 1])).toBe(
      "🎮 Whodunnit · e621\n8/10 correct · Grade A\n🟩🟩🟥🟩🟩\n🟩🟩🟩🟥🟩\n🔥 Best streak: 5",
    );
    expect(runShareText("Time Machine", "e6AI", 250, 300, "pts", [1, 0.5, 1])).toBe(
      "🎮 Time Machine · e6AI\n250/300 pts · Grade A\n🟩🟨🟩",
    );
  });
});

describe("launcherBest", () => {
  const best = {
    "artist:easy:e621": 6,
    "artist:hard:e621": 8,
    "artist:fav:e621": 10,
    "artist:easy:e6ai": 9,
    "rating:e621:sqe": 7,
    "sixDegrees:e621": 4,
    "sixDegrees:fav:e621": 1,
    "bingo2:line:random:e621": 12,
    "bingo2:line:daily:2026-11-08:e621": 5,
    "zoom:e621": 0,
  };

  it("takes the best across modes for the site, skipping favorites runs", () => {
    expect(launcherBest("artist", best, "e621")).toBe("Best 8/10");
    expect(launcherBest("artist", best, "e6ai")).toBe("Best 9/10");
    expect(launcherBest("rating", best, "e621")).toBe("Best 7/10");
  });

  it("handles lower-is-better games and their mode filters", () => {
    expect(launcherBest("sixDegrees", best, "e621")).toBe("Best 4 hops");
    expect(launcherBest("bingo", best, "e621")).toBe("Best line in 12 posts");
  });

  it("is null when unplayed, scoreless, or not a scored game", () => {
    expect(launcherBest("species", best, "e621")).toBeNull();
    expect(launcherBest("zoom", best, "e621")).toBeNull();
    expect(launcherBest("gusPet", best, "e621")).toBeNull();
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

  it("drops tags you can't judge from the picture", () => {
    const pool: PoolTag[] = [
      { name: "text", post_count: 90, category: 0 },
      { name: "teeth", post_count: 80, category: 0 },
      { name: "young_anthro", post_count: 70, category: 0 },
      { name: "hat", post_count: 40, category: 0 },
    ];
    expect(oddOneOutCandidates(pool, 0)).toEqual(["hat"]);
  });
});

describe("oddRelatedTags", () => {
  it("includes the tag's colour and explicit family", () => {
    expect(oddRelatedTags("white_fur", ["white_fur", "white_body", "black_fur"]).sort()).toEqual(["white_body", "white_fur"]);
    expect(oddRelatedTags("hat", [])).toEqual(expect.arrayContaining(["hat", "headwear"]));
    expect(oddRelatedTags("rain", ["hat"])).toEqual(["rain"]);
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

  it("never picks an odd post carrying a relative of the tag", () => {
    const posts = [
      withGeneral(1, ["white_fur"]),
      withGeneral(2, ["white_fur"]),
      withGeneral(3, ["white_fur"]),
      withGeneral(4, ["white_body"]),
    ];
    expect(oddOneOutFromPosts(posts, new Set(["white_fur", "white_body"]), new Set())).toBeNull();
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

  it("drops under-tagged details, jargon and judgement-call tags", () => {
    const pool: PoolTag[] = ["teeth", "felid", "topwear", "ambiguous_gender", "young", "young_anthro", "domestic_cat", "shirt"].map(
      (name) => ({ name, post_count: 10, category: 0 }),
    );
    expect(bingoCandidates(pool, 0)).toEqual(["domestic_cat", "shirt"]);
  });

  it("groups overlapping tags into families", () => {
    expect(bingoFamily("white_body")).toBe(bingoFamily("white_fur"));
    expect(bingoFamily("white_body")).not.toBe(bingoFamily("black_body"));
    expect(bingoFamily("feline")).toBe(bingoFamily("domestic_cat"));
    expect(bingoFamily("big_breasts")).toBe(bingoFamily("huge_breasts"));
    expect(bingoFamily("rain")).toBe("rain");
  });

  it("puts at most one tag per family on a card", () => {
    const pool = [...names, "feline", "domestic_cat", "white_body", "white_fur", "big_breasts", "huge_breasts"];
    for (let seed = 0; seed < 50; seed++) {
      const card = bingoCard(pool, seededRandom(seed))!;
      expect(new Set(card.map(bingoFamily)).size).toBe(9);
    }
    // Nine tags, but only eight families - not enough for a card.
    expect(bingoCard([...names.slice(0, 7), "white_body", "white_fur"], seededRandom(1))).toBeNull();
  });

  it("only charges the miss penalty when the post fit no open square", () => {
    expect(bingoMissPenalty([3])).toBe(0);
    expect(bingoMissPenalty([])).toBe(BINGO_MISS_PENALTY);
  });

  it("finds the squares a post fits and ORs the open ones", () => {
    const card = ["hat", "fox", "rain", "a", "b", "c", "d", "e", "f"];
    const post = makePost(1, { tags: { general: ["rain", "hat"], species: ["fox"] } });
    expect(bingoFits(card, post)).toEqual([0, 1, 2]);
    expect(bingoDeckTags(card, [0, 2])).toBe("~hat ~rain");
  });
});
