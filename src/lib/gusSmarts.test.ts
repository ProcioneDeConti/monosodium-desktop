import { describe, expect, it } from "vitest";
import { EMPTY_MEMORY, respond, type ChatEnv, type ChatMemory } from "./gusChat";
import { answerName, EMPTY_CONV, mathAnswer, normalize, parseCountQuestion, parseFact, parseFactQuestion, statsAnswer, type ConvState } from "./gusSmarts";

const NOW = 1_700_000_000_000;
const first = () => 0;
const env = (over: Partial<ChatEnv> = {}): ChatEnv => ({
  tier: "clean",
  pet: null,
  ageDays: 0,
  now: NOW,
  babbler: null,
  recent: new Set(),
  ...over,
});

/** Runs a whole conversation, threading memory and conversation state through. */
function talk(lines: string[], mem: ChatMemory = EMPTY_MEMORY) {
  let conv: ConvState = EMPTY_CONV;
  const out: string[] = [];
  for (const l of lines) {
    const r = respond(l, mem, env({ conv }), first)!;
    mem = r.memory;
    conv = r.conv;
    out.push(r.replies.map((x) => x.text).join(" / "));
  }
  return { mem, conv, out };
}

describe("normalize", () => {
  it("tidies chat-speak", () => {
    expect(normalize("ur soooo cute")).toBe("ur so cute");
    expect(normalize("idk, wbu?")).toBe("i don't know, what about you?");
    expect(normalize("u r cute")).toBe("you r cute");
  });
});

describe("conversation state", () => {
  it("takes a bare answer to his name question", () => {
    const { mem, out } = talk(["what's my name?", "it's Sam"]);
    expect(out[0]).toMatch(/never told me/);
    expect(mem.name).toBe("Sam");
  });

  it("tells another joke on yes", () => {
    const { out } = talk(["tell me a joke", "yes"]);
    expect(out[1]).toMatch(/\?|raccoon|bank|mask/i);
  });

  it("listens when you're sad", () => {
    const { out, conv } = talk(["i'm so sad", "yeah"]);
    expect(out[1]).toMatch(/listening|ears/i);
    expect(conv.expect?.kind).toBe("vent");
  });
});

describe("facts", () => {
  it("parses and recalls facts", () => {
    expect(parseFact("my favorite color is blue")).toEqual(["favorite color", "blue"]);
    expect(parseFact("my cat's name is Bo")).toEqual(["cat", "Bo"]);
    expect(parseFact("my head is killing me")).toBeNull();
    expect(parseFactQuestion("what's my favorite color?")).toBe("favorite color");
    const { out } = talk(["my favourite colour is blue", "what's my favorite color?"]);
    expect(out[1]).toMatch(/Blue/);
  });

  it("asks for a fact it doesn't know and keeps the answer", () => {
    const { mem } = talk(["what's my dog's name?", "Rex"]);
    expect(mem.facts.dog).toBe("Rex");
  });

  it("checks likes", () => {
    const { out } = talk(["i love otters", "do i like otters?"]);
    expect(out[1]).toMatch(/otters/);
  });
});

describe("practical answers", () => {
  it("does sums", () => {
    expect(mathAnswer("what's 12 x 3?")).toMatch(/^36\./);
    expect(mathAnswer("what is 1 / 0")).toMatch(/zero/);
    expect(mathAnswer("what's up")).toBeNull();
  });

  it("parses tag count questions and hands them to the UI", () => {
    expect(parseCountQuestion("how many fox posts are there?")).toBe("fox");
    expect(parseCountQuestion("how many posts tagged red panda?")).toBe("red panda");
    expect(parseCountQuestion("how many posts have i seen?")).toBeNull();
    expect(respond("how many wolves are there?", EMPTY_MEMORY, env(), first)!.lookup).toEqual({ tag: "wolf" });
  });

  it("answers stats questions", () => {
    const stats = { topSearches: ["fox", "red_panda"], postsViewed: 1234, favoritesAdded: 5, searches: 9, activeMs: 7_200_000, sessions: 3 };
    expect(statsAnswer("what do i search for most?", stats, "clean")).toMatch(/fox and red panda/);
    expect(statsAnswer("how many posts have i seen?", stats, "clean")).toMatch(/1,234/);
    expect(statsAnswer("how long have i spent on here", stats, "clean")).toMatch(/2\.0 hours/);
  });

  it("name answers ignore yes/no and questions", () => {
    expect(answerName("Sam")).toBe("Sam");
    expect(answerName("nope")).toBeNull();
    expect(answerName("why do you ask?")).toBeNull();
  });
});
