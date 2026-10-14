import { describe, expect, it } from "vitest";
import { correctSide, dailyPairs, filterPool, shareText, utcDayKey, type PoolTag } from "./tagdle";

const pool: PoolTag[] = Array.from({ length: 200 }, (_, i) => ({
  name: `tag_${i}`,
  post_count: 10_000 - i * 7,
  category: i % 2 === 0 ? 0 : 5,
}));

describe("tagdle", () => {
  it("builds the same daily pairs for the same site and day", () => {
    const a = dailyPairs(pool, "e621", "2026-10-14");
    const b = dailyPairs([...pool].reverse(), "e621", "2026-10-14");
    expect(a).toHaveLength(10);
    expect(a).toEqual(b);
    expect(dailyPairs(pool, "e621", "2026-10-15")).not.toEqual(a);
  });

  it("never pairs equal counts and doesn't repeat tags within a day", () => {
    const pairs = dailyPairs(pool, "e6ai", "2026-01-01");
    const names = pairs.flatMap((p) => [p.left.name, p.right.name]);
    expect(new Set(names).size).toBe(names.length);
    for (const p of pairs) expect(p.left.post_count).not.toBe(p.right.post_count);
  });

  it("picks the side with more posts", () => {
    expect(correctSide({ left: pool[0], right: pool[1] })).toBe("left");
    expect(correctSide({ left: pool[5], right: pool[1] })).toBe("right");
  });

  it("drops tags blacklisted on their own line only", () => {
    const out = filterPool(pool.slice(0, 3), [["tag_0"], ["tag_1", "rating:explicit"]]);
    expect(out.map((t) => t.name)).toEqual(["tag_1", "tag_2"]);
  });

  it("formats share text and UTC day keys", () => {
    expect(shareText("e621", "2026-10-14", [true, false, true])).toBe("Tagdle e621 2026-10-14 2/3\n🟩🟥🟩");
    expect(utcDayKey(new Date("2026-10-14T23:59:00Z"))).toBe("2026-10-14");
  });
});
