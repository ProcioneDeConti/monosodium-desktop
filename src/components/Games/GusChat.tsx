import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Brain, Flame, Heart, Send, Trash2, Volume2, VolumeX } from "lucide-react";
import { buildBabbler, EMPTY_MEMORY, respond, stageFor, type Stage, type Tier } from "../../lib/gusChat";
import { act, advance, ageDays } from "../../lib/gusPet";
import { MASCOT_NAME, type MascotMotion } from "../../lib/mascot";
import { motionReduced } from "../../lib/theme";
import { useGamesStore } from "../../state/gamesStore";
import { useSettingsStore } from "../../state/settingsStore";
import { Mascot } from "../ui/Mascot";
import { resumeGameOnReturn } from "./GamesPanel";

interface Message {
  id: number;
  from: "gus" | "you";
  text: string;
}

const RECENT_MAX = 15;

/** The conversation survives the panel closing (a search, Back) for the rest of the session. */
let sessionLog: Message[] | null = null;
const STAGE_LABEL: Record<Stage, string> = { stranger: "Acquaintance", friend: "Friend", crush: "Crush" };

/** "Talk to Gus": a chat with the layered rule/ELIZA/MegaHAL brain in lib/gusChat.ts. Replies
 *  arrive after a short "typing" pause sized to their length. */
