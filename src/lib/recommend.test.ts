import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import { seededRandom } from "./random";
import type { Post } from "../models/post";
import type { TasteProfile, TasteTag } from "./tasteProfile";
import {
  MAX_PER_ARTIST_IN_WINDOW,
  MAX_START_PAGE,
  advanceSource,
  CANDIDATE_PAGE_LIMIT,
  MAX_QUERY_TAGS,
  candidateQueries,
  diversify,
  rankCandidates,
  scorePost,
  weightMap,
} from "./recommend";

function tag(name: string, category: TasteTag["category"], weight: number): TasteTag {
  return { name, category, weight };
}

function profile(over: Partial<TasteProfile> = {}): TasteProfile {
  return {
    site: "e621",
    user: { id: 1, name: "someone", avatarId: null },
    mode: "recent",
    sampled: 100,
    usedVotes: false,
    builtAt: 0,
    tags: [
      ...["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map((n, i) => tag(n, "artist", 2 - i * 0.1)),
      ...["c1", "c2", "c3", "c4"].map((n, i) => tag(n, "character", 1.5 - i * 0.1)),
      tag("cp1", "copyright", 1.2),
      ...["s1", "s2"].map((n, i) => tag(n, "species", 1 - i * 0.1)),
      ...["g1", "g2", "g3", "g4", "g5"].map((n, i) => tag(n, "general", 0.5 - i * 0.05)),
    ],
    avoid: ["bad1", "bad2", "bad3", "bad4"],
    ...over,
  };
}

const CTX = { targetName: "someone", ratingFilter: "-rating:e", seed: 42, now: new Date("2026-11-03T00:00:00Z") };

describe("candidateQueries", () => {
  it("builds six searches, each excluding the target's favourites and avoid tags", () => {
    const qs = candidateQueries(profile(), CTX);
    expect(qs).toHaveLength(6);
    for (const q of qs) {
      expect(q.query).toContain("-fav:someone");
      expect(q.query).toContain("-rating:e");
      expect(q.query).toContain("-bad1 -bad2 -bad3");
      expect(q.query).not.toContain("-bad4");
      expect(q.query.split(/\s+/).length).toBeLessThanOrEqual(MAX_QUERY_TAGS);
      expect(q.page).toBe(q.startPage);
      expect(q.startPage).toBeGreaterThanOrEqual(1);
      expect(q.startPage).toBeLessThanOrEqual(MAX_START_PAGE);
    }
    expect(qs[0].query.startsWith("~a1 ~a2 ~a3 ")).toBe(true);
    expect(qs[1].query.startsWith("~a4 ~a5 ~a6 ")).toBe(true);
    // Character + copyright share a group, by weight.
    expect(qs[2].query.startsWith("~c1 ~c2 ~c3 ~c4 ")).toBe(true);
    expect(qs.find((q) => q.key.startsWith("recent"))!.query).toContain("date:>=2026-08-05");
    expect(qs.find((q) => q.key.startsWith("discovery"))!.query).toContain("randseed:42");
  });

  it("uses whoever the profile is for in -fav:", () => {
    const qs = candidateQueries(profile(), { ...CTX, targetName: "friend" });
    expect(qs.every((q) => q.query.includes("-fav:friend"))).toBe(true);
  });

  it("later rounds step down the ranking and eventually run out", () => {
    const r1 = candidateQueries(profile(), { ...CTX, round: 1 });
    expect(r1[0].query.startsWith("a7 ")).toBe(true);
    expect(candidateQueries(profile(), { ...CTX, round: 5 })).toHaveLength(0);
  });

  it("skips groups the profile has no tags for", () => {
    const qs = candidateQueries(profile({ tags: [tag("only_artist", "artist", 1)] }), CTX);
    expect(qs.map((q) => q.key)).toEqual(["artists-a#0"]);
    expect(qs[0].query.startsWith("only_artist ")).toBe(true);
  });
});

describe("random start pages", () => {
  it("vary between runs; the random-order source always starts at page 1", () => {
    const starts = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const qs = candidateQueries(profile(), { ...CTX, seed });
      expect(qs.find((q) => q.key.startsWith("discovery"))!.startPage).toBe(1);
      for (const q of qs) starts.add(q.startPage);
    }
    expect([...starts].sort()).toEqual([1, 2, 3]);
    // Same seed, same pages.
    expect(candidateQueries(profile(), CTX).map((q) => q.startPage)).toEqual(
      candidateQueries(profile(), CTX).map((q) => q.startPage),
    );
  });

  const src = (startPage: number) => ({ key: "k", query: "q", page: startPage, startPage, wrapped: false, fetched: false, done: false });
  const FULL = CANDIDATE_PAGE_LIMIT;

  it("walks forward, then wraps to page 1 and stops at the start page", () => {
    const s = src(3);
    expect(advanceSource(s, FULL)).toBe(false);
    expect(s.page).toBe(4);
    expect(advanceSource(s, 40)).toBe(false); // ran dry -> wrap, next batch
    expect([s.page, s.wrapped, s.done]).toEqual([1, true, false]);
    advanceSource(s, FULL);
    expect([s.page, s.done]).toEqual([2, false]);
    advanceSource(s, FULL);
    expect(s.done).toBe(true); // reached page 3 again - already seen
  });

  it("retries page 1 immediately only when the random start page was empty on the first fetch", () => {
    const empty = src(3);
    expect(advanceSource(empty, 0)).toBe(true);
    expect([empty.page, empty.wrapped]).toEqual([1, true]);
    const short = src(2);
    advanceSource(short, FULL);
    expect(advanceSource(short, 0)).toBe(false); // later empty page: wrap for next batch instead
    const fromOne = src(1);
    expect(advanceSource(fromOne, 10)).toBe(false);
    expect(fromOne.done).toBe(true);
  });
});

