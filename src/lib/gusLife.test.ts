import { describe, expect, it } from "vitest";
import { EMPTY_MEMORY, openingFollowUp, respond, type ChatEnv } from "./gusChat";
import { feeling, fuzzyIntent } from "./gusIntents";
import { browseQuip, countPhrases, catchphrase, dueEpisode, gusDay, parseEpisode, wellFormed, whenToMs } from "./gusLife";

// A Wednesday, mid-morning.
const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const env = (over: Partial<ChatEnv> = {}): ChatEnv => ({ tier: "clean", pet: null, ageDays: 3, now: NOW, babbler: null, recent: new Set(), ...over });
const first = () => 0;

describe("fuzzyIntent", () => {
  it("catches typos, slang and rewordings", () => {
    expect(fuzzyIntent("hw r u")?.id).toBe("howAreYou");
    expect(fuzzyIntent("u wanna go out sometime")?.id).toBe("date");
    expect(fuzzyIntent("can i get a hugg")?.id).toBe("hug");
    expect(fuzzyIntent("whatcha up to")?.id).toBe("whatDoing");
    expect(fuzzyIntent("im so tierd")?.id).toBe("tired");
  });

  it("never fills a rule's captured-word slot with a placeholder", () => {
    for (const tier of ["clean", "cheeky", "nasty"] as const)
      for (let i = 0; i < 20; i++) {
        const r = respond("your little hands", EMPTY_MEMORY, env({ tier }), () => (i + 0.5) / 20);
        for (const x of r?.replies ?? []) expect(x.text).not.toMatch(/\bmy that\b|\{1\}/);
      }
  });

  it("leaves messages about other things alone", () => {
    for (const t of ["do you like cheese", "i like pizza", "foxes are cool", "my cat is sick", "is it raining"]) expect(fuzzyIntent(t)).toBeNull();
  });
});

describe("feeling", () => {
  it("reads the mood, including negation", () => {
    expect(feeling("it went great").score).toBeGreaterThan(0.3);
    expect(feeling("i bombed it").score).toBeLessThan(-0.3);
    expect(feeling("i'm not happy").score).toBeLessThan(0);
    expect(feeling("the sky is blue")).toEqual({ score: 0, emotion: "neutral" });
  });
});

describe("episodes", () => {
  it("parses upcoming events with a time", () => {
    expect(parseEpisode("i have an exam tomorrow", NOW)?.what).toBe("exam");
    expect(parseEpisode("i've got a job interview on friday", NOW)?.what).toBe("job interview");
    expect(parseEpisode("tomorrow i have a big presentation", NOW)?.what).toBe("big presentation");
    expect(parseEpisode("i have a cat", NOW)).toBeNull();
  });

  it("works out when", () => {
    expect(new Date(whenToMs("tomorrow", NOW)).getDate()).toBe(29);
    expect(new Date(whenToMs("friday", NOW)).getDay()).toBe(5);
    expect(new Date(whenToMs("wednesday", NOW)).getDate()).toBe(4); // next week's, not today
  });

  it("remembers, then asks how it went once it's happened", () => {
    const told = respond("i have an exam tomorrow", EMPTY_MEMORY, env(), first)!;
    expect(told.memory.episodes).toHaveLength(1);
    expect(openingFollowUp(told.memory, NOW + 3600_000)).toBeNull();
    const later = NOW + 2 * 86400_000;
    const open = openingFollowUp(told.memory, later, first)!;
    expect(open.text).toMatch(/exam/);
    expect(dueEpisode(open.memory.episodes, later)).toBeNull(); // asked only once
    const r = respond("it went great!", open.memory, env({ now: later, conv: { expect: open.expect, topic: "" } }), first)!;
    expect(r.replies[0].text).toMatch(/YES|amazing|crush/);
  });

  it("asks mid-chat too", () => {
    const mem = { ...EMPTY_MEMORY, episodes: [{ what: "dentist appointment", due: NOW - 1000, at: NOW - 86400_000 }] };
    const r = respond("the weather is nice", mem, env(), first)!;
    expect(r.replies[r.replies.length - 1].text).toMatch(/dentist appointment/);
    expect(r.conv.expect).toEqual({ kind: "followup", what: "dentist appointment" });
  });
});

describe("his day", () => {
  it("is the same all day and answers the question", () => {
    expect(gusDay(new Date(NOW))).toEqual(gusDay(new Date(NOW + 3600_000)));
    const r = respond("how was your day?", EMPTY_MEMORY, env(), first)!;
    expect(r.replies[0].text).toMatch(/\bI /);
  });
});

describe("browsing and phrases", () => {
  it("remarks on browsing only when there's something to say", () => {
    expect(browseQuip({ todayViews: 0, todaySearches: 0, topSearches: [] }, "clean", first)).toBeNull();
    expect(browseQuip({ todayViews: 200, todaySearches: 0, topSearches: [] }, "clean", first)).toMatch(/200/);
  });

  it("picks up phrases you keep using", () => {
    let c: Record<string, number> = {};
    for (let i = 0; i < 3; i++) c = countPhrases(c, "that is so poggers honestly");
    expect(catchphrase(c, first)).toBeTruthy();
    expect(catchphrase(countPhrases({}, "just once here"), first)).toBeNull();
  });

  it("rejects babble that trails off", () => {
    expect(wellFormed("I like bins and")).toBe(false);
    expect(wellFormed("*sniffs the")).toBe(false);
    expect(wellFormed("My tail is the best part of me.")).toBe(true);
  });
});
