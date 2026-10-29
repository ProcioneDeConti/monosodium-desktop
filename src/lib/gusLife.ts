// The parts of Gus that make him feel like he has a life around the chat (layered into gusChat.ts):
//   - episodes:    "I have an exam tomorrow" is remembered with a date, and he asks how it went
//                  next time you're back after it
//   - his day:     what he got up to today - stable for the day, so asking twice agrees
//   - browsing:    he notices what you've been looking at in the app (local stats only)
//   - catchphrases: little phrases you keep using, which he picks up (only while Learn is on)
//   - nudges:      what he says if you go quiet on him
// Pure functions; state lives in ChatMemory.
import type { Tier } from "./gusChatLines";
import { feeling, type Emotion } from "./gusIntents";

// ---- Episodes -----------------------------------------------------------------------------------

export interface Episode {
  what: string;
  /** When it happens (ms) - he asks about it after this. */
  due: number;
  /** When you told him. */
  at: number;
  asked?: boolean;
}

export const MAX_EPISODES = 12;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Older than this and asking would be weird. */
const STALE_MS = 10 * DAY;

const EVENT_NOUNS =
  "exam|test|final|finals|quiz|interview|job interview|appointment|doctor'?s appointment|dentist|surgery|date|first date|presentation|meeting|shift|game|match|concert|show|recital|audition|flight|trip|party|wedding|funeral|birthday|deadline|class|lecture|driving test|surgery|vet appointment|convention|con";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WHEN = "today|tonight|tomorrow|later|this (?:morning|afternoon|evening|weekend)|next week|on (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)";

const EPISODE_RES = [
  new RegExp(`\\b(?:i (?:have|got|'ve got|ve got)|i've got|ive got|there'?s) (?:a |an |my |this |the )?((?:big |huge |important |scary |first )?(?:\\w+ )?(?:${EVENT_NOUNS}))(?: \\w+)? (${WHEN})\\b`, "i"),
  new RegExp(`\\bmy ((?:\\w+ )?(?:${EVENT_NOUNS})) is (${WHEN})\\b`, "i"),
  new RegExp(`\\b(?:i'?m|im|i am) (?:going (?:to|on)|off to|heading to) (?:a |an |my |the )?((?:\\w+ )?(?:${EVENT_NOUNS}|the \\w+))(?: \\w+)? (${WHEN})\\b`, "i"),
  new RegExp(`\\b(${WHEN}) i (?:have|'ve got|got) (?:a |an |my )?((?:\\w+ )?(?:${EVENT_NOUNS}))\\b`, "i"),
];

/** "tomorrow" -> when that is, as ms. Things "today" are asked about a few hours on. */
export function whenToMs(when: string, now: number): number {
  const w = when.toLowerCase().replace(/^on /, "");
  const d = new Date(now);
  const noonIn = (days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 12).getTime();
  if (w === "today" || w === "later" || w.startsWith("this morning") || w.startsWith("this afternoon")) return now + 3 * HOUR;
  if (w === "tonight" || w === "this evening") return Math.max(now + 3 * HOUR, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 22).getTime());
  if (w === "tomorrow") return noonIn(1);
  if (w === "this weekend") return noonIn(((6 - d.getDay() + 7) % 7) || 7);
  if (w === "next week") return noonIn(7);
  const wd = WEEKDAYS.indexOf(w);
  if (wd >= 0) return noonIn(((wd - d.getDay() + 7) % 7) || 7);
  return now + 6 * HOUR;
}

/** "i have a chem exam tomorrow" -> { what: "chem exam", due: tomorrow noon }. */
export function parseEpisode(text: string, now: number): Episode | null {
  for (const [i, re] of EPISODE_RES.entries()) {
    const m = text.match(re);
    if (!m) continue;
    const [what, when] = i === 3 ? [m[2], m[1]] : [m[1], m[2]];
    return { what: what.toLowerCase().replace(/^(?:a|an|my|the) /, "").trim(), due: whenToMs(when, now), at: now };
  }
  return null;
}

export function rememberEpisode(list: Episode[], ep: Episode): Episode[] {
  return [...list.filter((e) => e.what !== ep.what), ep].slice(-MAX_EPISODES);
}

/** Something that's happened since you told him and he hasn't asked about yet. */
export function dueEpisode(list: Episode[], now: number): Episode | null {
  return list.find((e) => !e.asked && e.due <= now && now - e.due < STALE_MS) ?? null;
}

const pick = <T>(xs: T[], rnd: () => number) => xs[Math.floor(rnd() * xs.length)];

