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
