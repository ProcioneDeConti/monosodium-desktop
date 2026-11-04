import { describe, expect, it } from "vitest";
import { REACTIONS } from "./mascot";
import { EXTRA_LINES } from "./mascotExtraLines";
import { forYouPhaseRemarks, forYouWallRemarks, type WallEventKind } from "./mascotForYou";

const GENDERED = /\b(he|she|him|her|his|hers|himself|herself)\b/i;

describe("extra Gus lines", () => {
  it("are merged into their reactions, with no duplicates", () => {
    for (const [kind, extra] of Object.entries(EXTRA_LINES)) {
      const lines = REACTIONS[kind as keyof typeof REACTIONS].lines;
      for (const l of extra!) expect(lines).toContain(l);
      expect(new Set(lines).size).toBe(lines.length);
    }
  });

  it("only use placeholders their reaction already uses", () => {
    for (const [kind, extra] of Object.entries(EXTRA_LINES)) {
      const original = REACTIONS[kind as keyof typeof REACTIONS].lines.join(" ");
      for (const l of extra!) {
        for (const [, name] of l.matchAll(/\{(\w+)\}/g)) expect(original).toContain(`{${name}}`);
        expect(l.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("For you wall commentary", () => {
  const kinds: WallEventKind[] = ["first", "big", "vertical", "avatarBump", "raccoon", "count", "topCourse"];

  it("has lines for every wall event, for you and for others, with no guessed pronouns", () => {
    for (const isSelf of [true, false]) {
      for (const type of kinds) {
        for (const count of [12, 25, 38]) {
          const lines = forYouWallRemarks({ type, word: "big_artist_(series)", count }, isSelf, "Someone_Else");
          expect(lines.length).toBeGreaterThanOrEqual(3);
          for (const l of lines) {
            expect(l).not.toMatch(/undefined|null|NaN|\$\{/);
            if (!isSelf) expect(l).not.toMatch(GENDERED);
            if (isSelf) expect(l).not.toContain("Someone_Else");
          }
        }
      }
      for (const phase of ["waiting", "gathering"] as const) {
        for (const l of forYouPhaseRemarks(phase, isSelf, "Someone_Else")) {
          if (!isSelf) expect(l).not.toMatch(GENDERED);
          expect(l).not.toMatch(/undefined|null/);
        }
      }
    }
  });

  it("names the brick in its remark", () => {
    const lines = forYouWallRemarks({ type: "big", word: "big_artist_(series)" }, true, "x");
    expect(lines.every((l) => l.includes("Big artist"))).toBe(true);
  });
});

import { SPICY_LINES } from "./mascotSpicy";
import { SPICY_EXTRA } from "./mascotSpicyExtra";
import {
  forYouFacts,
  spicyForYouBuildingRemarks,
  spicyForYouPhaseRemarks,
  spicyForYouRemarks,
  spicyForYouWallRemarks,
} from "./mascotForYou";
import { makePost } from "../test/makePost";

describe("extra cheeky lines", () => {
  it("are merged into the cheeky pools, with no duplicates and only known placeholders", () => {
    for (const [kind, extra] of Object.entries(SPICY_EXTRA)) {
      const pool = SPICY_LINES[kind as keyof typeof SPICY_LINES]!;
      for (const l of extra!) expect(pool).toContain(l);
      expect(new Set(pool).size).toBe(pool.length);
      const regular = REACTIONS[kind as keyof typeof REACTIONS].lines.join(" ");
      for (const l of extra!) for (const [, name] of l.matchAll(/\{(\w+)\}/g)) expect(regular).toContain(`{${name}}`);
    }
  });

  it("give every regular-talking reaction a cheeky pool of a few lines", () => {
    for (const [kind, def] of Object.entries(REACTIONS)) {
      if (def.lines.length === 0 || def.lines.every((l) => l.includes("{line}") || l.includes("{greeting}"))) continue;
      if (["intro", "eggSpotted", "eggClosed", "eggClose"].includes(kind)) continue;
      expect(SPICY_LINES[kind as keyof typeof SPICY_LINES]?.length ?? 0, kind).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("For you cheeky commentary", () => {
  const kinds: WallEventKind[] = ["first", "big", "vertical", "avatarBump", "raccoon", "count", "topCourse"];
  const profile = {
    site: "e621" as const,
    user: { id: 1, name: "Someone_Else", avatarId: null },
    mode: "all" as const,
    sampled: 1500,
    usedVotes: true,
    builtAt: 0,
    tags: [
      { name: "great_artist", category: "artist" as const, weight: 2 },
      { name: "second_artist", category: "artist" as const, weight: 1 },
      { name: "series", category: "copyright" as const, weight: 1 },
      { name: "raccoon", category: "species" as const, weight: 1 },
    ],
    avoid: ["x"],
  };
  const posts = Array.from({ length: 120 }, (_, i) => makePost(i + 1, { tags: { artist: [`new_${i % 5}`] }, rating: "s" }));

  it("has lots to say in every cheeky pool, with no guessed pronouns for others", () => {
    for (const isSelf of [true, false]) {
      const f = forYouFacts(profile, posts, isSelf, true);
      const pools = [
        spicyForYouRemarks(f),
        spicyForYouBuildingRemarks(isSelf, "Someone_Else", "all"),
        spicyForYouBuildingRemarks(isSelf, "Someone_Else", "recent"),
        spicyForYouPhaseRemarks("waiting", isSelf, "Someone_Else"),
        spicyForYouPhaseRemarks("gathering", isSelf, "Someone_Else"),
        ...kinds.flatMap((type) => [12, 25, 38].map((count) => spicyForYouWallRemarks({ type, word: "big_artist", count }, isSelf, "Someone_Else"))),
      ];
      expect(pools[0].length).toBeGreaterThanOrEqual(20);
      expect(pools[1].length).toBeGreaterThanOrEqual(10);
      for (const pool of pools) {
        expect(pool.length).toBeGreaterThanOrEqual(3);
        for (const l of pool) {
          expect(l).not.toMatch(/undefined|null|NaN|\$\{/);
          if (!isSelf) expect(l).not.toMatch(GENDERED);
          if (isSelf) expect(l).not.toContain("Someone_Else");
        }
      }
    }
  });
});