export function episodeAck(ep: Episode, now: number, rnd: () => number): string {
  const soon = ep.due - now < 8 * HOUR;
  return pick(
    soon
      ? [`Ooh, ${ep.what}! Good luck. Tell me how it goes, okay?`, `${cap(ep.what)}? You've got this. I'll want details after.`, `Noted. *ties a string around his tail* I'll ask you how the ${ep.what} went.`]
      : [`A ${ep.what}? I'll remember that. And I'll ask how it went, so prepare.`, `Got it, ${ep.what}. *scribbles it on a napkin* Good luck in advance!`, `Ooh. Nervous? I'll check in after your ${ep.what}.`],
    rnd,
  );
}

export function episodeAsk(ep: Episode, name: string | null, rnd: () => number): string {
  const n = name ? `, ${name}` : "";
  return pick([`Wait${n} - how did the ${ep.what} go?!`, `Before anything else: the ${ep.what}! How'd it go?`, `I remembered! How was your ${ep.what}?`, `So${n}… the ${ep.what}. Tell me everything.`], rnd);
}

/** His reaction to how it went. */
export function episodeOutcome(ep: Episode, answer: string, rnd: () => number, emotion?: Emotion): string {
  const f = feeling(answer);
  const mood = f.score > 0.15 || (f.score === 0 && emotion === "joy") ? "good" : f.score < -0.15 || (f.score === 0 && (emotion === "sad" || emotion === "angry")) ? "bad" : "meh";
  if (mood === "good") return pick([`YES! I knew it. *throws confetti made of receipts*`, `That's amazing! I'm so proud of you. *happy chitter*`, `Told you you'd crush the ${ep.what}! Celebratory trash snack?`], rnd);
  if (mood === "bad") return pick([`Oh no… I'm sorry. *gently pats your hand with a tiny paw* The ${ep.what} doesn't define you.`, `That sucks. Want to talk about it, or want me to distract you?`, `Ugh. Well, it's over now. I'm here. *sits closer*`], rnd);
  return pick([`Hm, okay! At least it's done, right?`, `Glad you got through it. Nothing exciting, huh?`, `Mixed bag, then. That's most things, honestly.`], rnd);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- His day ------------------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const DAY_EVENTS: Record<"morning" | "any" | "night", string[]> = {
  morning: [
    "woke up inside a cereal box. Not sure how. Not complaining",
    "watched the sunrise from the top of a dumpster. Very romantic. Alone, but romantic",
    "had a staring contest with a pigeon. I lost",
  ],
  any: [
    "found half a pizza crust behind the bakery - a good day already",
    "got chased off a porch by a very small dog. I let him win",
    "washed a grape in a puddle for ten minutes, then dropped it",
    "reorganised my bottle cap collection. By shininess",
    "learned the new recycling bins have a latch. I'm working on it",
    "napped in a flower pot. Someone watered me",
    "saw another raccoon across the street and we just… nodded. Respect",
    "tried to open a jar for an hour. The jar is winning",
    "found a sock. Just one. It's mine now",
    "hid from the rain under a car and made friends with a cat. Sort of",
    "spent the afternoon browsing posts with you, basically",
  ],
  night: [
    "did my big bin rounds. Tuesday-style bins on a not-Tuesday. Weird night",
    "climbed a fence I definitely wasn't supposed to",
    "watched a moth for an hour. Best show in town",
  ],
};

/** What he got up to today - the same answer all day. */
export function gusDay(now: Date): string[] {
  const seed = hash(now.toDateString());
  const pool = DAY_EVENTS.any;
  const a = pool[seed % pool.length];
  const b = pool[(seed >>> 8) % pool.length];
  // Late in the day, the night's adventures are part of it too.
  const night = now.getHours() >= 20 ? DAY_EVENTS.night[(seed >>> 16) % DAY_EVENTS.night.length] : null;
  const morning = DAY_EVENTS.morning[(seed >>> 16) % DAY_EVENTS.morning.length];
  return [...new Set([seed % 3 === 0 ? morning : a, b, ...(night ? [night] : [])])].slice(0, 2);
}

export const GUS_DAY_RE =
  /\b(how (?:was|is|'?s) your (?:day|morning|night|evening|afternoon|week)|what did you do (?:today|all day)|what have you been (?:up to|doing)|what(?:'?ve| have) you been up to|anything new|what'?s new( with you)?|do anything (?:fun|cool) today|how was your weekend)\b/i;

export function gusDayReply(now: Date, rnd: () => number): string {
  const [a, b] = gusDay(now);
  const lead = pick(["Oh, big day.", "Honestly? Eventful.", "Glad you asked!", "Mm, let's see."], rnd);
  return b ? `${lead} I ${a}. Oh, and I ${b}.` : `${lead} I ${a}.`;
}

/** Brought up unprompted, once a session. */
export function gusDayAside(now: Date, rnd: () => number): string {
  return `${pick(["Oh! I forgot to tell you - today I", "Random, but today I", "Update from my life: I"], rnd)} ${pick(gusDay(now), rnd)}.`;
}

// ---- What you've been browsing -------------------------------------------------------------------

export interface BrowseStats {
  todayViews: number;
  todaySearches: number;
  topSearches: string[];
  topArtist?: string;
  topCharacter?: string;
}

const pretty = (t: string) => t.replace(/_/g, " ").replace(/\s+\(.*\)$/, "");

/** A remark about what you've been looking at, or null if there's nothing worth saying. */
export function browseQuip(s: BrowseStats, tier: Tier, rnd: () => number): string | null {
  const options: string[] = [];
  if (s.todayViews >= 150) options.push(`${s.todayViews} posts today. I counted. Hydrate, maybe?`, `You've looked at ${s.todayViews} posts today. Even I take breaks. Sometimes.`);
  else if (s.todayViews >= 40) options.push(`Busy browsing day, huh? ${s.todayViews} posts so far.`);
  if (s.topArtist) options.push(`You really like ${pretty(s.topArtist)}'s stuff, huh? I see you opening it.`, `${cap(pretty(s.topArtist))} again? You have taste. I'll allow it.`);
  if (s.topCharacter) options.push(`You and ${pretty(s.topCharacter)}… should I be jealous?`, `I've noticed a lot of ${pretty(s.topCharacter)} lately. Just saying.`);
  if (s.topSearches[0]) options.push(tier === "clean" ? `Let me guess, searching "${pretty(s.topSearches[0])}" again later?` : `"${pretty(s.topSearches[0])}" is your top search. I'm not judging. *judges a little*`);
  if (s.todaySearches >= 20) options.push(`${s.todaySearches} searches today! Looking for something specific?`);
  return options.length ? pick(options, rnd) : null;
}

// ---- Catchphrases --------------------------------------------------------------------------------

const BORING = /^(?:i (?:am|have|was|do|dont|think|want)|do you|you are|are you|it is|i m|what is|is it|of the|in the|to the|and i|i dont know)$/;

/** Counts the 2-3 word phrases you use; phrases said 3+ times are "yours". */
export function countPhrases(counts: Record<string, number>, text: string): Record<string, number> {
  const ws = text.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
  const next = { ...counts };
  const seen = new Set<string>();
  for (let n = 2; n <= 3; n++)
    for (let i = 0; i + n <= ws.length; i++) {
      const p = ws.slice(i, i + n).join(" ");
      if (BORING.test(p) || seen.has(p) || p.length < 6) continue;
      seen.add(p);
      next[p] = (next[p] ?? 0) + 1;
    }
  // Keep the most used ones only.
  const kept = Object.entries(next).sort((a, b) => b[1] - a[1]).slice(0, 80);
  return Object.fromEntries(kept);
}

export function catchphrase(counts: Record<string, number>, rnd: () => number): string | null {
  const yours = Object.entries(counts).filter(([, c]) => c >= 3).map(([p]) => p);
  return yours.length ? pick(yours, rnd) : null;
}

export function echoPhrase(p: string, rnd: () => number): string {
  return pick([`…or as you'd say, "${p}".`, `"${p}", like you always say. See, I listen.`, `*in your voice* "${p}."`], rnd);
}

// ---- Going quiet ---------------------------------------------------------------------------------

export function idleNudge(rnd: () => number, extra: (string | null)[] = []): string {
  const lines = ["You still there?", "*pokes you with a stick*", "Helloooo?", "*waves a paw in front of the screen*", "Did you fall asleep on me?", "*taps the glass* …are you thinking or are you gone?"];
  const real = extra.filter((x): x is string => !!x);
  return real.length && rnd() < 0.6 ? pick(real, rnd) : pick(lines, rnd);
}

// ---- Babble quality ------------------------------------------------------------------------------

const BAD_END = /\b(?:the|a|an|and|or|but|of|to|my|your|with|for|in|on|at|is|are|i|so|that|if|when|than|because)[,.!?…]*$/i;

/** Markov output that reads like a sentence - not trailing off on "the", no dangling quotes or
 *  asterisks, no doubled words. */
export function wellFormed(s: string): boolean {
  const t = s.trim();
  if (BAD_END.test(t)) return false;
  if ((t.match(/\*/g) ?? []).length % 2) return false;
  if ((t.match(/"/g) ?? []).length % 2) return false;
  if (/\b(\w+) \1\b/i.test(t)) return false;
  if (/\(/.test(t) !== /\)/.test(t)) return false;
  return true;
}
