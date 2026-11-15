import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import type { Post } from "../models/post";
import {
  analyzedLine,
  busiestMonth,
  FavedYearScanner,
  monthCounts,
  uploadedYearTags,
  wrappedTitle,
} from "./yearInReview";

/** A post uploaded at local-time `y-m-d` (month 1-based). */
function up(id: number, y: number, m = 6, d = 15): Post {
  return { ...makePost(id), created_at: new Date(y, m - 1, d, 12).toISOString() };
}

describe("FavedYearScanner", () => {
  it("confirms everything up to the oldest-favourited post uploaded this year", () => {
    const s = new FavedYearScanner(2026, 100);
    // Newest favourite first: [2026 post, old, old, 2026 post, old, old]
    const out = s.feed([up(1, 2026), up(2, 2019), up(3, 2015), up(4, 2026, 1, 2), up(5, 2020), up(6, 2010)]);
    expect(out.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(s.confirmed).toBe(4);
  });

  it("carries unconfirmed posts across pages until a later this-year upload confirms them", () => {
    const s = new FavedYearScanner(2026, 100);
    expect(s.feed([up(1, 2026), up(2, 2018)]).map((p) => p.id)).toEqual([1]);
    expect(s.feed([up(3, 2017), up(4, 2026)]).map((p) => p.id)).toEqual([2, 3, 4]);
  });

  it("treats Jan 1 local midnight as the start, and Dec 31 of last year as before it", () => {
    const s = new FavedYearScanner(2026, 100);
    expect(s.feed([up(1, 2025, 12, 31)])).toEqual([]);
    expect(s.feed([{ ...makePost(2), created_at: new Date(2026, 0, 1).toISOString() }]).map((p) => p.id)).toEqual([1, 2]);
  });

  it("reports exhausted after a long run without a this-year upload", () => {
    const s = new FavedYearScanner(2026, 3);
    s.feed([up(1, 2026), up(2, 2001), up(3, 2002)]);
    expect(s.exhausted).toBe(false);
    s.feed([up(4, 2003)]);
    expect(s.exhausted).toBe(true);
  });
});

describe("months", () => {
  it("counts only the given year, by local month", () => {
    const counts = monthCounts([up(1, 2026, 3), up(2, 2026, 3), up(3, 2026, 11), up(4, 2025, 3)], 2026);
    expect(counts[2]).toBe(2);
    expect(counts[10]).toBe(1);
    expect(counts.reduce((a, b) => a + b)).toBe(3);
    expect(busiestMonth(counts)).toBe("March");
    expect(busiestMonth(new Array(12).fill(0))).toBeNull();
  });
});

describe("labels", () => {
  it("formats titles, lines, and the upload-year search", () => {
    expect(wrappedTitle(null)).toBe("Favorites, wrapped");
    expect(wrappedTitle({ year: 2026, mode: "faved" })).toBe("2026, wrapped");
    expect(analyzedLine(12, { year: 2026, mode: "faved" })).toBe("at least 12 faved in 2026");
    expect(analyzedLine(12, { year: 2024, mode: "uploaded" })).toBe("12 favorites from 2024");
    expect(uploadedYearTags("bob", 2024, true)).toBe("fav:bob date:2024-01-01..2024-12-31 status:any");
  });
});
