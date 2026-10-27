import { describe, expect, it } from "vitest";
import { analysisRemark, dashboardRemarks, prettyTag, type DashboardFacts } from "./mascotDashboard";
import type { FavoritesAnalysis } from "./favoritesAnalysis";

const facts = (over: Partial<DashboardFacts> = {}): DashboardFacts => ({
  activeMs: 0, sessions: 1, longestSessionMs: 0, postsViewed: 10, uniquePostsViewed: 10, searches: 2,
  favoritesAdded: 0, favoritesRemoved: 0, votesUp: 0, votesDown: 0, downloads: 0, apiCalls: 0,
  dataBytes: 0, slideshowMs: 0, e621Viewed: 10, e6aiViewed: 0, daysUsing: 3, activeDays: 3,
  streakDays: 0, postsToday: 0, busiestDay: null, topSearched: [], topArtists: [], topCharacters: [],
  ...over,
});

describe("dashboardRemarks", () => {
  it("greets a brand-new user", () => {
    expect(dashboardRemarks(facts({ postsViewed: 0, searches: 0 })).length).toBeGreaterThan(1);
  });

  it("names tags nicely", () => {
    expect(prettyTag("weskers_(character)")).toBe("Weskers");
    expect(prettyTag("some_artist")).toBe("Some artist");
    expect(dashboardRemarks(facts({ topArtists: ["some_artist"] }))[0]).toContain("Some artist");
  });

  it("has plenty to say even for a quiet account", () => {
    expect(dashboardRemarks(facts()).length).toBeGreaterThanOrEqual(5);
  });

  it("calls out voting habits only with enough votes", () => {
    expect(dashboardRemarks(facts({ votesUp: 5 })).some((r) => r.includes("Generous"))).toBe(false);
    expect(dashboardRemarks(facts({ votesUp: 95, votesDown: 5 })).some((r) => r.includes("Generous"))).toBe(true);
    expect(dashboardRemarks(facts({ votesUp: 10, votesDown: 40 })).some((r) => r.includes("critic"))).toBe(true);
  });

  it("always has something to say", () => {
    expect(dashboardRemarks(facts()).length).toBeGreaterThan(0);
  });
});

describe("analysisRemark", () => {
  const analysis = (over: Partial<FavoritesAnalysis> = {}): FavoritesAnalysis => ({
    total: 100, deletedCount: 0, ratings: [], fileTypes: [], scoreBuckets: [], avgScore: 50,
    medianScore: 40, topArtists: [], topTags: [], byYear: [], highestScore: 900, ...over,
  });

  it("notices a wholesome collection, phrased per person", () => {
    const a = analysis({ ratings: [{ label: "Safe", count: 90 }] });
    expect(analysisRemark(a, true, "me")).toMatch(/^You keep/);
    expect(analysisRemark(a, false, "Bob")).toMatch(/^Bob keeps/);
  });

  it("falls back to the top artist", () => {
    expect(analysisRemark(analysis({ topArtists: [{ label: "an_artist", count: 9 }] }), false, "Bob")).toContain(
      "An artist tops Bob's",
    );
  });
});