export function GusChat({ onSearch, onOpenPopular }: { onSearch?: (query: string) => void; onOpenPopular?: () => void }) {
  const adultExplicit = useSettingsStore((s) => s.adultModeEnabled && s.enabledRatings.includes("e"));
  const cheekyOn = useSettingsStore((s) => s.mascotSpicy);
  const games = useGamesStore();
  const { chat, chatNasty, chatLearn, chatVoice, learned } = games;
  const tier: Tier = !adultExplicit ? "clean" : chatNasty ? "nasty" : cheekyOn ? "cheeky" : "clean";
  const useLearned = adultExplicit && chatLearn;

  // Rebuilt when the tier or learning flips; new lines are taught incrementally after that.
  const babbler = useMemo(
    () => buildBabbler(tier, useLearned ? useGamesStore.getState().learned : []),
    [tier, useLearned],
  );

  const [messages, setMessages] = useState<Message[]>(
    () =>
      sessionLog ?? [
        { id: 0, from: "gus", text: chat.name ? `Hey, ${chat.name}! What's up?` : `Hi! I'm ${MASCOT_NAME}. Talk to me!` },
      ],
  );
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [motion, setMotion] = useState<{ id: number; m: MascotMotion } | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const nextId = useRef(Math.max(0, ...messages.map((m) => m.id)) + 1);
  const recent = useRef<string[]>([]);
  const timers = useRef<number[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const reduced = motionReduced();

  useEffect(() => {
    sessionLog = messages;
  }, [messages]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages, typing, reduced]);

  function later(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function speak(text: string) {
    if (!useGamesStore.getState().chatVoice || !window.speechSynthesis) return;
    const spoken = text.replace(/\*[^*]*\*/g, "").replace(/¦/g, ". ").trim();
    if (!spoken) return;
    const u = new SpeechSynthesisUtterance(spoken);
    u.pitch = 1.5;
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }

  function send(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;
    setDraft("");
    setMessages((m) => [...m, { id: nextId.current++, from: "you", text }]);

    const now = Date.now();
    const state = useGamesStore.getState();
    const pet = state.pet ? advance(state.pet, now) : null;
    const result = respond(text, state.chat, {
      tier,
      pet,
      ageDays: pet ? ageDays(pet, now) : 0,
      now,
      babbler,
      recent: new Set(recent.current),
    });
    if (!result) return;

    state.setChat(result.memory);
    if (pet && result.petActions.length) {
      let p = pet;
      for (const a of result.petActions) p = act(p, a, now).state;
      state.setPet(p);
    }
    // Only free-form chat is worth learning from - not searches.
    if (state.chatLearn && !result.search && text.split(/\s+/).length >= 3) {
      state.addLearned(text);
      if (useLearned) babbler.learn(text);
    }

    // Each reply after a typing pause sized to its length.
    setTyping(true);
    let at = 0;
    result.replies.forEach((reply, i) => {
      at += Math.min(2200, 450 + reply.text.length * 28) + (i ? 500 : 0);
      later(at, () => {
        recent.current = [...recent.current, reply.text].slice(-RECENT_MAX);
        setMessages((m) => [...m, { id: nextId.current++, from: "gus", text: reply.text }]);
        if (reply.motion) setMotion({ id: nextId.current, m: reply.motion });
        speak(reply.text);
        if (i === result.replies.length - 1) setTyping(false);
      });
    });
    if (!result.replies.length) setTyping(false);
    if (result.search && onSearch)
      later(at + 900, () => {
        resumeGameOnReturn("gusChat");
        onSearch(result.search!);
      });
    if (result.openPopular && onOpenPopular) later(at + 900, onOpenPopular);
  }

  function forget() {
    if (!confirmForget) {
      setConfirmForget(true);
      later(3000, () => setConfirmForget(false));
      return;
    }
    games.clearLearned();
    games.setChat(EMPTY_MEMORY);
    recent.current = [];
    setConfirmForget(false);
    setMessages([{ id: nextId.current++, from: "gus", text: "Huh? Who are you? Hi! I'm Gus." }]);
  }

  const stage = stageFor(chat.affection);
  const huffy = Date.now() < chat.huffyUntil;

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-3">
      <div className="flex items-center gap-3 rounded-2xl bg-neutral-900/85 px-3 py-2">
        <div key={motion?.id ?? "idle"} className={`mascot-motion ${!reduced && motion ? `mascot-m-${motion.m}` : ""}`}>
          <Mascot size={48} mood={huffy ? "sad" : "happy"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{MASCOT_NAME}</div>
          <div className="flex items-center gap-1 text-xs opacity-80" title={`Affection ${Math.round(chat.affection)}/100`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Heart
                key={i}
                size={11}
                className={chat.affection >= (i + 1) * 20 - 10 ? "fill-pink-400 text-pink-400" : "text-white/30"}
              />
            ))}
            <span className="ml-1">{huffy ? "Sulking" : STAGE_LABEL[stage]}</span>
          </div>
        </div>
        <Toggle
          on={tier === "nasty"}
          disabled={!adultExplicit}
          onClick={() => games.setChatNasty(!chatNasty)}
          title={
            adultExplicit
              ? chatNasty
                ? "Nasty Gus is on - he can get explicit"
                : "Let Gus get nasty (explicit talk)"
              : "Needs adult mode and the Explicit rating (Settings)"
          }
          tone="red"
        >
          <Flame size={13} /> Nasty
        </Toggle>
        <Toggle
          on={chatLearn}
          onClick={() => games.setChatLearn(!chatLearn)}
          title={
            chatLearn
              ? `Gus learns from what you type (${learned.length} lines). Only used while adult mode + Explicit are on.`
              : "Let Gus learn to talk from what you type"
          }
          tone="sky"
        >
          <Brain size={13} /> Learn
        </Toggle>
        <Toggle on={chatVoice} onClick={() => games.setChatVoice(!chatVoice)} title="Read his replies aloud" tone="sky">
          {chatVoice ? <Volume2 size={13} /> : <VolumeX size={13} />}
        </Toggle>
        <button
          type="button"
          onClick={forget}
          title="Make Gus forget you (name, likes, affection, learned lines)"
          className={`rounded-full p-1.5 text-xs transition-colors ${confirmForget ? "bg-red-500/30 text-red-300" : "opacity-60 hover:opacity-100"}`}
        >
          {confirmForget ? "Sure?" : <Trash2 size={14} />}
        </button>
      </div>

      <div ref={logRef} className="min-h-[260px] flex-1 space-y-2 overflow-y-auto rounded-2xl bg-black/40 p-3 [text-shadow:none]">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm ${
                m.from === "you"
                  ? "rounded-br-sm bg-[rgb(var(--accent))] text-white"
                  : "rounded-bl-sm border-2 border-black/80 bg-white font-semibold text-black"
              }`}
            >
              <ChatText text={m.text} />
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white/90 px-3 py-1.5 text-sm text-black">
              <span className="animate-pulse">{MASCOT_NAME} is typing…</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Say something to ${MASCOT_NAME}… (try "show me foxes", or *pets Gus*)`}
          maxLength={300}
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-neutral-900/90 px-4 py-2 text-sm outline-none
                     placeholder:text-white/40 focus:border-[rgb(var(--accent))]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || typing}
          className="flex items-center gap-1.5 rounded-full bg-[rgb(var(--accent))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Send size={14} /> Send
        </button>
      </form>
    </div>
  );
}

/** Renders *actions* in italics and a "¦aside" smaller, like the speech bubble does. */
function ChatText({ text }: { text: string }) {
  const [main, aside] = text.split("¦").map((t) => t.trim());
  const parts = main.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("*") && p.endsWith("*") ? <em key={i} className="font-normal opacity-75">{p}</em> : p))}
      {aside && <span className="mt-0.5 block text-[10px] font-medium italic opacity-60">{aside}</span>}
    </>
  );
}

function Toggle({
  on,
  disabled,
  onClick,
  title,
  tone,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  tone: "red" | "sky";
  children: ReactNode;
}) {
  const active = tone === "red" ? "border-red-400 bg-red-500/25 text-red-300" : "border-sky-400 bg-sky-500/20 text-sky-300";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-35 ${
        on ? active : "border-white/15 opacity-70 hover:opacity-100"
      }`}
    >
      {children}
    </button>
  );
}
