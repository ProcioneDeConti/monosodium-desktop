// Pure logic for the Gus pet game (Games > "Pocket Gus"): a Tamagotchi-style Gus whose needs
// drain in real time, including while the app is closed - `advance()` replays the elapsed time
// from `updatedAt` in fixed steps whenever the game is opened or ticks. He never dies; neglect
// makes him filthy, grumpy and eventually sick, and medicine plus care bring him back.

import { MASCOT_NAME } from "./mascot";
import type { MascotMotion } from "./mascot";

export interface PetState {
  /** 0-100, higher = better, for all four needs. */
  hunger: number;
  hygiene: number;
  fun: number;
  energy: number;
  /** Messes on the floor waiting to be cleaned up (capped at MAX_MESSES). */
  messes: number;
  /** Meals still being digested - each one becomes a mess after DIGEST_MS. */
  gut: number;
  /** Digestion progress toward the next mess, ms. */
  digestMs: number;
  sick: boolean;
  asleep: boolean;
  bornAt: number;
  updatedAt: number;
}

export type PetNeed = "hunger" | "hygiene" | "fun" | "energy";

export const MAX_MESSES = 5;
const MAX_GUT = 4;
export const DIGEST_MS = 45 * 60_000;
const STEP_MS = 60_000;
/** Offline time replayed at most this far back - everything has bottomed out long before. */
const MAX_REPLAY_MS = 7 * 24 * 3600_000;
/** Messes at or above this (or a need at zero) make him sick. */
export const SICK_MESSES = 3;

/** Points lost per hour, awake / asleep. Negative = gained (sleep restores energy). */
const DECAY_PER_HOUR: Record<PetNeed, { awake: number; asleep: number }> = {
  hunger: { awake: 7, asleep: 3 },
  hygiene: { awake: 3, asleep: 1.5 },
  fun: { awake: 6, asleep: 0 },
  energy: { awake: 5, asleep: -25 },
};
/** Extra hygiene lost per hour per mess on the floor. */
const MESS_GRIME_PER_HOUR = 3;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function newPet(now: number): PetState {
  return {
    hunger: 80,
    hygiene: 90,
    fun: 80,
    energy: 90,
    messes: 0,
    gut: 0,
    digestMs: 0,
    sick: false,
    asleep: false,
    bornAt: now,
    updatedAt: now,
  };
}

function checkSick(s: PetState): boolean {
  return s.sick || s.messes >= SICK_MESSES || s.hunger <= 0 || s.hygiene <= 0;
}

/** Replays the time since `updatedAt` up to `now`. Asleep, he wakes on his own once rested. */
export function advance(state: PetState, now: number): PetState {
  let elapsed = Math.min(now - state.updatedAt, MAX_REPLAY_MS);
  if (elapsed <= 0) return state;
  const s = { ...state };
  while (elapsed > 0) {
    const dt = Math.min(STEP_MS, elapsed);
    elapsed -= dt;
    const hours = dt / 3600_000;
    const mode = s.asleep ? "asleep" : "awake";
    // Sick drains fun twice as fast - he feels lousy.
    s.hunger = clamp(s.hunger - DECAY_PER_HOUR.hunger[mode] * hours);
    s.hygiene = clamp(s.hygiene - (DECAY_PER_HOUR.hygiene[mode] + s.messes * MESS_GRIME_PER_HOUR) * hours);
    s.fun = clamp(s.fun - DECAY_PER_HOUR.fun[mode] * (s.sick ? 2 : 1) * hours);
    s.energy = clamp(s.energy - DECAY_PER_HOUR.energy[mode] * hours);
    if (s.gut > 0) {
      s.digestMs += dt;
      if (s.digestMs >= DIGEST_MS) {
        s.digestMs -= DIGEST_MS;
        s.gut -= 1;
        s.messes = Math.min(MAX_MESSES, s.messes + 1);
      }
    } else {
      s.digestMs = 0;
    }
    if (s.asleep && s.energy >= 100) s.asleep = false;
    s.sick = checkSick(s);
  }
  s.updatedAt = now;
  return s;
}

export type PetAction =
  | { type: "feed"; food: FoodId }
  | { type: "groom" }
  | { type: "bath" }
  | { type: "clean" }
  | { type: "play" }
  | { type: "pet" }
  | { type: "sleep" }
  | { type: "wake" }
  | { type: "medicine" };

export type FoodId = "trash" | "grapes" | "fish" | "cheesePuffs";

export interface FoodDef {
  label: string;
  emoji: string;
  hunger: number;
  fun: number;
  hygiene: number;
}

