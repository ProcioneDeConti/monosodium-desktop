import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import type { Post } from "../models/post";
import { parseBlacklist } from "./blacklist";
import {
  allowedRatings,
  collectionSample,
  isRotationDue,
  isWallpaperable,
  pickWallpaper,
  pushRecent,
  ratingFilterFor,
  rotationQuery,
} from "./wallpaper";

function img(id: number, opts: { ext?: string; rating?: string; tags?: string[]; deleted?: boolean } = {}): Post {
  const p = makePost(id, { rating: opts.rating ?? "s", tags: { general: opts.tags ?? [] } });
  return {
    ...p,
    file: { ...p.file, ext: opts.ext ?? "jpg", url: opts.deleted ? null : `https://cdn/${id}` },
    flags: { ...p.flags, deleted: !!opts.deleted },
  };
}

describe("isWallpaperable", () => {
  it("accepts still/animated images, rejects video, flash, deleted", () => {
    expect(isWallpaperable(img(1))).toBe(true);
    expect(isWallpaperable(img(2, { ext: "gif" }))).toBe(true);
    expect(isWallpaperable(img(3, { ext: "webm" }))).toBe(false);
    expect(isWallpaperable(img(4, { ext: "swf" }))).toBe(false);
    expect(isWallpaperable(img(5, { deleted: true }))).toBe(false);
  });
});

describe("allowedRatings / ratingFilterFor", () => {
  it("forces safe when asked or when adult mode is off", () => {
    expect(allowedRatings(true, true, ["s", "q", "e"])).toEqual(["s"]);
    expect(allowedRatings(false, false, ["s", "q", "e"])).toEqual(["s"]);
    expect(allowedRatings(false, true, ["q", "e"])).toEqual(["q", "e"]);
  });
  it("builds e621 rating tags", () => {
    expect(ratingFilterFor(["s"])).toBe("rating:safe");
    expect(ratingFilterFor(["q", "e"])).toBe("~rating:questionable ~rating:explicit");
    expect(ratingFilterFor(["s", "q", "e"])).toBeNull();
  });
});

describe("rotationQuery", () => {
  it("replaces any order and excludes video", () => {
    expect(rotationQuery("  wolf  order:score ", "rating:safe")).toBe(
      "wolf -type:webm -type:mp4 -type:swf order:random rating:safe",
    );
  });
});

describe("pickWallpaper", () => {
  const base = { blacklist: [], ratings: ["s" as const], recentIds: [], currentId: null, rand: () => 0 };

  it("skips videos, disallowed ratings, and blacklisted posts", () => {
    const posts = [img(1, { ext: "mp4" }), img(2, { rating: "e" }), img(3, { tags: ["gore"] }), img(4)];
    const pick = pickWallpaper(posts, { ...base, blacklist: parseBlacklist("gore") });
    expect(pick?.id).toBe(4);
  });
  it("prefers posts not shown recently, then anything but the current one", () => {
    const posts = [img(1), img(2), img(3)];
    expect(pickWallpaper(posts, { ...base, recentIds: [1, 2] })?.id).toBe(3);
    expect(pickWallpaper(posts, { ...base, recentIds: [1, 2, 3], currentId: 1 })?.id).toBe(2);
    expect(pickWallpaper([img(1)], { ...base, recentIds: [1], currentId: 1 })?.id).toBe(1);
  });
  it("returns null when nothing qualifies", () => {
    expect(pickWallpaper([img(1, { ext: "webm" })], base)).toBeNull();
  });
});

describe("collectionSample", () => {
  it("puts unused ids first and caps the count", () => {
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    const sample = collectionSample(ids, [1, 2, 3], 8);
    expect(sample).toHaveLength(8);
    expect(sample.slice(0, 7).every((id) => id > 3)).toBe(true);
  });
});

describe("pushRecent / isRotationDue", () => {
  it("dedupes and caps", () => {
    expect(pushRecent([3, 2, 1], 2, 3)).toEqual([2, 3, 1]);
    expect(pushRecent([3, 2, 1], 4, 3)).toEqual([4, 3, 2]);
  });
  it("is due after the interval, or at the retry time when one is set", () => {
    expect(isRotationDue(0, 60, 60 * 60_000)).toBe(true);
    expect(isRotationDue(0, 60, 59 * 60_000)).toBe(false);
    expect(isRotationDue(0, 60, 61 * 60_000, 70 * 60_000)).toBe(false);
    expect(isRotationDue(0, 60, 5 * 60_000, 5 * 60_000)).toBe(true);
  });
});
