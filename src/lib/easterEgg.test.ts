import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSummon, getSummons, isGolden, summonLine, summonTitle, GOLDEN_AT } from "./easterEgg";

describe("easter egg summons", () => {
  beforeEach(() => {
    // Vitest runs in Node - a minimal in-memory localStorage is all this module needs.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.useFakeTimers();
  });

  it("counts summons, collapsing double calls within a second", () => {
    vi.setSystemTime(10_000);
    expect(addSummon()).toBe(1);
    expect(addSummon()).toBe(1);
    vi.setSystemTime(12_000);
    expect(addSummon()).toBe(2);
    expect(getSummons()).toBe(2);
  });

  it("escalates the line and goes golden at the threshold", () => {
    expect(summonLine(1)).toMatch(/magic word/);
    expect(summonLine(2)).toBe("Again?");
    expect(summonLine(GOLDEN_AT)).toMatch(/GOLDEN/);
    expect(isGolden(GOLDEN_AT - 1)).toBe(false);
    expect(isGolden(GOLDEN_AT)).toBe(true);
    expect(summonTitle(GOLDEN_AT)).toBe("Cooter Connoisseur");
  });
});