export const FOODS: Record<FoodId, FoodDef> = {
  trash: { label: "Dumpster dive", emoji: "🗑️", hunger: 30, fun: 10, hygiene: -15 },
  grapes: { label: "Grapes", emoji: "🍇", hunger: 20, fun: 0, hygiene: 0 },
  fish: { label: "Fish", emoji: "🐟", hunger: 35, fun: 5, hygiene: -5 },
  cheesePuffs: { label: "Cheese puffs", emoji: "🧀", hunger: 10, fun: 20, hygiene: -5 },
};

export interface ActionResult {
  state: PetState;
  /** Did it actually do anything (false = refused / nothing to do). */
  ok: boolean;
  line: string;
  motion: MascotMotion;
  emoji: string[];
}

const pick = <T>(xs: T[], rnd: () => number): T => xs[Math.floor(rnd() * xs.length) % xs.length];

/** Applies one care action at `now` (advancing first). `rnd` picks the line - injectable for tests. */
export function act(prev: PetState, action: PetAction, now: number, rnd: () => number = Math.random): ActionResult {
  const s = advance(prev, now);
  const refuse = (lines: string[], motion: MascotMotion = "shake"): ActionResult => ({
    state: s,
    ok: false,
    line: pick(lines, rnd),
    motion,
    emoji: [],
  });
  const done = (next: PetState, lines: string[], motion: MascotMotion, emoji: string[]): ActionResult => ({
    state: next,
    ok: true,
    line: pick(lines, rnd),
    motion,
    emoji,
  });

  if (s.asleep && action.type !== "wake" && action.type !== "clean") {
    return refuse(["Zzz… (he's asleep - let him rest or wake him up)"], "droop");
  }

  switch (action.type) {
    case "feed": {
      const food = FOODS[action.food];
      if (s.hunger >= 95) return refuse(["I'm stuffed. Couldn't eat another bite.", "Maybe later. My belly's full."]);
      if (s.sick && action.food !== "grapes") return refuse(["Ugh, not that. Something light?¦he's sick"], "droop");
      return done(
        {
          ...s,
          hunger: clamp(s.hunger + food.hunger),
          fun: clamp(s.fun + food.fun),
          hygiene: clamp(s.hygiene + food.hygiene),
          gut: Math.min(MAX_GUT, s.gut + 1),
        },
        action.food === "trash"
          ? ["A five-star dumpster. Exquisite.", "Ahh, vintage garbage.", "One raccoon's trash is… also this raccoon's treasure."]
          : action.food === "cheesePuffs"
            ? ["CHEESE DUST. On my paws. Forever.", "Orange fingers, happy heart."]
            : ["Nom nom nom.", "Delicious. Washing it first, obviously.", "Mmm, thank you!"],
        "hop",
        [food.emoji, "😋"],
      );
    }
    case "groom":
      if (s.hygiene >= 95) return refuse(["I'm already gorgeous.", "Any fluffier and I'll float away."]);
      return done(
        { ...s, hygiene: clamp(s.hygiene + 30), fun: clamp(s.fun + 5) },
        ["Ooh, right on the tail rings.", "Brush brush brush. Fabulous.", "Finally, someone appreciates the floof."],
        "nod",
        ["✨", "🪮"],
      );
    case "bath":
      if (s.hygiene >= 95) return refuse(["Already squeaky clean!"]);
      return done(
        { ...s, hygiene: 100, fun: clamp(s.fun - 5), energy: clamp(s.energy - 5) },
        ["Raccoons LOVE water. Mostly. Kind of.", "Splish splash. Wet raccoon smell incoming.", "I am now 40% smaller."],
        "jitter",
        ["🫧", "💧", "🛁"],
      );
    case "clean":
      if (s.messes === 0) return refuse(["Floor's already clean!"], "shrug");
      return done(
        { ...s, messes: 0, hygiene: clamp(s.hygiene + 5) },
        ["Uh… that wasn't me.", "Thanks. Let's never speak of this.", "Ahh, much better."],
        "shrug",
        ["🧹", "✨"],
      );
    case "play":
      if (s.energy < 15) return refuse(["Too… sleepy… to play.", "Five more minutes. Or hours."], "droop");
      if (s.sick) return refuse(["Not feeling up to it…¦he's sick"], "droop");
      return done(
        { ...s, fun: clamp(s.fun + 25), energy: clamp(s.energy - 12), hunger: clamp(s.hunger - 5) },
        ["Again! Again!", "Wheee!", "I win. I always win.", "Best. Game. Ever."],
        "spin",
        ["🎾", "🎉", "😆"],
      );
    case "pet":
      return done(
        { ...s, fun: clamp(s.fun + 4) },
        ["Hehe.", "Right behind the ears. Perfect.", "More of that, please."],
        "hop",
        ["❤️", "🥰"],
      );
    case "sleep":
      if (s.energy >= 90) return refuse(["Sleep? I'm wide awake!", "Bedtime is for the weak."]);
      return done({ ...s, asleep: true }, ["G'night…", "*yawn*… wake me for snacks."], "stretch", ["💤"]);
    case "wake":
      if (!s.asleep) return refuse(["I'm already up!"], "shrug");
      return done(
        { ...s, asleep: false, fun: clamp(s.fun - (s.energy < 60 ? 10 : 0)) },
        s.energy < 60 ? ["Hey! I was sleeping!", "Ugh. Five more minutes…"] : ["Morning! Breakfast?", "*big stretch* Rested!"],
        s.energy < 60 ? "shake" : "stretch",
        s.energy < 60 ? ["😾"] : ["☀️"],
      );
    case "medicine":
      if (!s.sick) return refuse(["I'm not sick! Yuck.", "Nope. Healthy as a raccoon."]);
      return {
        state: { ...s, sick: false, fun: clamp(s.fun - 5) },
        ok: true,
        line:
          s.messes >= SICK_MESSES
            ? "Bleh. Better… but this place needs a clean or I'll catch it again."
            : s.hunger <= 0 || s.hygiene <= 0
              ? "Bleh. Better… but I need some proper care."
              : pick(["Bleh! …but I do feel better.", "Tastes like the bad kind of trash. Thanks though."], rnd),
        motion: "shake",
        emoji: ["💊", "🤢"],
      };
  }
}

