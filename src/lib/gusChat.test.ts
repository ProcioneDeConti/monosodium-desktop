import { describe, expect, it } from "vitest";
import { buildBabbler, EMPTY_MEMORY, parseSearch, reflect, respond, stageFor, type ChatEnv, type ChatMemory } from "./gusChat";
import { Babbler, detokenize } from "./gusMarkov";
import { newPet } from "./gusPet";

const NOW = 1_700_000_000_000;
const env = (over: Partial<ChatEnv> = {}): ChatEnv => ({
  tier: "clean",
  pet: null,
  ageDays: 3,
  now: NOW,
  babbler: null,
  recent: new Set(),
  ...over,
});
const first = () => 0;
const say = (text: string, mem: ChatMemory = EMPTY_MEMORY, e: Partial<ChatEnv> = {}) => respond(text, mem, env(e), first)!;

describe("parseSearch", () => {
  it("turns requests into tags", () => {
    expect(parseSearch("show me foxes")).toBe("fox");
    expect(parseSearch("Can you find some red foxes and wolves?")).toBe("red_fox wolf");
    expect(parseSearch("gus, show me bunnies without humans")).toBe("bunny -human");
  });

  it("leaves things that aren't searches alone", () => {
    expect(parseSearch("show me your tail")).toBeNull();
    expect(parseSearch("give me a hug")).toBeNull();
    expect(parseSearch("I like foxes")).toBeNull();
  });
});

describe("reflect", () => {
  it("flips pronouns", () => {
    expect(reflect("my cat hates me")).toBe("your cat hates you");
  });
});

describe("respond", () => {
  it("runs searches", () => {
    const r = say("show me otters");
    expect(r.search).toBe("otter");
    expect(r.replies[0].text).toMatch(/otter/);
  });

  it("remembers names and likes", () => {
    const named = say("my name is sam").memory;
    expect(named.name).toBe("Sam");
    expect(say("what's my name?", named).replies[0].text).toContain("Sam");
    const liked = say("I really like otters", named).memory;
    expect(liked.likes).toEqual(["otters"]);
  });

  it("flirting raises affection and rudeness makes him sulk until an apology", () => {
    expect(say("you're so cute").memory.affection).toBeGreaterThan(EMPTY_MEMORY.affection);
    const rude = say("you're stupid").memory;
    expect(rude.huffyUntil).toBeGreaterThan(NOW);
    expect(say("you're cute", rude).memory.affection).toBe(rude.affection); // ignored while sulking
    expect(say("sorry", rude).memory.huffyUntil).toBe(0);
  });

  it("keeps nasty lines out of the clean tier", () => {
    const crush = { ...EMPTY_MEMORY, affection: 90 };
    const clean = say("i'm so horny", crush, { tier: "clean" }).replies[0].text;
    const nasty = say("i'm so horny", crush, { tier: "nasty" }).replies[0].text;
    expect(clean).not.toEqual(nasty);
    expect(clean).toMatch(/pretend|water/);
  });

  it("wakes him if he's asleep, and passes pet actions through", () => {
    const r = say("*pets gus*", EMPTY_MEMORY, { pet: { ...newPet(NOW), asleep: true } });
    expect(r.petActions.map((a) => a.type)).toEqual(["wake", "pet"]);
  });

  it("stages follow affection", () => {
    expect(stageFor(10)).toBe("stranger");
    expect(stageFor(40)).toBe("friend");
    expect(stageFor(80)).toBe("crush");
  });
});

describe("babbler", () => {
  it("builds a reply around a known keyword", () => {
    const b = new Babbler(["raccoons love shiny bottle caps", "i keep my bottle caps under the bed"]);
    const reply = b.reply("tell me about bottle caps", first, 20);
    expect(reply).toMatch(/bottle caps/i);
  });

  it("says nothing without keywords it knows", () => {
    expect(new Babbler(["hello there friend"]).reply("zebra quantum")).toBeNull();
  });

  it("trains on his whole line set", () => {
    expect(buildBabbler("clean").knows("trash")).toBe(true);
  });

  it("detokenizes neatly", () => {
    expect(detokenize(["i", "like", "trash", ",", "honestly"])).toBe("I like trash, honestly.");
  });
});

describe("respond follow-ups", () => {
  it("answers 'why?' about his last take instead of babbling", () => {
    const a = say("what do you think about tuesdays?");
    const b = respond("why?", a.memory, env({ conv: a.conv }), first)!;
    expect(b.replies[0].text).toMatch(/tuesdays/i);
  });
  it("doesn't save filler as a fact", () => {
    const a = say("what's my favorite color?");
    const b = respond("hmm", a.memory, env({ conv: a.conv }), first)!;
    expect(b.memory.facts).toEqual({});
  });
  it("treats going to bed as goodnight", () => {
    expect(say("ok i'm going to bed").replies[0].text).toMatch(/bye|night|see you/i);
  });
});

describe("quick-reply chips", () => {
  it("each starter reaches a real feature", () => {
    expect(say("What's popular?").openPopular).toBe(true);
    expect(say("Truth or dare").conv.expect?.kind).toBe("tod");
    expect(say("Would you rather").conv.expect?.kind).toBe("wyr");
    expect(say("Tell me a joke").conv.expect?.kind).toBe("joke");
    expect(say("What can you do?").replies[0].text).toMatch(/search/i);
    expect(say("Roast me").replies[0].text.length).toBeGreaterThan(10);
  });
  it("answer chips are understood", () => {
    const tod = say("Truth or dare");
    expect(respond("Truth", tod.memory, env({ conv: tod.conv }), first)!.conv.expect?.kind).toBe("truth");
    const joke = say("Tell me a joke");
    expect(respond("No more jokes", joke.memory, env({ conv: joke.conv }), first)!.conv.expect).toBeNull();
  });
});
