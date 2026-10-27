import { describe, expect, it } from "vitest";
import {
  CAMEO_COOLDOWN_MS,
  crossedMilestone,
  holidayFor,
  launchGreeting,
  petReaction,
  queryReaction,
  isLateNight,
  pickLine,
  REACTIONS,
  SPEECH_GAP_MS,
  shouldPlay,
} from "./mascot";

describe("shouldPlay", () => {
  it("never plays when off", () => {
    expect(shouldPlay("milestone", "off", 0, {}, null)).toBe(false);
  });

  it("skips minor reactions in cameo mode", () => {
    expect(shouldPlay("favorite", "cameos", 0, {}, null)).toBe(false);
    expect(shouldPlay("favorite", "companion", 0, {}, null)).toBe(true);
  });

  it("respects per-kind cooldown, stretched to the cameo minimum", () => {
    const fav = REACTIONS.favorite.cooldownMs;
    expect(shouldPlay("favorite", "companion", fav - 1, { favorite: 0 }, null)).toBe(false);
    expect(shouldPlay("favorite", "companion", fav, { favorite: 0 }, null)).toBe(true);
    expect(shouldPlay("emptySearch", "cameos", CAMEO_COOLDOWN_MS - 1, { emptySearch: 0 }, null)).toBe(false);
  });

  it("only interrupts a playing reaction with a higher priority", () => {
    const playing = { kind: "emptySearch" as const, startedAt: 0 };
    expect(shouldPlay("favorite", "companion", 100, {}, playing)).toBe(false);
    expect(shouldPlay("dmail", "companion", 100, {}, playing)).toBe(true);
    // Once it's finished, anything goes.
    expect(shouldPlay("favorite", "companion", REACTIONS.emptySearch.durationMs, {}, playing)).toBe(true);
  });
});

describe("pickLine", () => {
  it("stays quiet when speech is off, for minor kinds, or inside the gap", () => {
    expect(pickLine("endOfResults", "never", 0, null, 0)).toBeNull();
    expect(pickLine("favorite", "sometimes", 0, null, 0)).toBeNull();
    expect(pickLine("endOfResults", "sometimes", SPEECH_GAP_MS - 1, 0, 0)).toBeNull();
  });

  it("talks only on the lucky half, and picks from the kind's lines", () => {
    expect(pickLine("endOfResults", "sometimes", 0, null, 0.9)).toBeNull();
    expect(REACTIONS.endOfResults.lines).toContain(pickLine("endOfResults", "sometimes", 0, null, 0.1));
  });

  it('"always" talks every time, ignoring the gap and the roll', () => {
    expect(pickLine("endOfResults", "always", SPEECH_GAP_MS - 1, 0, 0.99)).not.toBeNull();
    expect(pickLine("favorite", "always", 0, null, 0)).toBeNull(); // no lines to say
  });

  it("milestones always talk and fill in the count", () => {
    expect(pickLine("milestone", "sometimes", 0, null, 0.99, { count: "1,000" })).toContain("1,000");
  });
});

describe("crossedMilestone", () => {
  it("returns the highest milestone crossed, or null", () => {
    expect(crossedMilestone(99, 100)).toBe(100);
    expect(crossedMilestone(240, 600)).toBe(500);
    expect(crossedMilestone(100, 101)).toBeNull();
  });
});

describe("isLateNight", () => {
  it("is midnight to 5am", () => {
    expect(isLateNight(new Date(2026, 0, 1, 0, 30))).toBe(true);
    expect(isLateNight(new Date(2026, 0, 1, 5, 0))).toBe(false);
    expect(isLateNight(new Date(2026, 0, 1, 23, 59))).toBe(false);
  });
});

describe("holidayFor", () => {
  it("greets on known dates only", () => {
    expect(holidayFor(new Date(2026, 9, 31))?.emoji).toBe("🎃");
    expect(holidayFor(new Date(2026, 6, 1))?.greeting).toMatch(/Raccoon/);
    expect(holidayFor(new Date(2026, 9, 27))).toBeNull();
  });
});

describe("queryReaction", () => {
  it("prefers species, then own favs, ordering, then length", () => {
    expect(queryReaction("raccoon order:score", null)).toBe("selfie");
    expect(queryReaction("~domestic_cat solo", null)).toBe("hiss");
    expect(queryReaction("fav:Alpha", "alpha")).toBe("ownFavs");
    expect(queryReaction("wolf order:random", null)).toBe("dice");
    expect(queryReaction("wolf order:id", null)).toBe("archive");
    expect(queryReaction("a b c d e f g h", null)).toBe("longQuery");
    expect(queryReaction("wolf", null)).toBeNull();
  });
});

describe("petReaction", () => {
  it("escalates from pet to flustered to annoyed", () => {
    expect(petReaction([0], 0)).toBe("pet");
    expect(petReaction([0, 100, 200, 300, 400], 500)).toBe("flustered");
    expect(petReaction(Array.from({ length: 15 }, (_, i) => i * 500), 7500)).toBe("annoyed");
  });
});

describe("launchGreeting", () => {
  const at = (h: number, day = 27, month = 9) => new Date(2026, month, day, h);
  it("picks the most special greeting", () => {
    expect(launchGreeting(new Date(2026, 1, 5, 9), null)?.vars?.emoji).toBe("🎂");
    expect(launchGreeting(at(14), at(14).getTime() - 8 * 24 * 3600_000)?.kind).toBe("missedYou");
    expect(launchGreeting(at(2), null)?.kind).toBe("yawn");
    expect(launchGreeting(at(8), null)?.kind).toBe("morning");
    expect(launchGreeting(at(14, 31 - 6), null)?.kind).toBe("weekend"); // Sun 25 Oct 2026
    expect(launchGreeting(at(14), null)).toBeNull(); // Tue afternoon
  });
});
