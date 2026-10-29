import { describe, expect, it } from "vitest";
import { EMPTY_MEMORY, respond, type ChatEnv, type ChatMemory } from "./gusChat";
import { AFTERGLOW_MS, bondStep, EMPTY_BOND, HEAT_AFTER, petNameAnswer, satisfied, speciesEmoji } from "./gusBond";

const NOW = 1_800_000_000_000;
const env = (over: Partial<ChatEnv> = {}): ChatEnv => ({ tier: "clean", pet: null, ageDays: 3, now: NOW, babbler: null, recent: new Set(), ...over });
const first = () => 0;

describe("five hearts", () => {
  it("confesses once, gives a gift and asks for a pet name", () => {
    const out = bondStep({ affection: 88, heat: 0 }, { affection: 91, heat: 0 }, EMPTY_BOND, "clean", "Sam", NOW, first)!;
    expect(out.replies.some((r) => r.hesitate)).toBe(true);
    expect(out.bond.confessed).toBe(true);
    expect(out.bond.gift).toBeTruthy();
    expect(out.bond.maxedAt).toBe(NOW);
    expect(out.askPetName).toBe(true);
    // Dropping and coming back is a short line, not the confession again.
    const again = bondStep({ affection: 85, heat: 0 }, { affection: 92, heat: 0 }, out.bond, "clean", "Sam", NOW + 1, first)!;
    expect(again.replies).toHaveLength(1);
    expect(again.bond.maxedAt).toBe(NOW);
  });

  it("nothing happens while already there", () => {
    expect(bondStep({ affection: 95, heat: 0 }, { affection: 97, heat: 0 }, EMPTY_BOND, "clean", null, NOW, first)).toBeNull();
  });

  it("takes a pet name, or picks one", () => {
    expect(petNameAnswer("call me Biscuit", first)).toBe("Biscuit");
    expect(petNameAnswer("you pick", first)).toBeTruthy();
    expect(petNameAnswer("no thanks", first)).toBeNull();
  });

  it("works through respond(): the pet name gets stored", () => {
    const mem: ChatMemory = { ...EMPTY_MEMORY, affection: 100, bond: { ...EMPTY_BOND, confessed: true } };
    const r = respond("Biscuit", mem, env({ conv: { expect: { kind: "petName" }, topic: "" } }), first)!;
    expect(r.memory.bond.petName).toBe("Biscuit");
  });
});

describe("full fire bar", () => {
  it("overheats only in the nasty tier, resets the bar and starts afterglow", () => {
    expect(bondStep({ affection: 50, heat: 95 }, { affection: 50, heat: 100 }, EMPTY_BOND, "cheeky", null, NOW, first)).toBeNull();
    const out = bondStep({ affection: 50, heat: 95 }, { affection: 50, heat: 100 }, EMPTY_BOND, "nasty", null, NOW, first)!;
    expect(out.overheat).toBe(true);
    expect(100 + out.heat!).toBe(HEAT_AFTER);
    expect(out.bond.overheats).toBe(1);
    expect(out.bond.afterglowUntil).toBe(NOW + AFTERGLOW_MS);
    expect(satisfied(out.bond, NOW + AFTERGLOW_MS + 60_000)).toBe(true);
    expect(out.bond.partnerAt).toBeUndefined();
  });

  it("at five hearts it makes you partners", () => {
    const out = bondStep({ affection: 95, heat: 97 }, { affection: 95, heat: 100 }, EMPTY_BOND, "nasty", null, NOW, first)!;
    expect(out.bond.partnerAt).toBe(NOW);
  });
});

describe("speciesEmoji", () => {
  it("maps fursonas", () => {
    expect(speciesEmoji("a red fox")).toBe("🦊");
    expect(speciesEmoji("snow leopard")).toBe("🐱");
    expect(speciesEmoji(undefined)).toBe("🙂");
  });
});

describe("pics he sends", () => {
  /** Small seeded PRNG so the run is repeatable but covers both branches. */
  const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  it("afterglow pics are flaccid; stills are never animated", () => {
    const outs = Array.from({ length: 300 }, (_, i) => bondStep({ affection: 50, heat: 95 }, { affection: 50, heat: 100 }, EMPTY_BOND, "nasty", null, NOW, seeded(i + 1))!);
    const still = outs.find((o) => o.sendPic && !o.sendPic.fallback)!;
    const video = outs.find((o) => o.sendPic?.fallback)!;
    expect(still.sendPic!.query).toMatch(/\bflaccid\b.*-animated/);
    expect(video.sendPic!.query).toMatch(/\bflaccid\b.* animated/);
    expect(video.sendPic!.fallback!.query).toMatch(/-animated/);
    expect(video.replies.some((r) => /film|record|video/i.test(r.text))).toBe(true);
  });
});
