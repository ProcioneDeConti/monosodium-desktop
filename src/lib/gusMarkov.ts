// A small MegaHAL-style babbler for Gus's chat (the IRC-bot classic): an order-2 Markov model
// trained both forwards and backwards. A reply is grown outward in both directions from one of
// the user's keywords, a few hundred candidates are generated, and the most "surprising" one
// (the keywords used in the least predictable way) wins. No understanding - just remixing his
// own lines around your words, which is exactly the charming-weird a raccoon should be.

const START = "<s>";
const END = "</s>";
const ORDER = 2;
const MAX_LEN = 28;
/** Replies longer than this (tokens) are scored down - long chains are where coherence goes. */
const COMFY_LEN = 16;
/** Score multiplier by seam count (places where the reply jumps between source sentences).
 *  One seam is the sweet spot: still a remix, still reads like a sentence. */
const SEAM_WEIGHT = [1, 0.85, 0.3, 0.08];
/** Replies shorter than this (tokens) are scored down - "My tail." isn't a reply. */
const MIN_COMFY = 5;
/** How often to follow the 3-word context (when it exists) instead of the 2-word one. Higher =
 *  closer to real sentences, lower = wilder remixes. */
const LONG_CONTEXT_ODDS = 0.75;
/** The reply is drawn (score-weighted) from this many best distinct candidates, not just the
 *  top one - otherwise the same question always gets the same answer. */
const TOP_K = 6;
/** Score bonus per extra input keyword a reply manages to use - "fox" AND "bins" beats either. */
const COVERAGE_BONUS = 0.6;
/** Answering a question with another question reads as dodging - scored down. */
const QUESTION_ECHO = 0.6;

/** Words never worth building a reply around. */
const STOPWORDS = new Set(
  (
    "a an the and or but if then so to of in on at by for with from up down out over under is am are was were be been " +
    "being do does did have has had it its it's this that these those there here what which who whom whose when where " +
    "why how i me my mine you your yours we us our they them their he him his she her hers just very really too also " +
    "not no yes can could would should will shall may might must im i'm you're youre dont don't can't cant ok okay " +
    "about like some any all as than into get got go going gonna wanna lol haha hmm oh ah um uh hey hi hello gus"
  ).split(" "),
);

/** MegaHAL's keyword swap: "you" in the input is about Gus, so look for "i"/"me" in his corpus. */
const SWAP: Record<string, string> = {
  you: "i",
  your: "my",
  yours: "mine",
  i: "you",
  me: "you",
  my: "your",
  mine: "yours",
  "you're": "i'm",
  "i'm": "you're",
};

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?|[.!?,…]/g) ?? [];
}

type Table = Map<string, Map<string, number>>;

function bump(table: Table, key: string, next: string) {
  let row = table.get(key);
  if (!row) table.set(key, (row = new Map()));
  row.set(next, (row.get(next) ?? 0) + 1);
}

function choose(row: Map<string, number>, rnd: () => number): string {
  let total = 0;
  for (const n of row.values()) total += n;
  let r = rnd() * total;
  for (const [w, n] of row) {
    r -= n;
    if (r < 0) return w;
  }
  return row.keys().next().value as string;
}

function prob(table: Table, key: string, next: string): number {
  const row = table.get(key);
  if (!row) return 1;
  let total = 0;
  for (const n of row.values()) total += n;
  return (row.get(next) ?? 0) / total || 1 / (total + 1);
}

export class Babbler {
  private fwd: Table = new Map();
  private bwd: Table = new Map();
  /** word -> forward contexts ("w1 w2") it appears in, to seed a reply from a keyword. */
  private seeds = new Map<string, string[]>();
  /** Lowercased token -> how it was written mid-sentence when capitalised (names, "Gus"). */
  private casing = new Map<string, string>();
  /** Words also seen lowercase mid-sentence - never re-capitalised. */
  private lowerSeen = new Set<string>();
  /** Order-3 tables, preferred over the order-2 ones when they have a continuation. */
  private fwd3: Table = new Map();
  private bwd3: Table = new Map();
  /** Every 4-word run seen, to count seams in a candidate. */
  private grams4 = new Set<string>();

  constructor(lines: Iterable<string> = []) {
    for (const l of lines) this.learn(l);
  }

  /** Learns a line - sentence by sentence, so every sentence gets a real start and end and
   *  replies don't run on across the breaks of a multi-sentence line. */
  learn(line: string) {
    for (const m of line.matchAll(/(?<=[a-z,] )[A-Z][a-z]+(?![A-Za-z])/g)) this.casing.set(m[0].toLowerCase(), m[0]);
    for (const m of line.matchAll(/(?<=[a-z,] )[a-z]+/g)) this.lowerSeen.add(m[0]);
    for (const sentence of line.split(/(?<=[.!?…])\s+/)) this.learnSentence(sentence);
  }

