// Gus's chat brain (Games > "Talk to Gus") - a layered, deterministic-ish chatbot, no LLM:
//   1. intents     - "show me foxes" runs a search, "what's popular" opens Popular
//   2. memory      - remembers your name and what you like/dislike (Infobot-style)
//   3. rules       - hand-written personality (gusChatLines.ts), tiered clean/cheeky/nasty and
//                    shaded by how much he likes you (affection)
//   4. reflections - ELIZA-style "I feel X" -> "Why do you feel X?"
//   5. babble      - MegaHAL-style Markov remix around your keywords (gusMarkov.ts)
// Plus his Pocket Gus needs leak into the conversation, and talking to him affects them.

import { Babbler } from "./gusMarkov";
import { answerGame, chatGame, cooledHeat, oracle, opinion, special, themed, type BrainCtx, type BrainOut } from "./gusBrain";
import { CORPUS, LINES, RULES, type Line, type Lines, type Stage, type Tier } from "./gusChatLines";
import type { PetAction, PetState } from "./gusPet";
import { REACTIONS, type MascotMotion } from "./mascot";
import {
  answerLike,
  answerName,
  dateAnswer,
  DO_I_LIKE_RE,
  EMPTY_CONV,
  mathAnswer,
  normalize,
  NO_RE,
  parseCountQuestion,
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
}

export interface ChatResult {
  replies: GusReply[];
  memory: ChatMemory;
  petActions: PetAction[];
  /** Run this as a normal search (closes the Games panel). */
  search?: string;
  openPopular?: boolean;
  /** Look up this tag's post count and say it (see gusSmarts' tagCountReply). */
  lookup?: { tag: string };
  /** Fetch a random post for this search and send it as a picture, then say `after`. */
  sendPic?: { query: string; after: string };
  conv: ConvState;
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
}

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
  return capitalise(pick(fresh.length ? fresh : rendered, rnd));
}

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
const DISLIKE_RE = /\bi (?:really |also |totally )?(?:hate|dislike|can'?t stand|don'?t like|do not like)\s+(.{2,40}?)[.!?]*$/i;

function remember(list: string[], item: string): string[] {
  const rest = list.filter((x) => x.toLowerCase() !== item.toLowerCase());
  return [...rest, item].slice(-MAX_LIST);
}

// ---- ELIZA reflections --------------------------------------------------------------------------

