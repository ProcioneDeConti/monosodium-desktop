import { describe, expect, it } from "vitest";
import { answerGame, chatGame, NUDE_QUERY, cooledHeat, greeting, opinion, oracle, special, themed, type BrainCtx } from "./gusBrain";
import { EMPTY_MEMORY, respond, type ChatEnv, type ChatMemory } from "./gusChat";
import { EMPTY_CONV, type ConvState } from "./gusSmarts";

const NOW = new Date(2026, 9, 28, 15, 0);
const ctx = (over: Partial<BrainCtx> = {}): BrainCtx => ({ tier: "clean", stage: "friend", heat: 0, name: "Sam", now: NOW, topSearches: [], ...over });
const first = () => 0;
const text = (o: { replies: { text: string }[] } | null) => o?.replies.map((r) => r.text).join(" / ") ?? "";

describe("heat", () => {
  it("cools over time", () => {
    expect(cooledHeat(50, 0, 10 * 60_000)).toBe(30);
    expect(cooledHeat(10, 0, 60 * 60_000)).toBe(0);
  });

  it("builds with flirting and escalates nasty replies", () => {
    let mem: ChatMemory = { ...EMPTY_MEMORY, affection: 80 };
    let conv: ConvState = EMPTY_CONV;
    const env = (): ChatEnv => ({ tier: "nasty", pet: null, ageDays: 0, now: NOW.getTime(), babbler: null, recent: new Set(), conv });
    for (const t of ["you're hot", "*kisses you*", "i'm so horny", "talk dirty to me"]) {
      const r = respond(t, mem, env(), first)!;
      mem = r.memory;
      conv = r.conv;
    }
    expect(mem.heat).toBeGreaterThanOrEqual(30);
    const rude = respond("shut up", mem, env(), first)!;
    expect(rude.memory.heat).toBe(0);
  });
});

describe("special", () => {
  it("catches repeats, keysmash, caps and emoji", () => {
    expect(text(special("hello", "hello", ctx(), first))).toMatch(/already|heard/);
    expect(text(special("sdfghjkl", "", ctx(), first))).toMatch(/keyboard|Gesundheit/);
    expect(special("HELLO THERE GUS", "", ctx(), first)?.prefix).toBe(true);
    expect(text(special("🦝", "", ctx(), first))).toMatch(/me/);
    expect(special("🍆💦", "", ctx(), first)?.heat).toBeGreaterThan(0);
  });
});

describe("opinions and oracle", () => {
  it("has real opinions and stable made-up ones", () => {
    expect(text(opinion("what do you think about trash?", ctx(), first))).toMatch(/[Tt]rash/);
    const a = text(opinion("what do you think of spreadsheets", ctx(), first));
    const b = text(opinion("what do you think of spreadsheets", ctx(), first));
    expect(a).toBe(b);
    expect(a).toMatch(/[Ss]preadsheets/);
  });

  it("answers yes/no questions, consistently for the day", () => {
    const q = "should i buy the blue shirt?";
    expect(text(oracle(q, ctx(), first))).toBe(text(oracle(q, ctx(), first)));
    expect(text(oracle("should i go to bed?", ctx({ now: new Date(2026, 9, 28, 3) }), first))).toMatch(/YES/);
    expect(oracle("should i", ctx(), first)).toBeNull(); // not a question
  });
});

describe("chat games", () => {
  it("plays truth or dare", () => {
    const tod = chatGame("let's play truth or dare", ctx(), first)!;
    expect(tod.expect).toEqual({ kind: "tod" });
    const dare = answerGame({ kind: "tod" }, "dare", ctx(), first)!;
    expect(text(dare)).toMatch(/^Dare:/);
    expect(text(answerGame({ kind: "dare" }, "done!", ctx(), first))).toMatch(/[Gg]ood|[Ll]egend/);
    expect(text(answerGame({ kind: "dare" }, "nope", ctx(), first))).toMatch(/Chicken/);
  });

  it("plays would you rather both ways", () => {
    const q = chatGame("would you rather", ctx(), first)!;
    expect(q.expect?.kind).toBe("wyr");
    const e = q.expect as { kind: "wyr"; a: string; b: string };
    expect(text(answerGame(e, "the first one", ctx(), first))).toMatch(/I'd/);
    expect(text(chatGame("would you rather fly or be invisible?", ctx(), first))).toMatch(/fly|be invisible/);
  });

  it("gives a stable fursona and ratings", () => {
    const f = text(chatGame("make me a fursona", ctx(), first));
    expect(f).toBe(text(chatGame("make me a fursona", ctx(), first)));
    expect(text(chatGame("rate me", ctx(), first))).toMatch(/\/10/);
  });
});

describe("nudes", () => {
  it("sends a raccoon, rated to the tier", () => {
    expect(chatGame("send nudes", ctx({ tier: "nasty" }), first)?.sendPic?.query).toBe(NUDE_QUERY);
    expect(chatGame("can you send me a nude?", ctx({ tier: "cheeky" }), first)?.sendPic?.query).toMatch(/rating:q$/);
    expect(chatGame("show me your dick", ctx(), first)?.sendPic?.query).toMatch(/rating:s$/);
    const r = respond("gimme nudes", EMPTY_MEMORY, { tier: "nasty", pet: null, ageDays: 0, now: NOW.getTime(), babbler: null, recent: new Set() }, first)!;
    expect(r.search).toBeUndefined();
    expect(r.sendPic?.query).toBe(NUDE_QUERY);
  });
});

describe("themes and greetings", () => {
  it("talks about topics", () => {
    expect(text(themed("ugh my boss is awful", ctx(), first))).toMatch(/boss|[Ww]ork|bins/);
  });

  it("greets by how long you've been away", () => {
    expect(greeting(0, ctx(), first)).toMatch(/I'm Gus/);
    expect(greeting(NOW.getTime() - 10 * 24 * 3600_000, ctx(), first)).toMatch(/week/);
  });
});
