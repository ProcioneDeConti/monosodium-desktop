import { describe, expect, it } from "vitest";
import { pickLine } from "./mascot";
import { SPICY_LINES, spicyAllowed, spicyDashboardRemarks } from "./mascotSpicy";

describe("spicyAllowed", () => {
  const on = { adultModeEnabled: true, enabledRatings: ["s", "q", "e"], mascotSpicy: true };
  it("needs adult mode, Explicit and the cheeky toggle", () => {
    expect(spicyAllowed(on)).toBe(true);
    expect(spicyAllowed({ ...on, adultModeEnabled: false })).toBe(false);
    expect(spicyAllowed({ ...on, enabledRatings: ["s", "q"] })).toBe(false);
    expect(spicyAllowed({ ...on, mascotSpicy: false })).toBe(false);
  });
});

describe("pickLine with spicy", () => {
  it("draws from the cheeky pool only when asked", () => {
    const spicy = pickLine("endOfResults", "sometimes", 0, null, 0.1, {}, true);
    const tame = pickLine("endOfResults", "sometimes", 0, null, 0.1, {}, false);
    expect(SPICY_LINES.endOfResults).toContain(spicy);
    expect(SPICY_LINES.endOfResults).not.toContain(tame);
  });

  it("falls back to regular lines for kinds without a spicy pool", () => {
    expect(pickLine("dashComment", "sometimes", 0, null, 0, { line: "hi" }, true)).toBe("hi");
  });
});

describe("spicyDashboardRemarks", () => {
  it("always has something cheeky to say", () => {
    const remarks = spicyDashboardRemarks({
      activeMs: 0, sessions: 1, longestSessionMs: 0, postsViewed: 5, uniquePostsViewed: 5, searches: 1,
      favoritesAdded: 0, favoritesRemoved: 0, votesUp: 0, votesDown: 0, downloads: 0, apiCalls: 0,
      dataBytes: 0, slideshowMs: 0, e621Viewed: 5, e6aiViewed: 0, daysUsing: 1, activeDays: 1,
      streakDays: 0, postsToday: 0, busiestDay: null, topSearched: [], topArtists: [], topCharacters: [],
    });
    expect(remarks.length).toBeGreaterThan(1);
  });
});
