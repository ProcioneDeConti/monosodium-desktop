// Gus's chat brain (Games > "Talk to Gus") - a layered, deterministic-ish chatbot, no LLM:
//   1. intents     - "show me foxes" runs a search, "what's popular" opens Popular
//   2. memory      - remembers your name and what you like/dislike (Infobot-style)
//   3. rules       - hand-written personality (gusChatLines.ts), tiered clean/cheeky/nasty and
//                    shaded by how much he likes you (affection)
//   4. reflections - ELIZA-style "I feel X" -> "Why do you feel X?"
//   5. babble      - MegaHAL-style Markov remix around your keywords (gusMarkov.ts)
// Under the rules sits a fuzzy matcher (gusIntents.ts, or the optional embedding model in
// gusSemantic.ts) for wordings the regexes miss, and gusLife.ts gives him a memory for upcoming
// events, a day of his own, and an eye on what you've been browsing.
// Plus his Pocket Gus needs leak into the conversation, and talking to him affects them.

import { Babbler } from "./gusMarkov";
import { feeling, fuzzyIntent } from "./gusIntents";
import { afterglow, afterglowAside, bondStep, EMPTY_BOND, hasFiveHearts, petNameAck, petNameAnswer, type Bond } from "./gusBond";
import {
  browseQuip,
  catchphrase,
  countPhrases,
  dueEpisode,
  echoPhrase,
  episodeAck,
  episodeAsk,
  episodeOutcome,
  GUS_DAY_RE,
  gusDayAside,
  gusDayReply,
  parseEpisode,
  rememberEpisode,
  wellFormed,
  type BrowseStats,
  type Episode,
} from "./gusLife";
import type { SemanticHint } from "./gusSemantic";
import {
  aboutSelf,
  answerGame,
  because,
  chatGame,
  cooledHeat,
  favorite,
  FILLER_RE,
  oracle,
  opinion,
  recap,
  special,
  steer,
  themed,
  WHY_RE,
  type BrainCtx,
  type BrainOut,
  type Known,
  type PicRequest,
} from "./gusBrain";
import { CORPUS, LINES, RULES, type Line, type Lines, type Stage, type Tier } from "./gusChatLines";
import type { PetAction, PetState } from "./gusPet";
import { REACTIONS, type MascotMotion } from "./mascot";
import {
  answerLike,
  answerName,
  dateAnswer,
  DO_I_LIKE_RE,
  EMPTY_CONV,
  introName,
  mathAnswer,
  normalize,
  NO_RE,
  ASK_BACK_RE,
  GUS_ANSWERS,
  parseCountQuestion,
  parseDefineQuestion,
  parseFact,
  parseFactQuestion,
  statsAnswer,
  YES_RE,
  type ChatStats,
  type ConvState,
  type Expect,
} from "./gusSmarts";
import { SPICY_LINES } from "./mascotSpicy";

export type { Stage, Tier };

export interface ChatMemory {
  name: string | null;
  likes: string[];
  dislikes: string[];
  /** 0-100. Flirting and kindness raise it, rudeness drops it. */
  affection: number;
  /** He sulks until this time (ms) unless you apologise. */
  huffyUntil: number;
  /** "my favorite color is blue" -> { "favorite color": "blue" }. */
  facts: Record<string, string>;
  /** 0-100: how worked up he is. Builds with flirting, cools with time (see gusBrain). */
  heat: number;
  heatAt: number;
  /** When you last said anything - his greeting depends on how long you've been gone. */
  lastSeen: number;
  /** Things coming up for you that he'll ask about afterwards (gusLife). */
  episodes: Episode[];
  /** Phrase -> times you've used it; only counted while Learn is on (gusLife's catchphrases). */
  phrases: Record<string, number>;
  /** What maxing him out has unlocked (gusBond). */
  bond: Bond;
}

export const EMPTY_MEMORY: ChatMemory = {
  name: null,
  likes: [],
  dislikes: [],
  affection: 10,
  huffyUntil: 0,
  facts: {},
  heat: 0,
  heatAt: 0,
  lastSeen: 0,
  episodes: [],
  phrases: {},
  bond: EMPTY_BOND,
};
const MAX_FACTS = 40;

export interface ChatCtx {
  tier: Tier;
  stage: Stage;
  name: string | null;
  likes: string[];
  dislikes: string[];
  pet: PetState | null;
  now: Date;
  ageDays: number;
}

export interface GusReply {
  text: string;
  motion?: MascotMotion;
  emoji?: string[];
  /** He types, stops, and types again before this one (a nervous moment). */
  hesitate?: boolean;
}

export interface ChatResult {
  replies: GusReply[];
  memory: ChatMemory;
  petActions: PetAction[];
  /** Run this as a normal search (closes the Games panel). */
  search?: string;
  openPopular?: boolean;
  /** Look up this tag's post count and say it (see gusSmarts' tagCountReply). */
  lookup?: { tag: string; kind?: "count" | "wiki" };
  /** Fetch a random post for this search and send it as a picture (or video), then say `after`. */
  sendPic?: PicRequest;
  conv: ConvState;
  /** The fire bar just maxed out (gusBond) - the chat flashes it. */
  overheat?: boolean;
}

