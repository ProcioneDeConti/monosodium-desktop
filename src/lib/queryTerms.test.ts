import { describe, expect, it } from "vitest";
import { queryTerms } from "./queryTerms";

describe("queryTerms", () => {
  it("keeps searched tags and drops excluded ones", () => {
    expect(queryTerms("Fox -female solo")).toEqual(["fox", "solo"]);
    expect(queryTerms("-female")).toEqual([]);
  });

  it("drops metatags and blanks", () => {
    expect(queryTerms("  fox order:score -rating:e  ")).toEqual(["fox"]);
    expect(queryTerms("")).toEqual([]);
  });

  it("strips the or prefix", () => {
    expect(queryTerms("~fox ~wolf fox ~ cat")).toEqual(["fox", "wolf", "fox", "cat"]);
  });

  it("handles groups, including excluded and nested ones", () => {
    expect(queryTerms("( fox ~ wolf ) solo")).toEqual(["fox", "wolf", "solo"]);
    expect(queryTerms("a -( b ( c ) d ) e")).toEqual(["a", "e"]);
  });

  it("leaves parentheses and hyphens inside tags alone", () => {
    expect(queryTerms("krystal_(star_fox) half-dragon")).toEqual(["krystal_(star_fox)", "half-dragon"]);
  });
});
