import { describe, expect, it } from "vitest";
import { EMPTY_MEMORY, respond, type ChatEnv, type ChatMemory } from "./gusChat";
import { answerName, EMPTY_CONV, introName, quickReplies, mathAnswer, normalize, parseCountQuestion, parseDefineQuestion, parseFact, wikiSummary, wikiReply, parseFactQuestion, statsAnswer, type ConvState } from "./gusSmarts";

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

describe("introName", () => {
  const knows = (w: string) => ["cool", "sleepy", "trash"].includes(w);
  it("picks names out of introductions", () => {
    expect(introName("i'm alex", knows)).toBe("Alex");
    expect(introName("hi gus, im Riley!", knows)).toBe("Riley");
    expect(introName("i'm Trash", knows)).toBe("Trash");
  });
  it("ignores states and ordinary words", () => {
    expect(introName("i'm bored", knows)).toBeNull();
    expect(introName("i'm cool", knows)).toBeNull();
    expect(introName("i'm starving", knows)).toBeNull();
    expect(introName("i'm going home", knows)).toBeNull();
  });
  it("answers 'what's my X called'", () => {
    expect(parseFactQuestion("what's my dog called?")).toBe("dog");
  });
});

describe("quickReplies", () => {
  it("offers answers to his question, or starters early on", () => {
    expect(quickReplies({ kind: "tod" }, 9)).toEqual(["Truth", "Dare"]);
    expect(quickReplies({ kind: "wyr", a: "fly", b: "be invisible" }, 9)).toEqual(["Fly", "Be invisible"]);
    expect(quickReplies(null, 0).length).toBeGreaterThan(0);
    expect(quickReplies(null, 5)).toEqual([]);
    expect(quickReplies({ kind: "name" }, 0)).toEqual([]);
  });
});

describe("introName edge cases", () => {
  it("doesn't take states or Gus's own name", () => {
    const none = () => false;
    expect(introName("this is gus", none)).toBeNull();
    expect(introName("i'm hard", none)).toBeNull();
    expect(introName("i'm married", none)).toBeNull();
  });
});

describe("wiki questions", () => {
  it("spots what-is questions but not small talk", () => {
    expect(parseDefineQuestion("what's a protogen?")).toBe("protogen");
    expect(parseDefineQuestion("who is spyro")).toBe("spyro");
    expect(parseDefineQuestion("define yiff")).toBe("yiff");
    for (const t of ["what's up?", "what is your name?", "what's the date?", "what is 2 + 2", "what is love", "who are you?", "what's my dog's name?"])
      expect(parseDefineQuestion(t)).toBeNull();
  });

  it("routes a what-is question to a wiki lookup", () => {
    const r = respond("what's a protogen?", EMPTY_MEMORY, env(), first)!;
    expect(r.lookup).toEqual({ tag: "protogen", kind: "wiki" });
  });

  it("summarises a wiki body as plain prose", () => {
    const body = "h4. Protogen\n\nA [[protogen]] is a [[species|fictional species]] created by Malice-risu. They have visors.\n\n* See also [[primagen]]";
    expect(wikiSummary(body)).toBe("A protogen is a fictional species created by Malice-risu. They have visors.");
    expect(wikiReply("protogen", null)).toMatch(/never heard/i);
  });
});

describe("asking him back", () => {
  it("remembers your answer and gives his own", () => {
    const fact = { kind: "fact" as const, key: "favorite color" };
    const r = respond("blue, you?", EMPTY_MEMORY, env({ conv: { ...EMPTY_CONV, expect: fact } }), first)!;
    expect(r.memory.facts["favorite color"]).toBe("blue");
    expect(r.replies.map((x) => x.text).join(" ")).toMatch(/Gold/);
  });

  it("answers a bare 'what about you?' and waits for yours", () => {
    const fact = { kind: "fact" as const, key: "pet" };
    const r = respond("what about you?", EMPTY_MEMORY, env({ conv: { ...EMPTY_CONV, expect: fact } }), first)!;
    expect(r.replies[0].text).toMatch(/I'm the pet/);
    expect(r.conv.expect).toEqual(fact);
  });
});

describe("reacting to his pics", () => {
  const pic = { kind: "pic" as const };
  it("takes 'I love what I see' as a compliment, not a like to remember", () => {
    const r = respond("I love what I see", EMPTY_MEMORY, env({ tier: "nasty", conv: { ...EMPTY_CONV, expect: pic } }), first)!;
    expect(r.memory.likes).toEqual([]);
    expect(r.replies[0].text).not.toMatch(/remember/i);
  });

  it("sulks if you're rude about it", () => {
    const r = respond("ew", EMPTY_MEMORY, env({ conv: { ...EMPTY_CONV, expect: pic } }), first)!;
    expect(r.replies[0].text).toMatch(/Rude/);
  });

  it("doesn't store vague likes like 'I like that'", () => {
    const r = respond("I like that", EMPTY_MEMORY, env(), first)!;
    expect(r.memory.likes).toEqual([]);
  });
});
