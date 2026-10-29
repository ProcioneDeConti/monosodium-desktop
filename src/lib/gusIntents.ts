// Fuzzy understanding for Gus's chat - the safety net under gusChatLines' hand-written regexes.
//   - intents: when no rule's regex matches, the message is scored against a few example phrasings
//     per rule (word overlap + character trigrams, so typos and odd wording still land). The
//     optional embedding model (gusSemantic.ts) does the same job by meaning when it's loaded.
//   - sentiment: a small hand-made word list (no download) for "how did that go?" answers and for
//     nudging his affection, plus the emotion names the embedding model can refine.
// Pure functions, no state.

/** Example phrasings per rule id (gusChatLines' RULES). Rude rules are left out on purpose: a
 *  near-miss shouldn't make him sulk. */
export const INTENT_EXAMPLES: Record<string, string[]> = {
  loveYou: ["i love you", "i really like you gus", "you mean a lot to me", "i adore you", "luv u"],
  kiss: ["kiss me", "can i give you a kiss", "smooch", "gimme a kiss", "pucker up"],
  hug: ["hug me", "can i have a hug", "i need a hug", "give me a cuddle", "come here and snuggle"],
  pets: ["can i pet you", "pat pat", "scratch behind your ears", "let me give you headpats", "who wants scritches"],
  cute: ["you are so cute", "youre adorable", "what a cutie", "you look so fluffy", "aww precious little guy"],
  hot: ["you're hot", "you look sexy", "damn you're fine", "you look good today"],
  date: ["wanna go out sometime", "do you want to go on a date", "be my boyfriend", "want to hang out with me", "go out with me"],
  likeMe: ["do you like me", "am i your favorite", "do you care about me at all", "are we friends"],
  whatWearing: ["what are you wearing", "are you wearing anything", "take your clothes off"],
  horny: ["i'm horny", "i feel so needy", "i'm turned on"],
  sorry: ["sorry", "i didn't mean that", "my bad gus", "please forgive me", "i apologise"],
  hello: ["hi there", "hey gus", "hello hello", "good morning", "heyo", "what's good"],
  bye: ["goodbye", "i have to go now", "talk to you later", "going to bed", "see you tomorrow", "i'm heading out"],
  howAreYou: ["how are you", "how are you doing", "hows it going", "you doing okay", "how have you been", "hows life", "how u been"],
  whatDoing: ["what are you doing", "what are you up to", "whatcha doing", "what you been up to"],
  whoAreYou: ["who are you", "tell me about yourself", "what are you exactly", "introduce yourself"],
  areYouReal: ["are you a bot", "are you real", "are you an ai", "is this a real person", "are you chatgpt"],
  age: ["how old are you", "what's your age", "when is your birthday"],
  gender: ["are you a boy", "are you a guy or a girl", "what are your pronouns"],
  partner: ["do you have a girlfriend", "are you single", "are you seeing anyone", "do you have a mate"],
  food: ["what do you like to eat", "favorite food", "are you hungry", "what's your favourite snack"],
  giveFood: ["here have a snack", "i brought you food", "want a treat", "here's some pizza"],
  where: ["where do you live", "where are you from", "where do you sleep"],
  hobbies: ["what do you do for fun", "what are your hobbies", "what do you like doing"],
  favTag: ["what's your favorite tag", "favorite artist", "favorite species"],
  joke: ["tell me a joke", "say something funny", "make me laugh", "got any jokes"],
  sing: ["sing me a song", "can you sing", "sing something"],
  tricks: ["do a trick", "roll over", "can you do tricks"],
  tail: ["your tail is fluffy", "show me your paws", "your little hands", "i like your mask"],
  sad: ["i'm sad", "i feel down", "i'm having a bad day", "i'm lonely", "everything sucks", "i feel awful", "today was rough"],
  happy: ["i'm happy", "i feel great", "i'm doing good", "today was awesome", "i'm in a good mood"],
  tired: ["i'm tired", "i'm so sleepy", "i'm exhausted", "i'm bored"],
  thanks: ["thank you", "thanks gus", "ty", "appreciate it", "thanks a lot"],
  laugh: ["lol", "haha", "lmao", "that's hilarious"],
};

const STOP = new Set(["the", "a", "an", "to", "is", "are", "be", "of", "and", "or", "so", "just", "really", "very", "gus", "um", "uh", "like", "please", "pls"]);
const SPELL: Record<string, string> = { hw: "how", wat: "what", wut: "what", whatcha: "what you", doin: "do", tierd: "tired", u: "you", ur: "your", r: "are", ya: "you", yo: "you", wanna: "want", gonna: "going", gimme: "give", luv: "love", cuz: "because", rn: "now", pls: "please", plz: "please" };

/** Lowercase words, slang expanded, light stemming ("cuddles" ~ "cuddle", "doing" ~ "do"). */
export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? [])
    .flatMap((w) => (SPELL[w.replace(/'/g, "")] ?? w.replace(/'/g, "")).split(" "))
    .filter((w) => !STOP.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, "") : w));
}

function trigrams(text: string): Map<string, number> {
  const s = ` ${text.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()} `;
  const out = new Map<string, number>();
  for (let i = 0; i + 3 <= s.length; i++) out.set(s.slice(i, i + 3), (out.get(s.slice(i, i + 3)) ?? 0) + 1);
  return out;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    dot += v * (b.get(k) ?? 0);
  }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const bag = (ws: string[]) => {
  const m = new Map<string, number>();
  for (const w of ws) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
};

