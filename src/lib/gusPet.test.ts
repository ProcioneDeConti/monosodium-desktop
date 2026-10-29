import { describe, expect, it } from "vitest";
import { act, advance, DIGEST_MS, idleLine, mood, newPet, SICK_MESSES, sickCause } from "./gusPet";

const HOUR = 3600_000;
const T0 = 1_700_000_000_000;
const first = () => 0;

describe("advance", () => {
  it("drains needs over time and floors them at zero", () => {
    const s = advance(newPet(T0), T0 + 2 * HOUR);
    expect(s.hunger).toBeCloseTo(80 - 14);
    expect(s.fun).toBeCloseTo(80 - 12);
    const week = advance(newPet(T0), T0 + 30 * 24 * HOUR);
    expect(week.hunger).toBe(0);
    expect(week.sick).toBe(true);
  });

  it("restores energy while asleep and wakes him when full", () => {
    const s = advance({ ...newPet(T0), energy: 50, asleep: true }, T0 + 0.5 * HOUR);
    expect(s.energy).toBeGreaterThan(95);
    expect(s.asleep).toBe(false);
  });

  it("turns each digested meal into a mess", () => {
    const fed = act(newPet(T0), { type: "feed", food: "grapes" }, T0, first).state;
    expect(fed.gut).toBe(1);
    const later = advance(fed, T0 + DIGEST_MS + 1000);
    expect(later.messes).toBe(1);
    expect(later.gut).toBe(0);
  });

  it("gets sick from too many messes", () => {
    const s = advance({ ...newPet(T0), messes: SICK_MESSES }, T0 + 60_000);
    expect(s.sick).toBe(true);
    expect(sickCause(s)).toBe("the messes");
  });
});

describe("act", () => {
  it("refuses food when full and play when exhausted", () => {
    expect(act({ ...newPet(T0), hunger: 99 }, { type: "feed", food: "fish" }, T0, first).ok).toBe(false);
    expect(act({ ...newPet(T0), energy: 5 }, { type: "play" }, T0, first).ok).toBe(false);
  });

  it("only lets you clean or wake him while he sleeps", () => {
    const sleeping = { ...newPet(T0), asleep: true, messes: 2, energy: 40 };
    expect(act(sleeping, { type: "groom" }, T0, first).ok).toBe(false);
    expect(act(sleeping, { type: "clean" }, T0, first).state.messes).toBe(0);
    expect(act(sleeping, { type: "wake" }, T0, first).state.asleep).toBe(false);
  });

  it("medicine cures, but he relapses if the cause stays", () => {
    const sick = { ...newPet(T0), sick: true, messes: SICK_MESSES };
    const dosed = act(sick, { type: "medicine" }, T0, first).state;
    expect(dosed.sick).toBe(false);
    expect(advance(dosed, T0 + 60_000).sick).toBe(true);
    const clean = act(act(sick, { type: "clean" }, T0, first).state, { type: "medicine" }, T0, first).state;
    expect(advance(clean, T0 + 60_000).sick).toBe(false);
  });
});

describe("mood", () => {
  it("reflects his needs", () => {
    expect(mood(newPet(T0))).toBe("happy");
    expect(mood({ ...newPet(T0), fun: 5 })).toBe("miserable");
    expect(mood({ ...newPet(T0), asleep: true })).toBe("sleeping");
  });
});

describe("horniness", () => {
  it("rises over time, from zero on older saves", () => {
    const s = advance({ ...newPet(T0), horny: undefined }, T0 + 2 * HOUR);
    expect(s.horny).toBeCloseTo(10);
  });

  it("private time needs some build-up, then resets it", () => {
    expect(act({ ...newPet(T0), horny: 10 }, { type: "relieve" }, T0, first).ok).toBe(false);
    const r = act({ ...newPet(T0), horny: 80 }, { type: "relieve" }, T0, first);
    expect(r.ok).toBe(true);
    expect(r.state.horny).toBe(0);
  });

  it("only comes up in idle chatter in adult mode", () => {
    const s = { ...newPet(T0), horny: 90 };
    expect(idleLine(s, first, false)).not.toMatch(/attention|warm in here|Needs/);
    expect(idleLine(s, first, true)).toMatch(/warm in here/);
  });
});
