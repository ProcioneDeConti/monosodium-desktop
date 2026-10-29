// Gus's optional "smart brain": a small sentence-embedding model (all-MiniLM-L6-v2, ~23 MB) run
// locally in the webview through transformers.js. Still not an LLM - it never writes anything. It
// only compares meanings, so Gus can tell which of his own hand-written rules or lines fits what
// you said, and how you're feeling, when the wording doesn't match any regex.
//
// Opt-in (Talk to Gus's "Smart" toggle). The library is a lazy chunk and the model is downloaded
// from Hugging Face on first use, then cached by the webview - the installer doesn't grow.
import { create } from "zustand";
import { INTENT_EXAMPLES, type Emotion } from "./gusIntents";

export type SemanticStatus = { state: "off" } | { state: "loading"; progress: number } | { state: "ready" } | { state: "error"; message: string };

export const useSemanticStatus = create<{ status: SemanticStatus }>(() => ({ status: { state: "off" } }));
const setStatus = (status: SemanticStatus) => useSemanticStatus.setState({ status });

/** What the model makes of a message - passed into gusChat's respond() via ChatEnv. */
export interface SemanticHint {
  intent?: { id: string; score: number };
  emotion?: { name: Emotion; score: number };
  /** His own lines closest in meaning, best first. */
  lines?: { text: string; score: number }[];
}

const MODEL = "Xenova/all-MiniLM-L6-v2";

/** A few example sentences per feeling - the closest group wins. */
const EMOTION_EXAMPLES: Record<Exclude<Emotion, "neutral">, string[]> = {
  joy: ["i'm so happy", "this is the best day", "i got great news", "everything went perfectly"],
  sad: ["i feel really down", "i miss them so much", "nothing is going right", "i want to cry"],
  angry: ["i'm so angry right now", "this is infuriating", "they really pissed me off"],
  anxious: ["i'm nervous about tomorrow", "i can't stop worrying", "i'm scared it'll go wrong"],
  tired: ["i'm exhausted", "i barely slept", "i have no energy left"],
  love: ["i love you so much", "you mean everything to me", "i have a crush on you"],
};

type Embed = (texts: string[]) => Promise<Float32Array[]>;
let embed: Embed | null = null;
let loading: Promise<void> | null = null;
let intentVecs: { id: string; v: Float32Array }[] = [];
let emotionVecs: { name: Emotion; v: Float32Array }[] = [];
/** Line index for retrieval, built in the background per corpus (see indexLines). */
let lineIndex: { key: string; lines: string[]; vecs: Float32Array[] } | null = null;

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Downloads (first time) and warms up the model. Safe to call repeatedly. */
export function loadSemantic(): Promise<void> {
  if (loading) return loading;
  setStatus({ state: "loading", progress: 0 });
  loading = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    // Straight from Hugging Face - a "local" lookup would hit the app's own origin and get index.html.
    env.allowLocalModels = false;
    const files = new Map<string, { loaded: number; total: number }>();
    const extractor = await pipeline("feature-extraction", MODEL, {
      dtype: "q8",
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== "progress" || !p.file) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) (loaded += f.loaded), (total += f.total);
        if (total) setStatus({ state: "loading", progress: loaded / total });
      },
    });
    embed = async (texts) => {
      const out = await extractor(texts, { pooling: "mean", normalize: true });
      const dim = out.dims[out.dims.length - 1];
      const data = out.data as Float32Array;
      return texts.map((_, i) => data.slice(i * dim, (i + 1) * dim));
    };
    const ex = Object.entries(INTENT_EXAMPLES).flatMap(([id, xs]) => xs.map((x) => ({ id, x })));
    const iv = await embed(ex.map((e) => e.x));
    intentVecs = ex.map((e, i) => ({ id: e.id, v: iv[i] }));
    const em = Object.entries(EMOTION_EXAMPLES).flatMap(([name, xs]) => xs.map((x) => ({ name: name as Emotion, x })));
    const ev = await embed(em.map((e) => e.x));
    emotionVecs = em.map((e, i) => ({ name: e.name, v: ev[i] }));
    setStatus({ state: "ready" });
  })().catch((e: unknown) => {
    loading = null;
    embed = null;
    setStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
  });
  return loading;
}

/** Embeds his plain lines a batch at a time in the background, so retrieval is there once it's
 *  done without blocking a reply. Rebuilt only when the line set changes (tier flip). */
export async function indexLines(lines: string[]): Promise<void> {
  const key = `${lines.length}:${lines[0] ?? ""}:${lines[lines.length - 1] ?? ""}`;
  if (!embed || lineIndex?.key === key) return;
  const vecs: Float32Array[] = [];
  const pending = { key, lines, vecs: [] as Float32Array[] };
  lineIndex = null;
  for (let i = 0; i < lines.length; i += 32) {
    vecs.push(...(await embed(lines.slice(i, i + 32))));
    await new Promise((r) => setTimeout(r, 0));
  }
  pending.vecs = vecs;
  lineIndex = pending;
}

/** Null when the model isn't loaded - respond() then runs on the word-based fallbacks alone. */
export async function semanticHint(text: string): Promise<SemanticHint | null> {
  if (!embed) return null;
  const [v] = await embed([text]);
  const hint: SemanticHint = {};
  for (const e of intentVecs) {
    const s = dot(v, e.v);
    if (!hint.intent || s > hint.intent.score) hint.intent = { id: e.id, score: s };
  }
  for (const e of emotionVecs) {
    const s = dot(v, e.v);
    if (!hint.emotion || s > hint.emotion.score) hint.emotion = { name: e.name, score: s };
  }
  if (lineIndex) {
    const scored = lineIndex.vecs.map((lv, i) => ({ text: lineIndex!.lines[i], score: dot(v, lv) }));
    hint.lines = scored.sort((a, b) => b.score - a.score).slice(0, 5);
  }
  return hint;
}