export interface ChatEnv {
  tier: Tier;
  pet: PetState | null;
  ageDays: number;
  now: number;
  babbler: Babbler | null;
  /** Lines said recently - avoided when there's a choice. */
  recent: ReadonlySet<string>;
  conv?: ConvState;
  stats?: ChatStats;
  /** Today's browsing, for remarks about it. */
  browse?: BrowseStats;
  /** What the embedding model made of the message, when it's loaded (gusSemantic). */
  semantic?: SemanticHint | null;
  /** Learn is on: count your phrases, and he may echo them (same gate as learned babble). */
  learn?: boolean;
}

/** An embedding-model intent match needs at least this similarity to count. */
const SEMANTIC_MIN = 0.6;
/** When the alternative is echoing your sentence back, a weaker intent match is still preferred. */
const SEMANTIC_ECHO_MIN = 0.5;

const MAX_LIST = 20;
const HUFFY_MS = 90_000;

export function stageFor(affection: number): Stage {
  return affection >= 65 ? "crush" : affection >= 25 ? "friend" : "stranger";
}

// ---- Text helpers ------------------------------------------------------------------------------

const REFLECT: Record<string, string> = {
  i: "you",
  me: "you",
  my: "your",
  mine: "yours",
  am: "are",
  "i'm": "you're",
  im: "you're",
  myself: "yourself",
  you: "me",
  your: "my",
  yours: "mine",
  "you're": "I'm",
  youre: "I'm",
  yourself: "myself",
  are: "am",
  ur: "my",
};

/** Flips pronouns so a captured phrase can be said back: "my cat hates me" -> "your cat hates you". */
export function reflect(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => REFLECT[w.toLowerCase()] ?? w)
    .join(" ")
    .replace(/[.!?]+$/, "");
}

/** A line you said, retold from Gus's side so the babbler can reuse it: "I love you, are you
 *  mine?" -> "you love me, am I yours?". Grammar-aware where reflect() isn't - "you are" becomes
 *  "I am", not "me am". */