describe("ranking", () => {
  it("scores by taste overlap, normalised by tag count", () => {
    const w = weightMap(profile());
    const focused = makePost(1, { tags: { artist: ["a1"], character: ["c1"] } });
    const diluted = makePost(2, {
      tags: { artist: ["a1"], character: ["c1"], general: ["x", "y", "z", "w", "v", "u"] },
    });
    expect(scorePost(focused, w)).toBeGreaterThan(scorePost(diluted, w));
  });

  it("filters avoid tags, deleted posts, already-shown and (self only) own favs/votes", () => {
    const fav = { ...makePost(1, { tags: { artist: ["a1"] } }), is_favorited: true };
    const voted = { ...makePost(2, { tags: { artist: ["a1"] } }), vote_by: 1 };
    const avoided = makePost(3, { tags: { artist: ["a1"], general: ["bad1"] } });
    const deleted = { ...makePost(4, { tags: { artist: ["a1"] } }), flags: { deleted: true } } as Post;
    const shown = makePost(5, { tags: { artist: ["a1"] } });
    const ok = makePost(6, { tags: { artist: ["a1"] } });
    const all = [fav, voted, avoided, deleted, shown, ok, ok];

    const self = rankCandidates(all, profile(), { isSelf: true, shown: new Set([5]) });
    expect(self.map((p) => p.id)).toEqual([6]);

    // For another user, the viewer's own favourite/vote flags are irrelevant.
    const other = rankCandidates(all, profile(), { isSelf: false, shown: new Set([5]) });
    expect(other.map((p) => p.id).sort()).toEqual([1, 2, 6]);
  });

  it("shuffles the order per run while keeping the same posts, and strong matches still lead", () => {
    // 20 posts by different artists, relevance falling with the id.
    const tags = profile().tags;
    const posts = Array.from({ length: 20 }, (_, i) =>
      makePost(i + 1, { tags: { artist: [`artist_${i}`], general: tags.slice(0, Math.max(1, 20 - i)).map((t) => t.name) } }),
    );
    const plain = rankCandidates(posts, profile(), { isSelf: false, shown: new Set() }).map((p) => p.id);
    expect(rankCandidates(posts, profile(), { isSelf: false, shown: new Set() }).map((p) => p.id)).toEqual(plain);

    const runs = [1, 2, 3, 4, 5].map((seed) =>
      rankCandidates(posts, profile(), { isSelf: false, shown: new Set(), rand: seededRandom(seed) }).map((p) => p.id),
    );
    for (const r of runs) expect([...r].sort((a, b) => a - b)).toEqual([...plain].sort((a, b) => a - b));
    expect(new Set(runs.map((r) => r.join(","))).size).toBeGreaterThan(1);

    // Over many runs, the strongest match is near the top far more often than the weakest.
    let strongTop5 = 0;
    let weakTop5 = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const ids = rankCandidates(posts, profile(), { isSelf: false, shown: new Set(), rand: seededRandom(seed) })
        .slice(0, 5)
        .map((p) => p.id);
      if (ids.includes(plain[0])) strongTop5++;
      if (ids.includes(plain[plain.length - 1])) weakTop5++;
    }
    expect(strongTop5).toBeGreaterThan(weakTop5 * 3);
  });

  it("diversify caps one artist per window without dropping posts", () => {
    const posts = [
      ...[1, 2, 3, 4].map((id) => makePost(id, { tags: { artist: ["same"] } })),
      makePost(5, { tags: { artist: ["other"] } }),
      makePost(6, { tags: { artist: ["conditional_dnp"] } }),
    ];
    const out = diversify(posts).map((p) => p.id);
    expect(out).toHaveLength(6);
    expect(out.slice(0, MAX_PER_ARTIST_IN_WINDOW)).toEqual([1, 2]);
    expect(out.slice(2, 4)).toEqual([5, 6]);
  });
});
