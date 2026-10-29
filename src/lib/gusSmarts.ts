// Gus's "smarts" for the chat engine (gusChat.ts): input clean-up, short-term conversation state
// (what he just asked, what you were talking about), general facts about you, and the things he
// can actually look up or work out - your browsing stats, a tag's post count, dates and sums.

import type { Mood } from "./gusBrain";
import { listJoin, type Tier } from "./gusChatLines";

// ---- Input clean-up ---------------------------------------------------------------------------

const SLANG: Record<string, string> = {
  u: "you",
  ya: "you",
  luv: "love",
  wat: "what",
  wut: "what",
  whats: "what's",
  thats: "that's",
  dont: "don't",
  cant: "can't",
  wont: "won't",
  didnt: "didn't",
  doesnt: "doesn't",
  isnt: "isn't",
  ive: "i've",
  cuz: "because",
  coz: "because",
  bc: "because",
  pls: "please",
  plz: "please",
  idk: "i don't know",
  rn: "right now",
  favourite: "favorite",
  favourites: "favorites",
  colour: "color",
  gud: "good",
  ppl: "people",
  tho: "though",
  thx: "thanks",
  kk: "ok",
  hru: "how are you",
  wyd: "what are you doing",
  wbu: "what about you",
  hbu: "how about you",
};

/** Tidies chat-speak so the rules see one spelling: "soooo" -> "so", "u" -> "you", "idk" ->
 *  "i don't know". Case and punctuation are kept. */
export function normalize(text: string): string {
  return text
    .trim()
    .replace(/([a-z])\1{2,}/gi, "$1")
    .replace(/[a-z']+/gi, (w) => {
      const sub = SLANG[w.toLowerCase()];
      return sub ?? w;
    })
    .replace(/\s+/g, " ");
}

// ---- Conversation state -----------------------------------------------------------------------

/** Something Gus just asked, so a bare answer to it makes sense ("Sam", "yes", "otters"). */
export type Expect =
  | { kind: "name" }
  | { kind: "like" }
  | { kind: "talk" }
  | { kind: "vent" }
  | { kind: "joke" }
  | { kind: "fact"; key: string }
  | { kind: "tod" }
  | { kind: "truth" }
  | { kind: "dare" }
  | { kind: "wyr"; a: string; b: string };

/** Per-session, not persisted. */
export interface ConvState {
  expect: Expect | null;
  /** Your last message, to catch repeats. */
  lastInput?: string;
  /** The babbler keywords of the last message that had any - follow-ups like "why?" or "tell
   *  me more" carry no keywords of their own. */
  topic: string;
  /** What he last gave a take on, so "why?" gets a reason instead of babble. */
  subject?: { x: string; mood: Mood };
  /** Subjects talked about this session, oldest first - for "what did we talk about?". */
  topics?: string[];
}

export const EMPTY_CONV: ConvState = { expect: null, topic: "" };

/** States, not names: "i'm bored" isn't someone called Bored. */
const NOT_NAME_WORDS =
  /^(?:here|back|home|done|ok|okay|fine|good|great|bad|sad|mad|bored|tired|sleepy|hungry|horny|sick|sorry|lost|confused|new|single|gay|bi|straight|trans|old|young|alive|dead|cold|hot|warm|busy|free|ready|alone|lonely|drunk|high|stoned|broke|late|early|serious|kidding|joking|curious|scared|nervous|stressed|anxious|happy|excited|fat|short|tall|human|real|a|an|the|not|so|very|just|really|also|still|gonna|going|back|out|in|up|down|on|off|over|stuck|right|wrong|sure|glad|proud|cute|weird|dumb|stupid|smart|hard|wet|naked|nude|afk|ace|male|female|nb|enby|gus|you|it|that|me|fun|nice|cool|wild|crazy|insane|awesome|amazing|perfect|lit|sus|bad|cringe|based|ill|well|better|worse|safe|okay|alright|finished|naughty|kinky|furry|single|taken|married)$/i;

/** "hi, i'm Alex" / "im alex" -> "Alex". A single word that isn't a state or an ordinary word
 *  Gus knows (his babbler's vocabulary), or that was typed with a capital. Null otherwise. */
export function introName(input: string, knows: (w: string) => boolean): string | null {
  const m = input.match(/^(?:(?:hi|hey|hello|yo|heya|hiya)[,!]?\s+(?:gus[,!]?\s+)?)?(?:i'?m|im|i am|this is)\s+([a-z][\w'-]{1,20})[.!]*$/i);
  if (!m || NOT_NAME_WORDS.test(m[1]) || /(?:ing|ed|ly|ful|ish|ous|less|ive|able)$/i.test(m[1])) return null;
  const capped = /^[A-Z][a-z]/.test(m[1]);
  if (!capped && knows(m[1].toLowerCase())) return null;
  return m[1].charAt(0).toUpperCase() + m[1].slice(1);
}