export function ownVoice(text: string): string {
  return text
    .replace(/\b(I am|I'm|Im|you are|you're|youre|are you|am I)\b/gi, (m) => {
      const k = m.toLowerCase();
      // \0 marks a word as already flipped, so the word-by-word pass below leaves it alone.
      return k === "are you" ? "am\0 I\0" : k === "am i" ? "are\0 you\0" : /^(i am|i'm|im)$/.test(k) ? "you're\0" : "I'm\0";
    })
    // "You" as a subject (sentence/clause start) becomes "I"; elsewhere reflect() makes it "me".
    .replace(/(^|[.!?,]\s*|\b(?:and|but|so|because|if|when|that)\s+)you\b(?!'re)/gi, "$1I\0")
    .split(/(\s+)/)
    .map((w) => {
      if (w.includes("\0")) return w;
      const m = w.match(/^([A-Za-z']+)(.*)$/);
      if (!m || /^(am|are)$/i.test(m[1])) return w;
      const r = REFLECT[m[1].toLowerCase()];
      return r ? r + m[2] : w;
    })
    .join("")
    .replace(/\0/g, "");
}

const pick = <T>(xs: T[], rnd: () => number): T => xs[Math.floor(rnd() * xs.length) % xs.length];

function render(line: Line, ctx: ChatCtx, cap: string): string | null {
  const text = typeof line === "function" ? line(ctx) : line;
  if (!text) return null;
  const name = ctx.name ?? (ctx.stage === "crush" ? "cutie" : "buddy");
  return text.split("{name}").join(name).split("{1}").join(cap);
}

/** One rendered line from a list, preferring ones he hasn't said lately. */
function choose(lines: Line[], ctx: ChatCtx, env: ChatEnv, rnd: () => number, cap = "that"): string | null {
  const rendered = lines.map((l) => render(l, ctx, cap)).filter((t): t is string => !!t);
  if (!rendered.length) return null;
  const fresh = rendered.filter((t) => !env.recent.has(t));
  const line = capitalise(pick(fresh.length ? fresh : rendered, rnd));
  // Out of fresh lines: sometimes he notices he's repeating himself.
  return !fresh.length && rnd() < 0.3 ? `${line} ${pick(REPEAT_ASIDES, rnd)}` : line;
}

const REPEAT_ASIDES = ["…I keep saying that, huh.", "(Déjà vu? Yeah, I said that before.)", "…okay, I need new material."];

/** Which tier's lines to use: nasty most of the time when allowed, cheeky often, clean otherwise. */
function tierLines(lines: Lines, tier: Tier, rnd: () => number, heat = 50): Line[] {
  if (tier === "nasty" && lines.hot?.length && heat >= 60 && rnd() < 0.75) return lines.hot;
  // The hotter he is, the more often the nasty lines win.
  if (tier === "nasty" && lines.nasty?.length && rnd() < 0.35 + (0.6 * heat) / 100) return lines.nasty;
  // Opted into nasty, he's never prudish: cool, he teases (cheeky) rather than going clean.
  if (tier === "nasty") {
    if (lines.cheeky?.length) return lines.cheeky;
    if (lines.nasty?.length) return lines.nasty;
  }
  if (tier !== "clean" && lines.cheeky?.length && rnd() < 0.6) return lines.cheeky;
  return lines.clean;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Intents ----------------------------------------------------------------------------------

const SEARCH_RE =
  /^(?:(?:hey\s+)?gus[,!]?\s+)?(?:(?:can|could|would|will) you\s+|please\s+)?(?:show|find|search(?:\s+for)?|look\s+(?:for|up)|fetch|gimme|give me|i (?:want|wanna) (?:to )?see|let me see|let'?s see)\s+(?:me\s+)?(.+?)[.!?]*$/i;
/** Things after "show me" that are about Gus, not a search. */
const NOT_SEARCH =
  /^(?:(?:a|an|some|me)\s+)?(?:you|your|yourself|ur|how|what|why|where|who|love|affection|mercy|the way|around|hug|hugs|kiss|kisses|cuddles?|smooch|break|chance|minute|sec|second|moment|hint|clue|reason|attention|snacks?|food|treats?|nudes?|nude pics?|naked pics?|lewds?|dick pics?|cock pics?|thirst traps?|spicy pics?)\b/i;
const FILLER = /\b(?:some|any|a|an|the|more|of|pics?|pictures?|images?|posts?|art|artwork|stuff|things|porn|please|pls|plz)\b/gi;

function singular(word: string): string {
  if (/ies$/.test(word) && word.length > 4) return word.replace(/ies$/, "y");
  if (/ves$/.test(word)) return word.replace(/ves$/, "f");
  if (/(x|ch|sh|ss)es$/.test(word)) return word.replace(/es$/, "");
  if (/[^s]s$/.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

function phraseToTag(phrase: string): string | null {
  const words = phrase.replace(FILLER, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join("_").toLowerCase().replace(/[^a-z0-9_()'-]/g, "");
}

/** "show me red foxes and wolves without humans" -> "red_fox wolf -human". Null if it isn't a search. */
export function parseSearch(text: string): string | null {
  const m = text.trim().match(SEARCH_RE);
  if (!m || NOT_SEARCH.test(m[1])) return null;
  const [want, ...nots] = m[1].split(/\b(?:without|but not|but no|except|minus|no)\b/i);
  const tags = want
    .split(/,|&|\band\b|\bwith\b/i)
    .map(phraseToTag)
    .filter((t): t is string => !!t);
  const excluded = nots
    .flatMap((n) => n.split(/,|&|\band\b|\bor\b/i))
    .map(phraseToTag)
    .filter((t): t is string => !!t)
    .map((t) => `-${t}`);
  if (!tags.length) return null;
  return [...tags, ...excluded].join(" ");
}

const POPULAR_RE = /\b(?:what'?s|whats|what is|show me what'?s)\s+(?:popular|hot|trending)\b|\bpopular (?:posts|today|right now)\b/i;

// ---- Memory capture -----------------------------------------------------------------------------

const NAME_RE = /\b(?:my name is|my name's|call me|i'?m called|you can call me|name'?s)\s+([a-z][\w'-]{1,20})/i;
const NOT_NAMES = new Set(["not", "a", "an", "the", "just", "your", "so", "very", "really", "gonna", "going"]);
const LIKE_RE = /\bi (?:really |also |totally |do )?(?:like|love|adore|enjoy|am into|'m into|m into)\s+(.{2,40}?)[.!?]*$/i;
/** "I love what I see" / "I like that" - no real subject to remember. */
const VAGUE_LIKE = /^(?:you|u|it|that|this|them|those|these|what|how|when|the way|everything|anything|nothing|all of it|so much|a lot|lots)\b/i;
const DISLIKE_RE = /\bi (?:really |also |totally )?(?:hate|dislike|can'?t stand|don'?t like|do not like)\s+(.{2,40}?)[.!?]*$/i;

function remember(list: string[], item: string): string[] {
  const rest = list.filter((x) => x.toLowerCase() !== item.toLowerCase());
  return [...rest, item].slice(-MAX_LIST);
}

// ---- ELIZA reflections --------------------------------------------------------------------------

// Each line set only gets the kind of phrase it reads right with - "Being {1}" needs something you
// ARE ("a student", "tired"), not something you're doing ("looking at me") or about to do ("gonna
// touch me"). Contractions are spelled out first (elizaForm), so "gonna"/"wanna"/"I'd like to"
// land on the right pattern.
export const ELIZA: [RegExp, keyof typeof LINES][] = [
  [/^i (?:feel|am feeling) (.+)/i, "iFeel"],
  // "I want/need to go home", "I want you to kiss me" - the verb is kept: "Why do you need to go home?"
  [/^i ((?:want|need) (?:\w+ )?to .+)/i, "iWantTo"],
  [/^i (?:want|need|wish for) (.+)/i, "iWant"],
  [/^i am (?:going to|about to|planning to|fixing to) (.+)/i, "iAmGonna"],
  [/^i am ((?:just |still |currently |really |kinda |busy |out |off )?[a-z]+ing\b.*)/i, "iAmDoing"],
  // Anything else that isn't a state ("from Texas", "like whatever", "with friends") is left to the babbler.
  // Not "not sure" ("Being not sure…") or a whole clause ("sorry you feel that way" -> "sorry me feel…").
  [/^i am (?!(?:from|like|with|for|to|about|into|by|so that|that|because|not|gonna|gotta)\b)(?!.*\b(?:i|you|he|she|they|we|it)\s+\w)(.+)/i, "iAm"],
  [/^(?:you(?:'re| are)|ur|youre|u r) (.+)/i, "youAre"],
  [/^are you (.+?)\??$/i, "areYou"],
  [/^do you (.+?)\??$/i, "doYou"],
  [/^can you (.+?)\??$/i, "canYou"],
];

/** Spelled-out form for the ELIZA patterns: "im gonna" -> "i am going to", "i'd like to" -> "i want to". */
export function elizaForm(text: string): string {
  return text
    .replace(/\s+(?:lol|lmao|lmfao|haha+|hehe+|xd|tbh|ngl|fr|rn)$/i, "")
    .replace(/^i(?:'m|m| am)\b/i, "i am")
    .replace(/^i am feeling\b/i, "i feel")
    .replace(/^i(?:'d| would) (?:like|love) to\b/i, "i want to")
    .replace(/^i(?:'d| would) like\b/i, "i want")
    .replace(/\bgonna\b/gi, "going to")
    .replace(/\bfinna\b/gi, "going to")
    .replace(/\bwanna\b/gi, "want to")
    .replace(/\bgotta\b/gi, "have to")
    .replace(/\bi am (?:bout|about) to\b/i, "i am about to");
}

// ---- The babbler's training text -----------------------------------------------------------------

function ruleLines(tier: Tier): string[] {
  const out: string[] = [];
  for (const rule of RULES) {
    for (const set of [rule.lines, ...Object.values(rule.stages ?? {})]) {
      for (const l of set?.[tier] ?? []) if (typeof l === "string" && !l.includes("{")) out.push(l.replace(/\*/g, ""));
    }
  }
  return out;
}

/** Everything Gus has ever said at this tier and below, plus (if given) what he's learned from you. */
export function buildBabbler(tier: Tier, learned: string[] = []): Babbler {
  const tiers: Tier[] = tier === "nasty" ? ["clean", "cheeky", "nasty"] : tier === "cheeky" ? ["clean", "cheeky"] : ["clean"];
  const lines: string[] = [];
  for (const t of tiers) lines.push(...CORPUS[t], ...ruleLines(t));
  for (const def of Object.values(REACTIONS)) lines.push(...def.lines.filter((l) => !l.includes("{")));
  if (tier !== "clean") for (const ls of Object.values(SPICY_LINES)) lines.push(...(ls ?? []).filter((l) => !l.includes("{")));
  lines.push(...learned.map(ownVoice));
  return new Babbler(lines.map((l) => l.replace(/¦/g, " ")));
}

/** His plain, standalone lines at this tier and below, for the embedding model to search by
 *  meaning (gusSemantic's indexLines). Short asides and actions are left out. */
export function retrievalLines(tier: Tier): string[] {
  const tiers: Tier[] = tier === "nasty" ? ["clean", "cheeky", "nasty"] : tier === "cheeky" ? ["clean", "cheeky"] : ["clean"];
  const out = new Set<string>();
  for (const t of tiers) for (const l of CORPUS[t]) if (!l.includes("{") && !l.includes("¦") && l.split(" ").length >= 4) out.add(l);
  return [...out];
}

// ---- The main entry point ------------------------------------------------------------------------

export function respond(input: string, memory: ChatMemory, env: ChatEnv, rnd: () => number = Math.random): ChatResult | null {
  const before = { ...EMPTY_MEMORY, ...memory };
  const inner = respondInner(input, memory, env, rnd);
  if (!inner) return null;
  let result = inner;
  let mem = { ...result.memory, bond: { ...EMPTY_BOND, ...result.memory.bond } };
  if (env.learn) mem = { ...mem, phrases: countPhrases(mem.phrases ?? {}, input) };

  // Five hearts / a full fire bar / both: the moments they unlock.
  const moment = bondStep(
    { affection: before.affection, heat: cooledHeat(before.heat, before.heatAt, env.now) },
    { affection: mem.affection, heat: mem.heat },
    mem.bond,
    env.tier,
    mem.name,
    env.now,
    rnd,
  );
  if (moment) {
    mem = {
      ...mem,
      bond: moment.bond,
      heat: Math.max(0, Math.min(100, mem.heat + (moment.heat ?? 0))),
      affection: Math.max(0, Math.min(100, mem.affection + (moment.affection ?? 0))),
    };
    result = {
      ...result,
      replies: [...result.replies, ...moment.replies],
      petActions: moment.overheat ? [...result.petActions, { type: "overheat" }] : result.petActions,
      sendPic: result.sendPic ?? moment.sendPic,
      overheat: moment.overheat,
      conv: moment.askPetName ? { ...result.conv, expect: { kind: "petName" } } : result.conv,
    };
    return { ...result, memory: mem };
  }
  // Afterglow: clingy, and every message counts a little more.
  if (afterglow(mem.bond, env.now) && env.tier === "nasty") {
    mem = { ...mem, affection: Math.min(100, mem.affection + 1) };
    if (rnd() < 0.35 && result.replies.length < 3) result = { ...result, replies: [...result.replies, { text: afterglowAside(rnd), motion: "droop" }] };
  }
  // Something you told him about has happened since: he asks, unless he's busy with something.
  const due = dueEpisode(mem.episodes ?? [], env.now);
  const busy = result.conv.expect || result.search || result.lookup || result.sendPic || result.openPopular || env.now < mem.huffyUntil;
  if (due && !busy) {
    mem = { ...mem, episodes: mem.episodes.map((e) => (e === due ? { ...e, asked: true } : e)) };
    return {
      ...result,
      memory: mem,
      replies: [...result.replies, { text: episodeAsk(due, mem.name, rnd), motion: "hop" }],
      conv: { ...result.conv, expect: { kind: "followup", what: due.what } },
    };
  }
  return { ...result, memory: mem };
}

/** The opener for a new chat: his greeting, plus a question about anything that's happened since. */
export function openingFollowUp(memory: ChatMemory, now: number, rnd: () => number = Math.random): { text: string; memory: ChatMemory; expect: Expect } | null {
  const due = dueEpisode(memory.episodes ?? [], now);
  if (!due) return null;
  return {
    text: episodeAsk(due, memory.name, rnd),
    memory: { ...memory, episodes: memory.episodes.map((e) => (e === due ? { ...e, asked: true } : e)) },
    expect: { kind: "followup", what: due.what },
  };
}

function respondInner(input: string, memory: ChatMemory, env: ChatEnv, rnd: () => number): ChatResult | null {
  const text = normalize(input);
  if (!text) return null;
  let mem: ChatMemory = { ...EMPTY_MEMORY, ...memory };
  mem = { ...mem, heat: cooledHeat(mem.heat, mem.heatAt, env.now), heatAt: env.now, lastSeen: env.now };
  const prev = env.conv ?? EMPTY_CONV;
  const keys = env.babbler?.keywords(text) ?? [];
  // Follow-ups ("why?", "tell me more") carry no keywords - keep talking about the last thing.
  let conv: ConvState = { expect: null, topic: keys.length ? keys.join(" ") : prev.topic, lastInput: text, topics: prev.topics ?? [] };
  const mention = (x: string) => {
    conv = { ...conv, topics: [...(conv.topics ?? []).filter((t) => t !== x), x].slice(-8) };
  };
  const known = (): Known => ({ name: mem.name, likes: mem.likes, facts: mem.facts, topics: conv.topics ?? [] });
  const warm = (n: number) => {
    mem = { ...mem, heat: Math.max(0, Math.min(100, mem.heat + n)) };
  };
  const brain = (): BrainCtx => ({
    tier: env.tier,
    stage: stageFor(mem.affection),
    heat: mem.heat,
    name: mem.name,
    now: new Date(env.now),
    topSearches: env.stats?.topSearches ?? [],
  });
  /** Applies a gusBrain result. */
  const use = (out: BrainOut) => {
    replies.push(...out.replies);
    if (out.heat) warm(out.heat);
    if (out.affection) mem = { ...mem, affection: Math.max(0, Math.min(100, mem.affection + out.affection)) };
    if (out.expect !== undefined) expect(out.expect);
    if (out.subject) {
      conv = { ...conv, subject: out.subject };
      mention(out.subject.x);
    }
    if (out.topic) mention(out.topic);
    return done(out.sendPic ? { sendPic: out.sendPic } : {});
  };
  const replies: GusReply[] = [];
  const petActions: PetAction[] = [];
  const ctx = (): ChatCtx => ({
    tier: env.tier,
    stage: stageFor(mem.affection),
    // At five hearts he often uses his pet name for you instead.
    name: mem.bond?.petName && hasFiveHearts(mem.affection) && rnd() < 0.4 ? mem.bond.petName : mem.name,
    likes: mem.likes,
    dislikes: mem.dislikes,
    pet: env.pet,
    now: new Date(env.now),
    ageDays: env.ageDays,
  });
  const say = (lines: Line[], cap?: string, motion?: MascotMotion, emoji?: string[]) => {
    const t = choose(lines, ctx(), env, rnd, cap);
    if (t) replies.push({ text: t, motion, emoji });
    return !!t;
  };
  const done = (extra: Partial<ChatResult> = {}): ChatResult => ({ replies, memory: mem, petActions, conv, ...extra });
  const expect = (e: Expect | null) => {
    conv = { ...conv, expect: e };
  };
  const rememberFact = (key: string, value: string) => {
    const facts = Object.fromEntries(Object.entries({ ...mem.facts, [key]: value }).slice(-MAX_FACTS));
    mem = { ...mem, facts };
    say(LINES.learnedFact, key, "nod", ["📝"]);
  };

  // Talking to him wakes him up.
  if (env.pet?.asleep) {
    say(LINES.wokeUp, undefined, "stretch", ["💤"]);
    petActions.push({ type: "wake" });
  }

  // Sulking: nothing gets through but an apology.
  const apology = RULES.find((r) => r.apology && r.match.test(text));
  if (env.now < mem.huffyUntil && !apology) {
    say(LINES.sulking, undefined, "shake", ["💢"]);
    return done();
  }

  // 0. A bare answer to something he just asked.
  if (prev.expect) {
    const game = answerGame(prev.expect, text, brain(), rnd);
    if (game) return use(game);
    if (answerExpected(prev.expect)) return done();
  }

  // 0b. How it was typed: repeats, keysmash, emoji-only (replace the reply); CAPS, essays (lead it).
  const shape = special(text, prev.lastInput ?? "", brain(), rnd);
  if (shape && !shape.prefix) return use(shape);
  if (shape) replies.push(...shape.replies);

  // 0c. "Why?" right after he gave a take - he explains himself.
  if (prev.subject && WHY_RE.test(text)) return use(because(prev.subject, brain()));

  // 1. Intents and things he can work out.
  const count = parseCountQuestion(text);
  const countTag = count ? phraseToTag(count) : null;
  if (countTag) {
    say(LINES.counting, undefined, "tilt");
    return done({ lookup: { tag: countTag } });
  }
  const practical = mathAnswer(text) ?? dateAnswer(text, new Date(env.now)) ?? (env.stats ? statsAnswer(text, env.stats, env.tier) : null);
  if (practical) {
    replies.push({ text: practical, motion: "nod" });
    return done();
  }
  const search = parseSearch(text);
  if (search) {
    const pretty = search.split(" ").filter((t) => !t.startsWith("-")).join(" + ").replace(/_/g, " ");
    say(env.tier !== "clean" && rnd() < 0.5 ? LINES.searchingCheeky : LINES.searching, pretty, "hop", ["🔍"]);
    mention(pretty);
    return done({ search });
  }
  if (POPULAR_RE.test(text)) {
    say(LINES.popular, undefined, "hop", ["🔥"]);
    return done({ openPopular: true });
  }
  const define = parseDefineQuestion(text);
  const defineTag = define ? phraseToTag(define) : null;
  if (defineTag) {
    say(["Ooh, let me check the wiki…", "Hang on, looking it up…", "*flips through a very sticky encyclopedia*"], undefined, "tilt", ["📖"]);
    mention(defineTag.replace(/_/g, " "));
    return done({ lookup: { tag: defineTag, kind: "wiki" } });
  }

  // 2. Memory: being told his name for you.
  const named = text.match(NAME_RE)?.[1];
  const name = named && !NOT_NAMES.has(named.toLowerCase()) ? named : introName(text, (w) => env.babbler?.knows(w) ?? false);
  if (name) {
    mem = { ...mem, name: capitalise(name), affection: Math.min(100, mem.affection + 2) };
    say(LINES.learnedName, undefined, "hop", ["👋"]);
    return done();
  }

  // 2. Memory: facts about you, and questions about them.
  const fact = parseFact(text);
  if (fact) {
    rememberFact(fact[0], reflect(fact[1]));
    return done();
  }
  const factQ = parseFactQuestion(text);
  if (factQ) {
    const known = mem.facts[factQ];
    if (known) replies.push({ text: `Your ${factQ}? ${capitalise(known)}! I remembered.`, motion: "hop" });
    else {
      say(LINES.askFact, factQ, "tilt");
      expect({ kind: "fact", key: factQ });
    }
    return done();
  }
  const doILike = text.match(DO_I_LIKE_RE)?.[1]?.toLowerCase();
  if (doILike) {
    const hit = (xs: string[]) => xs.find((x) => x.toLowerCase().includes(doILike) || doILike.includes(x.toLowerCase()));
    const liked = hit(mem.likes);
    const disliked = hit(mem.dislikes);
    replies.push({
      text: liked
        ? `You told me you like ${liked}, so… yes?`
        : disliked
          ? `You said you don't like ${disliked}. Changed your mind?`
          : "You haven't told me! Do you?",
      motion: "tilt",
    });
    return done();
  }

  // 2. Memory: something coming up ("i have an exam tomorrow") - he'll ask how it went.
  const ep = parseEpisode(text, env.now);
  if (ep) {
    mem = { ...mem, episodes: rememberEpisode(mem.episodes ?? [], ep) };
    replies.push({ text: episodeAck(ep, env.now, rnd), motion: "nod", emoji: ["📝"] });
    mention(ep.what);
    return done();
  }

  // 2. His own day - the same story all day if you ask twice.
  if (GUS_DAY_RE.test(text)) {
    replies.push({ text: gusDayReply(new Date(env.now), rnd), motion: "hop" });
    conv = { ...conv, volunteered: [...(conv.volunteered ?? []), "day"] };
    return done();
  }

  // 2c. Chat games: truth or dare, would you rather, roasts, pickup lines…
  const game = chatGame(text, brain(), rnd);
  if (game) return use(game);

  // 2d. Things he can answer properly: what he remembers, his favorites, himself.
  const answer = recap(text, known()) ?? favorite(text, brain()) ?? aboutSelf(text);
  if (answer) return use(answer);

  // 3. Personality rules.
  for (const rule of RULES) {
    const m = text.match(rule.match);
    if (m) return applyRule(rule, [...m].slice(1).filter(Boolean).pop() ?? "that")!;
  }

  // 3'. Nothing matched word for word - the rule it most likely meant, by meaning (embedding
  // model) or by wording (typos, slang, rephrasings).
  const sem = env.semantic?.intent;
  const fuzzy = sem && sem.score >= SEMANTIC_MIN && text.split(/\s+/).length <= 12 ? sem : fuzzyIntent(text);
  const fuzzyRule = fuzzy ? RULES.find((r) => r.id === fuzzy.id && !r.huffy) : undefined;
  const fuzzyHit = fuzzyRule ? applyRule(fuzzyRule, null) : null;
  if (fuzzyHit) return fuzzyHit;

  // 2b. Memory: likes and dislikes.
  const dislike = text.match(DISLIKE_RE)?.[1];
  if (dislike && !VAGUE_LIKE.test(dislike)) {
    mem = { ...mem, dislikes: remember(mem.dislikes, reflect(dislike)) };
    say(LINES.learnedDislike, reflect(dislike), "nod");
    return done();
  }
  const like = text.match(LIKE_RE)?.[1];
  if (like && !VAGUE_LIKE.test(like)) {
    mem = { ...mem, likes: remember(mem.likes, reflect(like)) };
    say(env.tier !== "clean" && rnd() < 0.4 ? LINES.learnedLikeCheeky : LINES.learnedLike, reflect(like), "nod", ["📝"]);
    return done();
  }

  // 3a. "Cool." / "Hmm." - nothing to work with, so he steers, using what he knows about you.
  if (FILLER_RE.test(text)) {
    let out = steer(known(), brain(), rnd);
    for (let i = 0; i < 4 && env.recent.has(out.replies[0].text); i++) out = steer(known(), brain(), rnd);
    return use(out);
  }

  // 3a'. No rule, but clearly a mood ("everything is going wrong", "best day ever").
  const feel = feeling(text);
  const semFeel = env.semantic?.emotion && env.semantic.emotion.score >= 0.55 ? env.semantic.emotion.name : null;
  const moodRule =
    !text.endsWith("?") && (feel.score <= -0.45 || (feel.score <= 0 && (semFeel === "sad" || semFeel === "anxious")))
      ? "sad"
      : !text.endsWith("?") && (feel.score >= 0.55 || (feel.score >= 0 && semFeel === "joy"))
        ? "happy"
        : null;
  const moodHit = moodRule ? RULES.find((r) => r.id === moodRule) : undefined;
  const moodReply = moodHit ? applyRule(moodHit, null) : null;
  if (moodReply) return moodReply;

  // 3b. Opinions, yes/no questions, and topics he has something to say about.
  const take = opinion(text, brain(), rnd) ?? oracle(text, brain(), rnd);
  if (take) return use(take);
  const theme = rnd() < 0.75 ? themed(text, brain(), rnd) : null;
  if (theme) {
    use(theme);
    volunteer();
    return done();
  }

  // 4/5. Reflection or babble.
  const plain = elizaForm(text.replace(/[.!]+$/, ""));
  const eliza = ELIZA.find(([re]) => re.test(plain));
  const babbleInput = keys.length ? text : `${text} ${conv.topic}`;
  let babble: string | null = null;
  for (let i = 0; i < 4 && env.babbler; i++) {
    const b = env.babbler.reply(babbleInput, rnd, undefined, env.recent);
    if (!b || wellFormed(b)) {
      babble = b;
      break;
    }
  }
  // The embedding model found one of his own lines that fits - often better than a remix.
  const retrieved = env.semantic?.lines?.find((l) => l.score >= 0.45 && !env.recent.has(l.text));
  if (retrieved && (!babble || rnd() < 0.55)) babble = retrieved.text;
  // Smart brain on and fairly sure what you meant: answer that instead of echoing your sentence
  // back - the echo is where the clunky grammar comes from. A looser bar than SEMANTIC_MIN, since
  // the alternative here is a template, not a better match.
  if (eliza && env.semantic) {
    const near = env.semantic.intent && env.semantic.intent.score >= SEMANTIC_ECHO_MIN ? RULES.find((r) => r.id === env.semantic!.intent!.id && !r.huffy) : undefined;
    const meant = near ? applyRule(near, null) : null;
    if (meant) return meant;
    if (retrieved) {
      replies.push({ text: retrieved.text });
      volunteer();
      return done();
    }
  }
  if (eliza && (rnd() < 0.6 || !babble)) {
    const cap = reflect(plain.match(eliza[0])![1]);
    say(LINES[eliza[1]], cap);
  } else if (babble && rnd() < 0.85) {
    replies.push({ text: babble });
    const phrase = env.learn && rnd() < 0.08 ? catchphrase(mem.phrases ?? {}, rnd) : null;
    if (phrase) replies.push({ text: echoPhrase(phrase, rnd), motion: "wobble" });
  } else if (/^why\b/i.test(text)) {
    say(LINES.why);
  } else if (text.endsWith("?")) {
    say(LINES.question, undefined, "tilt");
  } else if (mem.likes.length && rnd() < 0.3) {
    say(LINES.recallLike, pick(mem.likes, rnd));
  } else {
    say(LINES.fallback, undefined, "tilt");
  }
  // Curiosity: sometimes he asks something back, which gives him more to remember.
  // Never the same question twice running.
  if (!mem.name && prev.expect?.kind !== "name" && rnd() < 0.3) {
    say(LINES.askName);
    expect({ kind: "name" });
  } else if (mem.likes.length < 3 && prev.expect?.kind !== "like" && rnd() < 0.15) {
    say(LINES.askLike);
    expect({ kind: "like" });
  } else {
    volunteer();
  }
  return done();

  /** Says one of a rule's lines and applies its effects. `cap` is what its regex captured; null
   *  for a fuzzy/mood match, which has nothing to fill "{1}" with ("my {1}" -> "my that"), so those
   *  lines are skipped - and if nothing's left, null: the match isn't used at all. */
  function applyRule(rule: (typeof RULES)[number], cap: string | null): ChatResult | null {
    const stage = stageFor(mem.affection);
    const over = rule.stages?.[stage];
    const usable = (ls: Line[]) => (cap === null ? ls.filter((l) => !(typeof l === "string" ? l : (l(ctx()) ?? "")).includes("{1}")) : ls);
    const lines: Required<Lines> = {
      clean: usable(over?.clean ?? rule.lines.clean),
      cheeky: usable(over?.cheeky ?? rule.lines.cheeky ?? []),
      nasty: usable(over?.nasty ?? rule.lines.nasty ?? []),
      hot: usable(over?.hot ?? rule.lines.hot ?? rule.hot ?? []),
    };
    // Clean is the fallback when the tier's own list comes up empty, so it has to have something.
    if (!lines.clean.length) return null;
    cap ??= "that";
    if (rule.affection) mem = { ...mem, affection: Math.max(0, Math.min(100, mem.affection + rule.affection)) };
    if (rule.huffy) mem = { ...mem, huffyUntil: env.now + HUFFY_MS, heat: 0 };
    if (rule.heat) warm(rule.heat);
    if (rule.apology) mem = { ...mem, huffyUntil: 0 };
    if (rule.petAction) petActions.push(rule.petAction);
    if (rule.expects) expect(typeof rule.expects === "function" ? rule.expects(ctx()) : rule.expects);
    if (!say(tierLines(lines, env.tier, rnd, mem.heat), cap.toLowerCase(), rule.motion, rule.emoji)) say(lines.clean, cap.toLowerCase(), rule.motion, rule.emoji);
    volunteer();
    return done();
  }

  /** Now and then he brings something up himself: his needs, his day (once a session), or what
   *  you've been browsing (once a session). */
  function volunteer() {
    const said = conv.volunteered ?? [];
    const flag = (f: string) => (conv = { ...conv, volunteered: [...said, f] });
    if (replies.length < 3 && !said.includes("day") && rnd() < 0.08) {
      replies.push({ text: gusDayAside(new Date(env.now), rnd), motion: "hop" });
      flag("day");
      return;
    }
    const quip = env.browse && !said.includes("browse") && rnd() < 0.1 ? browseQuip(env.browse, env.tier, rnd) : null;
    if (quip && replies.length < 3) {
      replies.push({ text: quip, motion: "tilt" });
      flag("browse");
      return;
    }
    interject(replies, petActions, env, rnd);
  }

  /** Handles a reply to his last question. False = it wasn't an answer, carry on as normal. */
  function answerExpected(e: Expect): boolean {
    const yes = YES_RE.test(text);
    const no = NO_RE.test(text);
    switch (e.kind) {
      case "name": {
        const n = answerName(text);
        if (!n || NOT_NAMES.has(n.toLowerCase())) return false;
        mem = { ...mem, name: n, affection: Math.min(100, mem.affection + 2) };
        say(LINES.learnedName, undefined, "hop", ["👋"]);
        return true;
      }
      case "like": {
        const l = answerLike(text);
        if (!l) return false;
        mem = { ...mem, likes: remember(mem.likes, reflect(l)) };
        say(LINES.learnedLike, reflect(l), "nod", ["📝"]);
        return true;
      }
      case "fact": {
        // "Blue, you?" / "what about you?" - answer it, then give his own.
        if (ASK_BACK_RE.test(text) && GUS_ANSWERS[e.key]) {
          const own = text.replace(ASK_BACK_RE, "").replace(/[,\s]+$/, "").trim();
          const told = own && !/^(?:what|how)$/i.test(own) && own.split(/\s+/).length <= 8;
          if (told) rememberFact(e.key, reflect(own.replace(/^(it'?s|its|they'?re|it is|i'?m from|i live in|i work as|i'?m an?|i'?m)\s+/i, "")));
          replies.push({ text: told ? `Me? ${GUS_ANSWERS[e.key]}` : `Me? ${GUS_ANSWERS[e.key]} Your turn!`, motion: "hop" });
          if (!told) expect(e);
          return true;
        }
        if (text.endsWith("?") || text.split(/\s+/).length > 8 || FILLER_RE.test(text) || /^(i don'?t know|no idea|not sure|dunno)\b/i.test(text)) return false;
        rememberFact(e.key, reflect(text.replace(/^(?:yes|yeah|yep),?\s+/i, "").replace(/^(it'?s|its|they'?re|it is|i'?m from|i live in|i work as|i'?m an?|i'?m)\s+/i, "").replace(/[.!]+$/, "")));
        return true;
      }
      case "talk":
        if (yes) {
          say(LINES.listenYes, undefined, "nod");
          expect({ kind: "vent" });
          return true;
        }
        if (no) {
          say(LINES.listenNo, undefined, "nod");
          return true;
        }
        // Launched straight into it - that's venting too.
        if (text.split(/\s+/).length < 4) return false;
        mem = { ...mem, affection: Math.min(100, mem.affection + 2) };
        say(LINES.vented, undefined, "droop", ["🫂"]);
        return true;
      case "vent":
        if (no) return false;
        mem = { ...mem, affection: Math.min(100, mem.affection + 2) };
        say(LINES.vented, undefined, "droop", ["🫂"]);
        return true;
      case "joke": {
        if (no) {
          say(LINES.jokeNo, undefined, "shrug");
          return true;
        }
        if (!yes) return false;
        const joke = RULES.find((r) => r.id === "joke")!;
        say(tierLines(joke.lines, env.tier, rnd), undefined, "spin");
        expect({ kind: "joke" });
        return true;
      }
      case "petName": {
        const p = petNameAnswer(text, rnd);
        if (!p) return false;
        mem = { ...mem, bond: { ...EMPTY_BOND, ...mem.bond, petName: p } };
        replies.push({ text: petNameAck(p, rnd), motion: "hop", emoji: ["💕"] });
        return true;
      }
      case "followup": {
        if (text.endsWith("?") && text.split(/\s+/).length > 3) return false;
        const ep = (mem.episodes ?? []).find((x) => x.what === e.what) ?? { what: e.what, due: env.now, at: env.now };
        replies.push({ text: episodeOutcome(ep, text, rnd, env.semantic?.emotion?.name), motion: "nod" });
        mem = { ...mem, affection: Math.min(100, mem.affection + 2) };
        return true;
      }
      default:
        return false;
    }
  }
}

/** Now and then he mentions what he needs - unless the reply just took care of it. */
function interject(replies: GusReply[], petActions: PetAction[], env: ChatEnv, rnd: () => number) {
  const p = env.pet;
  if (!p || petActions.length || rnd() > 0.2) return;
  const lines = p.sick ? LINES.needSick : p.hunger < 25 ? LINES.needHunger : p.messes > 0 ? LINES.needMess : p.hygiene < 25 ? LINES.needDirty : null;
  if (lines) replies.push({ text: pick(lines, rnd), motion: "droop" });
}

