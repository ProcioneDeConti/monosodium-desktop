import { describe, expect, it } from "vitest";
import { answerGame, because, chatGame, NUDE_QUERY, cooledHeat, favorite, greeting, opinion, oracle, recap, special, steer, themed, type BrainCtx } from "./gusBrain";
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
    expect(chatGame("send nudes", ctx({ tier: "nasty" }), () => 0.9)?.sendPic?.query).toBe(NUDE_QUERY);
    expect(chatGame("can you send me a nude?", ctx({ tier: "cheeky" }), first)?.sendPic?.query).toMatch(/rating:q$/);
    expect(chatGame("show me your dick", ctx(), first)?.sendPic?.query).toMatch(/rating:s$/);
    const r = respond("gimme nudes", EMPTY_MEMORY, { tier: "nasty", pet: null, ageDays: 0, now: NOW.getTime(), babbler: null, recent: new Set() }, () => 0.9)!;
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

describe("smarter conversation", () => {
  const known = { name: "Sam", likes: ["otters"], facts: { dog: "biscuit" }, topics: ["wolves", "work"] };

  it("explains a take, the same way every time", () => {
    const take = opinion("what do you think about tuesdays?", ctx(), first)!;
    expect(take.subject?.x).toBe("tuesdays");
    expect(text(because(take.subject!, ctx()))).toBe(text(because(take.subject!, ctx())));
    expect(text(because(take.subject!, ctx()))).toMatch(/tuesdays/i);
  });

  it("has stable favorites", () => {
    expect(text(favorite("what's your favorite color?", ctx()))).toMatch(/gold/i);
    expect(text(favorite("what kind of music do you like?", ctx()))).toMatch(/lo-fi/i);
    expect(favorite("what's your favorite thing?", ctx())).toBeNull();
  });

  it("recaps what it knows", () => {
    expect(text(recap("what do you know about me?", known))).toMatch(/Sam.*otters.*biscuit/);
    expect(text(recap("what did we talk about?", known))).toMatch(/wolves and work/);
    expect(recap("what about otters", known)).toBeNull();
  });

  it("steers quiet moments with what it knows, or asks to learn more", () => {
    const outs = [0, 0.3, 0.6, 0.99].map((r) => steer(known, ctx(), () => r));
    expect(outs.map(text).join(" ")).toMatch(/Biscuit|otters|work/);
    const blank = steer({ name: null, likes: [], facts: {}, topics: [] }, ctx(), first);
    expect(blank.expect).toBeTruthy();
  });

  it("offers to listen and expects you to vent", () => {
    const out = themed("work was awful", ctx(), () => 0.99)!;
    expect(out.expect).toEqual({ kind: "talk" });
  });
});

describe("opinion moods", () => {
  it("gives reasons that match the take", () => {
    expect(opinion("what do you think about geese?", ctx(), first)!.subject?.mood).toBe("dislike");
    expect(opinion("thoughts on pineapple pizza?", ctx(), first)!.subject?.mood).toBe("meh");
    expect(opinion("what do you think about otters?", ctx(), first)!.subject?.mood).toBe("love");
    expect(opinion("do you like politics?", ctx(), first)!.subject?.mood).toBe("meh");
    const kink = opinion("thoughts on latex?", ctx(), first)!.subject!;
    expect(kink.mood).toBe("dodge");
    expect(text(because(kink, ctx()))).not.toBe(text(because(kink, ctx({ tier: "nasty" }))));
  });
});

describe("review fixes", () => {
  it("would-you-rather tells apart options that share a word", () => {
    const e = { kind: "wyr" as const, a: "have a tail", b: "have whiskers" };
    // He says his own pick back: "Interesting" = you were counted as choosing whiskers, not his tail.
    expect(text(answerGame(e, "Have whiskers", ctx(), first))).toMatch(/^Interesting/);
    expect(text(answerGame(e, "Have a tail", ctx(), first))).toMatch(/^Same/);
    const g = { kind: "wyr" as const, a: "fight one giant goose", b: "a hundred tiny geese" };
    expect(text(answerGame(g, "A hundred tiny geese", ctx(), first))).toMatch(/I'd (fight one giant goose|a hundred tiny geese)/);
    expect(answerGame(g, "A hundred tiny geese", ctx(), first)!.replies[0].text).not.toBe(answerGame(g, "the first", ctx(), first)!.replies[0].text);
  });
  it("themes record a tidy topic, not the matched word", () => {
    expect(themed("i just ate", ctx(), first)!.topic).toBe("food");
    expect(themed("studying for finals", ctx(), first)!.topic).toBe("school");
  });
  it("doesn't treat 'what else do you like' as a favorite", () => {
    expect(favorite("what else do you like?", ctx())).toBeNull();
  });
});

describe("asking for a pic", () => {
  const ctx = { tier: "nasty" as const, stage: "friend" as const, heat: 0, name: null, now: new Date(), topSearches: [] };
  it("understands lots of phrasings", () => {
    for (const t of ["hey, can you send me a pic", "send me a selfie", "can i see a pic of you", "pic?", "what do you look like", "drop a photo", "gimme nudes", "send nudes", "got any pics?"])
      expect(chatGame(t, ctx, () => 0)?.sendPic, t).toBeTruthy();
  });
  it("leaves pics of other things alone", () => {
    for (const t of ["send me a pic of foxes", "can i see a picture of a dragon", "i took a photo today", "nice pic", "show me your tail"]) expect(chatGame(t, ctx, () => 0)?.sendPic, t).toBeFalsy();
  });
});

describe("more pics", () => {
  const ctx = { tier: "nasty" as const, stage: "friend" as const, heat: 90, name: null, now: new Date(), topSearches: [] };
  it("sends another on 'more' / 'another' after a pic", () => {
    for (const t of ["more", "another one", "yes more please", "send more", "one more", "keep em coming", "again!"])
      expect(answerGame({ kind: "pic" }, t, ctx, () => 0)?.sendPic, t).toBeTruthy();
  });
  it("a plain yes only counts when he offered more", () => {
    expect(answerGame({ kind: "pic", offered: true }, "yes", ctx, () => 0)?.sendPic).toBeTruthy();
    expect(answerGame({ kind: "pic" }, "yes", ctx, () => 0)?.sendPic).toBeFalsy();
  });
  it("'Want more?' sets up the offer", () => {
    const outs = Array.from({ length: 20 }, (_, i) => answerGame({ kind: "pic" }, "i love it", ctx, () => i / 20));
    const offer = outs.find((o) => /want more\?/i.test(o?.replies[0].text ?? ""));
    expect(offer?.expect).toEqual({ kind: "pic", offered: true });
  });
});

describe("pics vs videos", () => {
  const ctx = { tier: "nasty" as const, stage: "friend" as const, heat: 0, name: null, now: new Date(), topSearches: [] };
  it("a video comes with a video line and falls back to a still", () => {
    const v = chatGame("send nudes", ctx, () => 0.05)!; // under VIDEO_CHANCE
    expect(v.sendPic!.query).toMatch(/ animated/);
    expect(v.sendPic!.fallback!.query).toMatch(/-animated/);
    expect(v.replies[0].text).toMatch(/video|film|record|movie/i);
    const s = chatGame("send nudes", ctx, () => 0.9)!;
    expect(s.sendPic!.query).toMatch(/-animated/);
    expect(s.sendPic!.fallback).toBeUndefined();
  });
});