/** One letter off (insert/delete/substitute/swap) - "hugg" ~ "hug", "joek" ~ "joke". */
function oneOff(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

let VOCAB: Set<string> | null = null;
/** Typos snapped to the nearest word the examples use (words of 4+ letters only). */
function spellFix(ws: string[]): string[] {
  VOCAB ??= new Set(Object.values(INTENT_EXAMPLES).flat().flatMap(words));
  return ws.map((w) => {
    if (w.length < 4 || VOCAB!.has(w)) return w;
    for (const v of VOCAB!) if (oneOff(w, v)) return v;
    return w;
  });
}

interface Example {
  id: string;
  words: Map<string, number>;
  tri: Map<string, number>;
}
let EXAMPLES: Example[] | null = null;
function examples(): Example[] {
  return (EXAMPLES ??= Object.entries(INTENT_EXAMPLES).flatMap(([id, xs]) => xs.map((x) => ({ id, words: bag(words(x)), tri: trigrams(x) }))));
}

/** Below this the guess is ignored and the message falls through to opinions/babble. */
export const FUZZY_MIN = 0.58;

/** The rule a message probably meant, by wording. Long messages are left alone - they're
 *  usually about something, not a stock phrase. */
export function fuzzyIntent(text: string): { id: string; score: number } | null {
  const ws = spellFix(words(text));
  if (!ws.length || ws.length > 8) return null;
  const w = bag(ws);
  const t = trigrams(ws.join(" "));
  let best: { id: string; score: number } | null = null;
  for (const ex of examples()) {
    // A real word the example doesn't have ("do you like *cheese*") means it's about something else.
    const stray = ws.filter((x) => x.length >= 4 && !ex.words.has(x)).length;
    const score = (0.55 * cosine(w, ex.words) + 0.45 * cosine(t, ex.tri)) * 0.7 ** stray;
    if (!best || score > best.score) best = { id: ex.id, score };
  }
  return best && best.score >= FUZZY_MIN ? best : null;
}

// ---- Sentiment ----------------------------------------------------------------------------------

/** Word -> -3..3. Hand-picked for chat, not a full lexicon. */
const VALENCE: Record<string, number> = {};
const add = (n: number, ws: string) => ws.split(" ").forEach((w) => (VALENCE[w] = n));
add(3, "amazing awesome fantastic incredible perfect wonderful loved love best brilliant thrilled ecstatic aced nailed crushed killed");
add(2, "good great nice happy glad fun excited proud passed won win yay cool lovely enjoyed sweet relieved smooth stoked");
add(1, "ok okay fine alright decent better pretty chill calm");
add(-1, "meh tired bored weird boring slow late nervous stressed meh hmm");
add(-2, "wrong bad sad upset annoyed angry mad hard rough lost failed fail sick hurt worried anxious lonely sucked sucks ugh crap");
add(-3, "awful terrible horrible worst hate hated miserable disaster depressed devastated bombed died");
const NEGATE = new Set(["not", "no", "never", "dont", "didnt", "wasnt", "isnt", "aint", "hardly", "barely", "cant", "couldnt"]);

export type Emotion = "joy" | "sad" | "angry" | "anxious" | "tired" | "love" | "neutral";

export interface Feeling {
  /** -1..1 */
  score: number;
  emotion: Emotion;
}

const EMOTION_WORDS: [Emotion, RegExp][] = [
  ["love", /\b(love|adore|crush|miss you|cuddle)\b/],
  ["angry", /\b(angry|mad|pissed|furious|annoyed|hate)\b/],
  ["anxious", /\b(nervous|anxious|worried|scared|stressed|panic)\b/],
  ["tired", /\b(tired|sleepy|exhausted|drained|burnt out)\b/],
  ["sad", /\b(sad|down|lonely|cry|crying|depressed|miserable|upset)\b/],
  ["joy", /\b(happy|excited|yay|great|awesome|amazing|stoked|thrilled)\b/],
];

/** How a message feels, from its words (a negation flips the next couple of words). */
export function feeling(text: string): Feeling {
  const ws = (text.toLowerCase().match(/[a-z']+/g) ?? []).map((w) => w.replace(/'/g, ""));
  let sum = 0;
  let hits = 0;
  let flip = 0;
  for (const w of ws) {
    if (NEGATE.has(w)) {
      flip = 2;
      continue;
    }
    const v = VALENCE[w];
    if (v !== undefined) {
      sum += flip > 0 ? -v * 0.8 : v;
      hits++;
    }
    if (flip > 0) flip--;
  }
  if (/[😭😢😞💔😡]/u.test(text)) (sum -= 2), hits++;
  if (/[😊😄😁🥳❤️💕🎉]/u.test(text)) (sum += 2), hits++;
  const score = hits ? Math.max(-1, Math.min(1, sum / (3 * Math.sqrt(hits)))) : 0;
  const lower = text.toLowerCase();
  const named = EMOTION_WORDS.find(([, re]) => re.test(lower))?.[0];
  const emotion: Emotion = named && !(named === "joy" && score < 0) ? named : score > 0.25 ? "joy" : score < -0.25 ? "sad" : "neutral";
  return { score, emotion };
}
