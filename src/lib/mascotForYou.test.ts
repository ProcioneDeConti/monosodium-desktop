import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import type { TasteProfile } from "./tasteProfile";
import {
  forYouBuildingRemarks,
  forYouEmptyRemarks,
  forYouFacts,
  forYouMoreRemarks,
  forYouRemarks,
  spicyForYouRemarks,
} from "./mascotForYou";

function profile(over: Partial<TasteProfile> = {}): TasteProfile {
  return {
    site: "e621",
    user: { id: 7, name: "Someone_Else", avatarId: null },
    mode: "all",
    sampled: 1500,
    usedVotes: true,
    builtAt: 0,
    tags: [
      { name: "great_artist", category: "artist", weight: 2 },
      { name: "other_artist", category: "artist", weight: 1.5 },
      { name: "hero_(series)", category: "character", weight: 1.2 },
      { name: "series", category: "copyright", weight: 1 },
      { name: "raccoon", category: "species", weight: 0.9 },
      { name: "solo", category: "general", weight: 0.5 },
      { name: "cozy", category: "general", weight: 0.4 },
      { name: "rain", category: "general", weight: 0.3 },
    ],
    avoid: ["gross_thing"],
    ...over,
  };
}

const posts = [
  ...Array.from({ length: 5 }, (_, i) => makePost(i + 1, { tags: { artist: [`newbie_${i % 3}`] }, rating: "s" })),
  makePost(9, { tags: { artist: ["great_artist"] }, rating: "e" }),
];

const GENDERED = /\b(he|she|him|her|his|hers|himself|herself)\b/i;

function allPools(isSelf: boolean): string[] {
  const p = profile();
  const f = forYouFacts(p, posts, isSelf, true);
  const name = p.user.name;
  return [
    ...forYouBuildingRemarks(isSelf, name, "recent"),
    ...forYouBuildingRemarks(isSelf, name, "all"),
    ...forYouRemarks(f),
    ...spicyForYouRemarks(f),
    ...forYouEmptyRemarks("private", isSelf, name),
    ...forYouEmptyRemarks("empty", isSelf, name),
    ...forYouEmptyRemarks("noResults", isSelf, name),
    ...forYouMoreRemarks(isSelf, name),
  ];
}

describe("mascotForYou", () => {
  it("builds facts from the profile and the suggestions", () => {
    const f = forYouFacts(profile(), posts, false, false);
    expect(f.topArtist).toBe("great_artist");
    expect(f.topCharacter).toBe("hero_(series)");
    expect(f.topSpecies).toBe("raccoon");
    expect(f.themes).toEqual(["cozy", "rain"]); // "solo" is too generic
    expect(f.newArtists).toBe(3);
    expect(f.raccoon).toBe(true);
    expect(f.safeShare).toBeCloseTo(5 / 6);
  });

  it("has plenty to say, for yourself and for others", () => {
    const f = (isSelf: boolean) => forYouFacts(profile(), posts, isSelf, false);
    expect(forYouRemarks(f(true)).length).toBeGreaterThanOrEqual(15);
    expect(forYouRemarks(f(false)).length).toBeGreaterThanOrEqual(15);
    expect(spicyForYouRemarks(f(false)).length).toBeGreaterThanOrEqual(8);
  });

  it("never guesses a pronoun for someone else, and always names them", () => {
    for (const line of allPools(false)) expect(line).not.toMatch(GENDERED);
    const aboutThem = [
      ...forYouBuildingRemarks(false, "Someone_Else", "all"),
      ...forYouEmptyRemarks("private", false, "Someone_Else"),
    ];
    for (const line of aboutThem) expect(line).toContain("Someone_Else");
  });

  it("talks to you as 'you' about your own profile, not by name", () => {
    for (const line of [...forYouBuildingRemarks(true, "Someone_Else", "all"), ...forYouRemarks(forYouFacts(profile(), posts, true, false))]) {
      expect(line).not.toContain("Someone_Else");
    }
  });

  it("only mentions votes when they were used", () => {
    const noVotes = forYouRemarks(forYouFacts(profile({ usedVotes: false }), posts, false, false));
    expect(noVotes.some((l) => /downvot|upvot/i.test(l))).toBe(false);
  });

  it("never renders a placeholder or a missing value", () => {
    for (const isSelf of [true, false]) {
      for (const line of allPools(isSelf)) {
        expect(line.trim().length).toBeGreaterThan(0);
        expect(line).not.toMatch(/undefined|null|NaN|\$\{/);
      }
    }
    // A thin profile still gets lines and nothing breaks.
    const thin = forYouFacts(profile({ tags: [], avoid: [], sampled: 3 }), [], true, false);
    expect(forYouRemarks(thin).length).toBeGreaterThan(5);
    for (const line of forYouRemarks(thin)) expect(line).not.toMatch(/undefined|null|NaN/);
  });
});
