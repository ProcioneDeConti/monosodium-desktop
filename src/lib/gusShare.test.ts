import { describe, expect, it } from "vitest";
import { makePost } from "../test/makePost";
import { commentOnPost, shareWithGus, takeSharedPost } from "./gusShare";

const ctx = { tier: "clean" as const, likes: [], dislikes: [] };
const first = () => 0;

describe("commentOnPost", () => {
  it("gets jealous of other raccoons", () => {
    const post = makePost(1, { tags: { species: ["raccoon", "procyonid", "mammal"] }, rating: "s" });
    expect(commentOnPost(post, ctx, first).replies[1].text).toMatch(/I'm right here/);
  });

  it("names a species it has no special line for", () => {
    const post = makePost(2, { tags: { species: ["mammal", "hyena"] }, rating: "s" });
    expect(commentOnPost(post, ctx, first).replies[1].text).toMatch(/hyena/);
  });

  it("keeps explicit reactions to the allowed tier", () => {
    const post = makePost(3, { rating: "e" });
    const clean = commentOnPost(post, ctx, first).replies[1].text;
    expect(clean).toMatch(/covers eyes|didn't see/);
  });

  it("notices things you told him you like", () => {
    const post = makePost(4, { tags: { species: ["red_panda"] }, rating: "s" });
    const r = commentOnPost(post, { ...ctx, likes: ["red pandas"] }, first);
    expect(r.replies[2].text).toMatch(/red pandas/);
    expect(r.topic).toContain("red panda");
  });
});

describe("foxes", () => {
  it("lead up, then gush, then a kind-specific remark", () => {
    const r = commentOnPost(makePost(6, { tags: { species: ["fennec_fox", "fox"] }, rating: "s" }), ctx, () => 0.1);
    expect(r.replies[1].emoji).toContain("🦊");
    expect(r.replies[2].text).toMatch(/[Ff]ennec/);
  });

  it("beat the raccoon jealousy, with a combo line for both", () => {
    const r = commentOnPost(makePost(7, { tags: { species: ["fox", "raccoon"] }, rating: "s" }), ctx, first);
    expect(r.replies[1].text).toMatch(/fox and raccoon|fox AND a raccoon/i);
  });
});

describe("hand-off", () => {
  it("is taken exactly once", () => {
    shareWithGus(makePost(5));
    expect(takeSharedPost()?.id).toBe(5);
    expect(takeSharedPost()).toBeNull();
  });
});

describe("the bigger reaction pool", () => {
  it("prefers a specific species over its family", () => {
    const post = makePost(50, { tags: { species: ["husky", "domestic_dog", "canid", "mammal"] }, rating: "s" });
    expect(commentOnPost(post, ctx, first).replies[1].text).toMatch(/[Hh]usky/);
  });

  it("has lots of different things to say", () => {
    const posts = [
      makePost(60, { tags: { species: ["raccoon"] }, rating: "s" }),
      makePost(61, { tags: { species: ["wolf"] }, rating: "s" }),
      makePost(62, { tags: { species: ["red_fox"] }, rating: "s" }),
      makePost(63, { rating: "e" }),
    ];
    const seen = new Set<string>();
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 400; i++) for (const p of posts) for (const r of commentOnPost(p, { ...ctx, tier: "cheeky" }, rnd).replies) seen.add(r.text);
    expect(seen.size).toBeGreaterThan(120);
  });
});

describe("cut / uncut", () => {
  it("notices which, in nasty mode", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const said = (tag: string) =>
      Array.from({ length: 60 }, () => commentOnPost(makePost(70, { tags: { general: [tag, "penis"] }, rating: "e" }), { ...ctx, tier: "nasty" }, rnd).replies.map((r) => r.text)).flat().join(" ");
    expect(said("circumcised")).toMatch(/\b[Cc]ut\b|[Cc]ircumcised/);
    expect(said("uncut")).toMatch(/[Uu]ncut|[Ff]oreskin/);
  });
});