  private learnSentence(sentence: string) {
    const words = tokenize(sentence);
    if (words.length < 2) return;
    const seq = [START, START, ...words, END, END];
    for (let i = ORDER; i < seq.length - 1; i++) {
      const key = `${seq[i - 2]} ${seq[i - 1]}`;
      bump(this.fwd, key, seq[i]);
      // Backwards: the two words AFTER predict this one.
      bump(this.bwd, `${seq[i]} ${seq[i + 1]}`, seq[i - 1]);
    }
    for (let i = 3; i < seq.length; i++) this.grams4.add(seq.slice(i - 3, i + 1).join(" "));
    const seq3 = [START, ...seq, END];
    for (let i = 3; i < seq3.length - 1; i++) {
      bump(this.fwd3, `${seq3[i - 3]} ${seq3[i - 2]} ${seq3[i - 1]}`, seq3[i]);
      bump(this.bwd3, `${seq3[i]} ${seq3[i + 1]} ${seq3[i + 2] ?? END}`, seq3[i - 1]);
    }
    for (let i = ORDER; i < seq.length - 2; i++) {
      const pair = `${seq[i]} ${seq[i + 1]}`;
      for (const w of [seq[i], seq[i + 1]]) {
        if (w === END) continue;
        const list = this.seeds.get(w) ?? [];
        list.push(pair);
        this.seeds.set(w, list);
      }
    }
  }

  knows(word: string): boolean {
    return this.seeds.has(word);
  }

  /** The form of `word` this babbler knows - itself, or a plural/verb-ending variant ("foxes" ->
   *  "fox", "snacking" -> "snack", "bin" -> "bins"). */
  private known(word: string): string | null {
    if (this.knows(word)) return word;
    for (const v of variants(word)) if (v.length >= 3 && this.knows(v)) return v;
    return null;
  }

  /** Keywords from the input this babbler can build around, pronouns swapped. */
  keywords(input: string): string[] {
    const out = new Set<string>();
    for (const w of tokenize(input)) {
      const swapped = SWAP[w] ?? w;
      if (/^[.!?,…]$/.test(swapped) || STOPWORDS.has(swapped) || swapped.length < 3) continue;
      const k = this.known(swapped);
      if (k && !STOPWORDS.has(k)) out.add(k);
    }
    return [...out];
  }