/** Medicine only cures - the next tick re-sickens him if the cause (mess, starving, filth) stays.
 *  Exposed so the UI can say why. */
export function sickCause(s: PetState): string | null {
  if (s.messes >= SICK_MESSES) return "the messes";
  if (s.hunger <= 0) return "hunger";
  if (s.hygiene <= 0) return "filth";
  return null;
}

/** His lowest need, if it's low enough to complain about. */
export function worstNeed(s: PetState): { need: PetNeed; value: number } | null {
  const needs: PetNeed[] = ["hunger", "hygiene", "fun", "energy"];
  const worst = needs.reduce((a, b) => (s[b] < s[a] ? b : a));
  return s[worst] < 35 ? { need: worst, value: s[worst] } : null;
}

export type PetMood = "sleeping" | "sick" | "miserable" | "grumpy" | "okay" | "happy";

export function mood(s: PetState): PetMood {
  if (s.asleep) return "sleeping";
  if (s.sick) return "sick";
  const avg = (s.hunger + s.hygiene + s.fun + s.energy) / 4;
  const low = Math.min(s.hunger, s.hygiene, s.fun, s.energy);
  if (low < 10 || avg < 25) return "miserable";
  if (low < 30 || avg < 50) return "grumpy";
  if (avg < 75) return "okay";
  return "happy";
}

/** Something he says unprompted now and then, from his state. */
export function idleLine(s: PetState, rnd: () => number = Math.random): string {
  if (s.asleep) return pick(["Zzz…", "*snore*", "Mmm… shiny… trash…"], rnd);
  if (s.sick) return pick(["I don't feel so good…", "*cough*… medicine?"], rnd);
  if (s.messes > 0 && rnd() < 0.5) return pick(["Something smells… not great.", "Uh, the floor. Just saying."], rnd);
  const worst = worstNeed(s);
  if (worst) {
    const lines: Record<PetNeed, string[]> = {
      hunger: ["My tummy's growling.", "Is it snack o'clock? It feels like snack o'clock.", "I could eat a whole dumpster."],
      hygiene: ["I'm getting a bit… crusty.", "My fur's all matted.", "Bath? Brush? Anything?"],
      fun: ["Booored.", "Play with me?", "Entertain me, human."],
      energy: ["*yawn*", "So… sleepy…", "Can I nap? I'm napping."],
    };
    return pick(lines[worst.need], rnd);
  }
  return pick(
    [
      `${MASCOT_NAME} is doing great!`,
      "Life's good.",
      "Thanks for looking after me.",
      "*washes paws for no reason*",
      "Found a bottle cap. Best day ever.",
    ],
    rnd,
  );
}

/** Whole days since he was "born" (first opened). */
export function ageDays(s: PetState, now: number): number {
  return Math.floor((now - s.bornAt) / (24 * 3600_000));
}