const ELIZA: [RegExp, keyof typeof LINES][] = [
  [/^i (?:feel|am feeling|'m feeling|m feeling) (.+)/i, "iFeel"],
  [/^i (?:want|need|wish for|would like|'d like) (.+)/i, "iWant"],
  [/^i(?:'m| am|m) (.+)/i, "iAm"],
  [/^(?:you(?:'re| are)|ur|youre|u r) (.+)/i, "youAre"],
  [/^are you (.+?)\??$/i, "areYou"],
  [/^do you (.+?)\??$/i, "doYou"],
  [/^can you (.+?)\??$/i, "canYou"],
];

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
  lines.push(...learned);
  return new Babbler(lines.map((l) => l.replace(/¦/g, " ")));
}

// ---- The main entry point ------------------------------------------------------------------------

export function respond(input: string, memory: ChatMemory, env: ChatEnv, rnd: () => number = Math.random): ChatResult | null {
  const text = normalize(input);
  if (!text) return null;
  let mem: ChatMemory = { ...EMPTY_MEMORY, ...memory };
  mem = { ...mem, heat: cooledHeat(mem.heat, mem.heatAt, env.now), heatAt: env.now, lastSeen: env.now };
  const prev = env.conv ?? EMPTY_CONV;
  const keys = env.babbler?.keywords(text) ?? [];
  // Follow-ups ("why?", "tell me more") carry no keywords - keep talking about the last thing.
  let conv: ConvState = { expect: null, topic: keys.length ? keys.join(" ") : prev.topic, lastInput: text };
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
    return done(out.sendPic ? { sendPic: out.sendPic } : {});
  };
  const replies: GusReply[] = [];
  const petActions: PetAction[] = [];
  const ctx = (): ChatCtx => ({
    tier: env.tier,
    stage: stageFor(mem.affection),
    name: mem.name,
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
    return done({ search });
  }
  if (POPULAR_RE.test(text)) {
    say(LINES.popular, undefined, "hop", ["🔥"]);
    return done({ openPopular: true });
  }

  // 2. Memory: being told his name for you.
  const name = text.match(NAME_RE)?.[1];
  if (name && !NOT_NAMES.has(name.toLowerCase())) {
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

  // 2c. Chat games: truth or dare, would you rather, roasts, pickup lines…
  const game = chatGame(text, brain(), rnd);
  if (game) return use(game);

  // 3. Personality rules.
  for (const rule of RULES) {
    const m = text.match(rule.match);
    if (!m) continue;
    const cap = [...m].slice(1).filter(Boolean).pop() ?? "that";
    const stage = stageFor(mem.affection);
    const over = rule.stages?.[stage];
    const lines: Required<Lines> = {
      clean: over?.clean ?? rule.lines.clean,
      cheeky: over?.cheeky ?? rule.lines.cheeky ?? [],
      nasty: over?.nasty ?? rule.lines.nasty ?? [],
      hot: over?.hot ?? rule.lines.hot ?? rule.hot ?? [],
    };
    if (rule.affection) mem = { ...mem, affection: Math.max(0, Math.min(100, mem.affection + rule.affection)) };
    if (rule.huffy) mem = { ...mem, huffyUntil: env.now + HUFFY_MS, heat: 0 };
    if (rule.heat) warm(rule.heat);
    if (rule.apology) mem = { ...mem, huffyUntil: 0 };
    if (rule.petAction) petActions.push(rule.petAction);
    if (rule.expects) expect(typeof rule.expects === "function" ? rule.expects(ctx()) : rule.expects);
    if (!say(tierLines(lines, env.tier, rnd, mem.heat), cap.toLowerCase(), rule.motion, rule.emoji)) say(lines.clean, cap.toLowerCase(), rule.motion, rule.emoji);
    interject(replies, petActions, env, rnd);
    return done();
  }

  // 2b. Memory: likes and dislikes.
  const dislike = text.match(DISLIKE_RE)?.[1];
  if (dislike && !/^(you|u)\b/i.test(dislike)) {
    mem = { ...mem, dislikes: remember(mem.dislikes, reflect(dislike)) };
    say(LINES.learnedDislike, reflect(dislike), "nod");
    return done();
  }
  const like = text.match(LIKE_RE)?.[1];
  if (like && !/^(you|u)\b/i.test(like)) {
    mem = { ...mem, likes: remember(mem.likes, reflect(like)) };
    say(env.tier !== "clean" && rnd() < 0.4 ? LINES.learnedLikeCheeky : LINES.learnedLike, reflect(like), "nod", ["📝"]);
    return done();
  }

  // 3b. Opinions, yes/no questions, and topics he has something to say about.
  const take = opinion(text, brain(), rnd) ?? oracle(text, brain(), rnd);
  if (take) return use(take);
  const theme = rnd() < 0.75 ? themed(text, brain(), rnd) : null;
  if (theme) {
    use(theme);
    interject(replies, petActions, env, rnd);
    return done();
  }

  // 4/5. Reflection or babble.
  const plain = text.replace(/[.!]+$/, "");
  const eliza = ELIZA.find(([re]) => re.test(plain));
  const babbleInput = keys.length ? text : `${text} ${conv.topic}`;
  const babble = env.babbler?.reply(babbleInput, rnd, undefined, env.recent) ?? null;
  if (eliza && (rnd() < 0.6 || !babble)) {
    const cap = reflect(plain.match(eliza[0])![1]);
    say(LINES[eliza[1]], cap);
  } else if (babble && rnd() < 0.85) {
    replies.push({ text: babble });
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
    interject(replies, petActions, env, rnd);
  }
  return done();

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
        if (text.endsWith("?") || text.split(/\s+/).length > 8) return false;
        rememberFact(e.key, reflect(text.replace(/^(it'?s|its|they'?re|it is)\s+/i, "").replace(/[.!]+$/, "")));
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

