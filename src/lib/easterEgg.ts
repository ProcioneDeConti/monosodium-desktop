/** The "cooter" easter egg's bookkeeping (components/SearchBar/EasterEggDialog.tsx). A plain
 *  localStorage counter - it's a novelty, not data worth a store or a backup slot. */

const SUMMONS_KEY = "cooter.summons";
const MUTED_KEY = "cooter.muted";

/** Summons at which the card turns golden and earns its title. */
export const GOLDEN_AT = 10;

export function getSummons(): number {
  return Number(localStorage.getItem(SUMMONS_KEY)) || 0;
}

let lastSummonAt = 0;

/** Records one more summon and returns the new total. Calls within a second of each other count
 *  once - React dev renders components twice, and that shouldn't double the tally. */
export function addSummon(): number {
  const now = Date.now();
  if (now - lastSummonAt < 1000) return getSummons();
  lastSummonAt = now;
  const next = getSummons() + 1;
  localStorage.setItem(SUMMONS_KEY, String(next));
  return next;
}

export function isGolden(summons: number): boolean {
  return summons >= GOLDEN_AT;
}

/** The typed-out headline - the classic line first, escalating with repeat visits. */
export function summonLine(summons: number): string {
  if (summons >= 50) return `${summons} times. At this point he should pay rent.`;
  if (summons >= 25) return "You know this isn't a real tag, right?";
  if (summons === GOLDEN_AT) return "Ten summons! He's gone GOLDEN.";
  if (summons > GOLDEN_AT) return "The golden one returns.";
  if (summons >= 5) return "You really like saying that word.";
  if (summons >= 2) return "Again?";
  return "Ah ah ah! You DID say the magic word";
}

/** Title on the card back, by summon count. */
export function summonTitle(summons: number): string {
  if (summons >= 50) return "Cooter Devotee";
  if (summons >= GOLDEN_AT) return "Cooter Connoisseur";
  if (summons >= 5) return "Regular";
  return "Curious Newcomer";
}

export function isEggMuted(): boolean {
  return localStorage.getItem(MUTED_KEY) === "1";
}

export function setEggMuted(muted: boolean) {
  localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
}