export const YES_RE = /^(yes|yeah|yep|yup|sure|ok|okay|please|go on|go ahead|another|more|again|do it|y|why not|of course|definitely)\b/i;
export const NO_RE = /^(no|nope|nah|not really|i'?m good|no thanks|never mind|nevermind|n)\b/i;

/** A bare answer to "what should I call you?" - "Sam", "it's Sam", "call me Sam". */
export function answerName(text: string): string | null {
  const t = text.replace(/^(it'?s|i'?m|im|call me|my name is|name'?s|just)\s+/i, "").replace(/[.!]+$/, "");
  const words = t.split(/\s+/);
  if (words.length > 2 || YES_RE.test(t) || NO_RE.test(t) || t.endsWith("?")) return null;
  return /^[a-z][\w'-]{1,20}$/i.test(words[0]) ? words[0].charAt(0).toUpperCase() + words[0].slice(1) : null;
}

/** A bare answer to "what are you into?" - "otters", "i like otters", "mostly dragons". */
export function answerLike(text: string): string | null {
  const t = text
    .replace(/^(i (really )?(like|love|enjoy|am into|'m into)|probably|um+|uh+|mostly|hmm+|definitely)\s+/i, "")
    .replace(/[.!]+$/, "");
  if (t.split(/\s+/).length > 6 || t.endsWith("?") || NO_RE.test(t) || /^(you|nothing|idk)\b/i.test(t)) return null;
  return t.length >= 2 ? t : null;
}

// ---- Facts about you --------------------------------------------------------------------------

const FACT_RE = /^my ([a-z][a-z ]{1,30}?)(?:'s name| name)? (?:is|are|'s) (?:called |named )?(.{1,40}?)[.!]*$/i;
const FACT_Q_RE = /^(?:what'?s|what is|what are|do you (?:know|remember)|remember) my ([a-z][a-z ]{1,30}?)(?:'s name| name|'s called| called| named)?\??$/i;
/** "my X is Y" where X is really a feeling, not a fact. */
const NOT_FACT_KEYS = new Set(["name", "life", "day", "head", "heart", "back", "stomach", "tummy", "brain"]);

/** "my favorite color is blue" -> ["favorite color", "blue"]. */
export function parseFact(text: string): [string, string] | null {
  const m = text.match(FACT_RE);
  if (!m) return null;
  const key = m[1].trim().toLowerCase();
  if (NOT_FACT_KEYS.has(key)) return null;
  return [key, m[2].trim()];
}

/** "what's my favorite color?" -> "favorite color". */
export function parseFactQuestion(text: string): string | null {
  const key = text.match(FACT_Q_RE)?.[1]?.trim().toLowerCase();
  return key && key !== "name" ? key : null;
}

export const DO_I_LIKE_RE = /^do i (?:like|love|enjoy|hate) (.+?)\??$/i;

// ---- Practical answers ------------------------------------------------------------------------

const MATH_RE =
  /^(?:what'?s|what is|calculate|how much is|whats)\s+(-?\d+(?:\.\d+)?)\s*(\+|-|\*|x|×|times|plus|minus|divided by|over|\/)\s*(-?\d+(?:\.\d+)?)\s*\??$/i;

/** "what's 12 x 3?" -> "36", or a joke for dividing by zero. Null when it isn't a sum. */
export function mathAnswer(text: string): string | null {
  const m = text.match(MATH_RE);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  const op = m[2].toLowerCase();
  let n: number;
  if (op === "+" || op === "plus") n = a + b;
  else if (op === "-" || op === "minus") n = a - b;
  else if (op === "*" || op === "x" || op === "×" || op === "times") n = a * b;
  else {
    if (b === 0) return "Divide by zero? That's how raccoons get banned from the library.";
    n = a / b;
  }
  const shown = Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const quips = ["I counted on my fingers.", "Raccoon math. Trust me.", "Easy. I have very clever paws.", "Carry the trash…"];
  return `${shown}. ${quips[Math.abs(Math.round(a + b)) % quips.length]}`;
}

const DATE_RE = /\bwhat(?:'s| is) (?:the )?date\b|\bwhat day is (?:it|today)\b|\bwhat(?:'s| is) today\b/i;

export function dateAnswer(text: string, now: Date): string | null {
  if (!DATE_RE.test(text)) return null;
  const day = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return now.getDay() === 5 || now.getDay() === 6 ? `It's ${day}. Weekend dumpster night!` : `It's ${day}.`;
}

// ---- Your browsing stats ----------------------------------------------------------------------

export interface ChatStats {
  topSearches: string[];
  postsViewed: number;
  favoritesAdded: number;
  searches: number;
  activeMs: number;
  sessions: number;
}

function hours(ms: number): string {
  const h = ms / 3600_000;
  return h < 1 ? `${Math.max(1, Math.round(ms / 60_000))} minutes` : `${h < 10 ? h.toFixed(1) : Math.round(h)} hours`;
}

/** Answers questions about your own browsing, from the local stats. Null if it isn't one. */
export function statsAnswer(text: string, s: ChatStats, tier: Tier): string | null {
  const cheeky = tier !== "clean";
  if (/\bwhat do i (?:search|look up|look for)(?: for)?(?: the)? most\b|\bmy (?:top|most common|favorite) searches\b|\bwhat do i search\b/i.test(text)) {
    if (!s.topSearches.length) return "You haven't searched for anything yet! Go on, I won't judge.";
    const list = listJoin(s.topSearches.map((t) => t.replace(/_/g, " ")));
    return cheeky ? `Mostly ${list}. I've noticed. I notice everything.` : `Mostly ${list}. Good taste.`;
  }
  if (/\bhow many posts (?:have i|did i|i'?ve) (?:seen|viewed|looked at|watched)\b/i.test(text)) {
    return `${s.postsViewed.toLocaleString()} posts! ${cheeky ? "Your eyes must be tired. Among other things." : "That's a lot of art."}`;
  }
  if (/\bhow (?:long|much time) (?:have i|did i|i'?ve) (?:spent|been|browsed|spend|wasted)\b/i.test(text)) {
    return `About ${hours(s.activeMs)} across ${s.sessions.toLocaleString()} sessions. ${cheeky ? "Time well spent. Mostly." : "I was there for all of it."}`;
  }
  if (/\bhow many (?:favorites|favs|faves) (?:have i|did i|i'?ve)\b/i.test(text)) {
    return `You've added ${s.favoritesAdded.toLocaleString()} favorites since I started counting.`;
  }
  if (/\bhow many (?:searches|times have i searched)\b/i.test(text)) {
    return `${s.searches.toLocaleString()} searches. Curious little thing, aren't you.`;
  }
  return null;
}

// ---- Tag counts (looked up live by the chat UI) ------------------------------------------------

const COUNT_RE = [
  /^how many (.+?) (?:posts|pics|pictures|images|arts?)(?: (?:are there|exist|is there|on here|on e621|on e6ai))?\??$/i,
  /^how many posts (?:are )?(?:tagged|of|with|for) (.+?)(?: are there)?\??$/i,
  /^how many (.+?) (?:are there|exist|is there)\??$/i,
];

/** "how many fox posts are there?" -> the phrase to turn into a tag ("fox"). */
export function parseCountQuestion(text: string): string | null {
  for (const re of COUNT_RE) {
    const m = text.match(re);
    if (m && !/\b(i|my|me|you|your)\b/i.test(m[1])) return m[1];
  }
  return null;
}

/** Gus's line once the tag count comes back (null count = no such tag). */
export function tagCountReply(tag: string, count: number | null, tier: Tier): string {
  const pretty = tag.replace(/_/g, " ");
  if (count === null || count === 0) return `Hmm, I can't find any "${pretty}" posts. Is that a real tag?`;
  const n = count.toLocaleString();
  if (count > 100_000) return tier !== "clean" ? `${n} ${pretty} posts. The people have spoken. Loudly.` : `${n}! ${pretty} is huge.`;
  if (count > 5_000) return `${n} ${pretty} posts. Plenty to keep you busy.`;
  if (count > 100) return `${n} ${pretty} posts. A nice little collection.`;
  return `Only ${n} ${pretty} posts. Rare stuff!`;
}

// ---- Quick replies ------------------------------------------------------------------------------

const STARTERS = ["What can you do?", "Tell me a joke", "Truth or dare", "Would you rather", "Roast me", "What's popular?"];

/** Tap-to-send suggestions under the chat: answers to what he just asked, or a few conversation
 *  starters while the chat is young. Empty when there's nothing useful to suggest. */
export function quickReplies(expect: Expect | null, youSaid: number): string[] {
  switch (expect?.kind) {
    case "tod":
      return ["Truth", "Dare"];
    case "wyr":
      return [cap(expect.a), cap(expect.b)];
    case "joke":
      return ["Another one!", "No more jokes"];
    case "talk":
      return ["Yeah, I need to vent", "No, I'm okay"];
  }
  return youSaid < 3 && !expect ? STARTERS : [];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