  /** Rare keywords are the topical ones ("raccoon" over "night") - seed from them more often. */
  private pickKeyword(keys: string[], rnd: () => number): string {
    const weights = keys.map((k) => 1 / Math.sqrt(this.seeds.get(k)?.length ?? 1));
    let r = rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < keys.length; i++) if ((r -= weights[i]) < 0) return keys[i];
    return keys[keys.length - 1];
  }

  /** Null if the chain ran out of room before reaching a natural start and end - a reply cut off
   *  mid-thought ("I love the way you") is worse than none. */
  private grow(keyword: string, rnd: () => number): string[] | null {
    const seeds = this.seeds.get(keyword);
    if (!seeds?.length) return null;
    const [a, b] = seeds[Math.floor(rnd() * seeds.length)].split(" ");
    const words = [a, b];
    let ended = b === END;
    let started = a === START;
    // Forward from the seed pair.
    while (words.length < MAX_LEN) {
      const n = words.length;
      const row3 = n >= 3 ? this.fwd3.get(`${words[n - 3]} ${words[n - 2]} ${words[n - 1]}`) : undefined;
      const row = row3 && rnd() < LONG_CONTEXT_ODDS ? row3 : this.fwd.get(`${words[n - 2]} ${words[n - 1]}`);
      if (!row) break;
      const next = choose(row, rnd);
      if (next === END) {
        ended = true;
        break;
      }
      words.push(next);
    }
    // Backward from the seed pair.
    while (words.length < MAX_LEN) {
      const row3 = words.length >= 3 ? this.bwd3.get(`${words[0]} ${words[1]} ${words[2]}`) : undefined;
      const row = row3 && rnd() < LONG_CONTEXT_ODDS ? row3 : this.bwd.get(`${words[0]} ${words[1]}`);
      if (!row) break;
      const prev = choose(row, rnd);
      if (prev === START) {
        started = true;
        break;
      }
      words.unshift(prev);
    }
    if (!ended || !started) return null;
    return words.filter((w) => w !== START && w !== END);
  }

  /** How many places the reply stitches together 4-word runs never seen in one sentence. */
  seams(words: string[]): number {
    const seq = [START, START, ...words, END, END];
    let n = 0;
    for (let i = 3; i < seq.length; i++) if (!this.grams4.has(seq.slice(i - 3, i + 1).join(" "))) n++;
    // A seam spans up to 4 consecutive misses (one per window crossing it) - count joins, not windows.
    return Math.ceil(n / 4);
  }

  /** MegaHAL's evaluation: information carried by the keywords, damped for long rambles. */
  private surprise(words: string[], keys: Set<string>): number {
    let score = 0;
    let n = 0;
    const seq = [START, START, ...words, END, END];
    for (let i = ORDER; i < seq.length - 2; i++) {
      if (!keys.has(seq[i])) continue;
      score -= Math.log2(prob(this.fwd, `${seq[i - 2]} ${seq[i - 1]}`, seq[i]));
      score -= Math.log2(prob(this.bwd, `${seq[i + 1]} ${seq[i + 2]}`, seq[i]));
      n++;
    }
    if (n >= 8) score /= Math.sqrt(n - 1);
    if (n >= 16) score /= n;
    return score;
  }

  /** One of the best of `tries` candidates around the input's keywords (skipping `avoid` - lines
   *  said recently), or null if it has nothing to say. */
  reply(input: string, rnd: () => number = Math.random, tries = 250, avoid: ReadonlySet<string> = new Set()): string | null {
    const keys = this.keywords(input);
    if (!keys.length) return null;
    const keySet = new Set(keys);
    const inputNorm = tokenize(input).join(" ");
    const asked = /\?\s*$/.test(input);
    const scored = new Map<string, number>();
    for (let i = 0; i < tries; i++) {
      const words = this.grow(this.pickKeyword(keys, rnd), rnd);
      if (!words || words.length < 3) continue;
      if (words.join(" ") === inputNorm) continue; // never just parrot
      if (stutters(words)) continue;
      const seams = this.seams(words);
      const s =
        this.surprise(words, keySet) *
        SEAM_WEIGHT[Math.min(seams, SEAM_WEIGHT.length - 1)] *
        Math.min(1, COMFY_LEN / words.length) *
        (words.length < MIN_COMFY ? 0.3 : 1) *
        (1 + COVERAGE_BONUS * (keys.filter((k) => words.includes(k)).length - 1)) *
        (asked && words[words.length - 1] === "?" ? QUESTION_ECHO : 1);
      if (!(s > 0)) continue;
      const text = detokenize(words.map((w) => (this.lowerSeen.has(w) ? w : (this.casing.get(w) ?? w))));
      if (avoid.has(text)) continue;
      scored.set(text, Math.max(s, scored.get(text) ?? 0));
    }
    const top = [...scored].sort((a, b) => b[1] - a[1]).slice(0, TOP_K);
    if (!top.length) return null;
    let r = rnd() * top.reduce((sum, [, s]) => sum + s, 0);
    for (const [text, s] of top) {
      r -= s;
      if (r < 0) return text;
    }
    return top[0][0];
  }
}

/** Plural and verb-ending variants of a word, for matching "foxes" to a corpus that says "fox". */
function variants(w: string): string[] {
  const out: string[] = [];
  if (w.endsWith("ies")) out.push(`${w.slice(0, -3)}y`);
  if (w.endsWith("es")) out.push(w.slice(0, -2));
  if (w.endsWith("s")) out.push(w.slice(0, -1));
  else out.push(`${w}s`);
  for (const suf of ["ing", "ed"]) {
    if (!w.endsWith(suf)) continue;
    const stem = w.slice(0, -suf.length);
    out.push(stem, `${stem}e`);
    if (/(.)\1$/.test(stem)) out.push(stem.slice(0, -1));
  }
  return out;
}

/** A content word said twice ("the best snacks are the best") - chains loop on short cycles. */
function stutters(words: string[]): boolean {
  const counts = new Map<string, number>();
  for (const w of words) {
    if (/^[.!?,…]$/.test(w) || STOPWORDS.has(w)) continue;
    const n = (counts.get(w) ?? 0) + 1;
    if (n > 1) return true;
    counts.set(w, n);
  }
  return false;
}

/** Joins tokens back into sentences: punctuation hugs the word before it, "i" and each sentence
 *  start are capitalised. */
export function detokenize(words: string[]): string {
  let text = "";
  let capNext = true;
  for (const w of words) {
    let word = w === "i" ? "I" : w.startsWith("i'") ? `I${w.slice(1)}` : w;
    const punct = /^[.!?,…]$/.test(w);
    if (!punct && capNext) word = word.charAt(0).toUpperCase() + word.slice(1);
    if (!punct) capNext = false;
    else if (w !== ",") capNext = true;
    text += punct || !text ? word : ` ${word}`;
  }
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}
