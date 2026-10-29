import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Brain, Flame, Heart, Send, Trash2, Volume2, VolumeX } from "lucide-react";
import { buildBabbler, EMPTY_MEMORY, respond, stageFor, type GusReply, type Stage, type Tier } from "../../lib/gusChat";
import { commentOnPost, sharedThumb, takeSharedPost } from "../../lib/gusShare";
import { cooledHeat, greeting } from "../../lib/gusBrain";
import { act, advance, ageDays } from "../../lib/gusPet";
import { EMPTY_CONV, quickReplies, tagCountReply, type ChatStats, type ConvState } from "../../lib/gusSmarts";
import { e621Api } from "../../api/client";
import type { Site } from "../../models/site";
import { useStatsStore } from "../../state/statsStore";
import { visiblePosts } from "../../lib/blacklist";
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
  /** When it was sent (ms) - drives the time dividers. Missing on logs from before it existed. */
  at?: number;
  /** A post shared from the viewer - shown as its thumbnail. */
  image?: string;
}

const RECENT_MAX = 15;

/** The conversation survives the panel closing (a search, Back) for the rest of the session. */
let sessionLog: Message[] | null = null;
/** What he just asked / what you were on about - kept alongside the log. */
let sessionConv: ConvState = EMPTY_CONV;

/** The bits of the local stats he can talk about. */
function chatStats(): ChatStats {
  const s = useStatsStore.getState();
  return {
    topSearches: Object.entries(s.searchTermCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t),
    postsViewed: s.lifetime.postsViewed,
    favoritesAdded: s.lifetime.favoritesAdded,
    searches: s.lifetime.searches,
    activeMs: s.lifetime.activeMs,
    sessions: s.lifetime.sessions,
  };
}
const STAGE_LABEL: Record<Stage, string> = { stranger: "Acquaintance", friend: "Friend", crush: "Crush" };

/** "Talk to Gus": a chat with the layered rule/ELIZA/MegaHAL brain in lib/gusChat.ts. Replies
 *  arrive after a short "typing" pause sized to their length. */
export function GusChat({
  site,
  onSearch,
  onOpenPopular,
}: {
  site: Site;
  onSearch?: (query: string) => void;
  onOpenPopular?: () => void;
}) {
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
        {
          id: 0,
          at: Date.now(),
          from: "gus",
          text: greeting(chat.lastSeen, {
            tier,
            stage: stageFor(chat.affection),
            heat: cooledHeat(chat.heat, chat.heatAt, Date.now()),
            name: chat.name,
            now: new Date(),
            topSearches: [],
          }),
        },
      ],
  );
  const [draft, setDraft] = useState("");
  const [conv, setConv] = useState(sessionConv);
  const [typing, setTyping] = useState(false);
  const [motion, setMotion] = useState<{ id: number; m: MascotMotion } | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const nextId = useRef(Math.max(0, ...messages.map((m) => m.id)) + 1);
  /** Messages already there when the panel opened don't animate in again. */
  const initialMaxId = useRef(nextId.current - 1);
  const recent = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const sharedReplies = useRef<GusReply[] | null>(null);
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

  /** Posts Gus's replies one by one, each after a typing pause sized to its length. Returns
   *  when (ms from now) the last one lands. */
  function deliver(replies: GusReply[]): number {
    if (!replies.length) return 0;
    setTyping(true);
    let at = 0;
    replies.forEach((reply, i) => {
      at += Math.min(2200, 450 + reply.text.length * 28) + (i ? 500 : 0);
      later(at, () => {
        recent.current = [...recent.current, reply.text].slice(-RECENT_MAX);
        setMessages((m) => [...m, { id: nextId.current++, at: Date.now(), from: "gus", text: reply.text }]);
        if (reply.motion) setMotion({ id: nextId.current, m: reply.motion });
        speak(reply.text);
        if (i === replies.length - 1) setTyping(false);
      });
    });
    return at;
  }

  // A post shared from the viewer ("Share with Gus"): show it, and let him react.
  // The take/post/remember part runs once (kept in a ref); delivery runs on every effect pass, because
  // StrictMode's mount-unmount-mount clears the timers from the first pass, which left him "typing"
  // forever with the post already taken.
  useEffect(() => {
    if (!sharedReplies.current) {
      const post = takeSharedPost();
      if (!post) return;
      setMessages((m) => [...m, { id: nextId.current++, at: Date.now(), from: "you", text: "", image: sharedThumb(post) ?? undefined }]);
      const state = useGamesStore.getState();
      const { replies, topic } = commentOnPost(post, { tier, likes: state.chat.likes, dislikes: state.chat.dislikes });
      setConv((sessionConv = { ...sessionConv, expect: null, subject: undefined, topic }));
      state.setChat({ ...state.chat, affection: Math.min(100, state.chat.affection + 1) });
      sharedReplies.current = replies;
    }
    deliver(sharedReplies.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send(e?: FormEvent, quick?: string) {
    e?.preventDefault();
    const text = (quick ?? draft).trim();
    if (!text || typing) return;
    if (quick === undefined) setDraft("");
    setMessages((m) => [...m, { id: nextId.current++, at: Date.now(), from: "you", text }]);

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
      conv: sessionConv,
      stats: chatStats(),
    });
    if (!result) return;
    setConv((sessionConv = result.conv));

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

    const at = deliver(result.replies);
    if (result.lookup) {
      const { tag } = result.lookup;
      const asked = e621Api
        .getTag(site, tag)
        .then((info) => info?.post_count ?? null)
        .catch(() => null);
      // Said once both the "counting…" line has shown and the answer is in.
      later(at + 200, () => {
        setTyping(true);
        void asked.then((count) => {
          const text = tagCountReply(tag, count, tier);
          recent.current = [...recent.current, text].slice(-RECENT_MAX);
          setMessages((m) => [...m, { id: nextId.current++, at: Date.now(), from: "gus", text }]);
          setMotion({ id: nextId.current, m: count ? "nod" : "shrug" });
          speak(text);
          setTyping(false);
        });
      });
    }
    if (result.sendPic) {
      const { query, after } = result.sendPic;
      const settings = useSettingsStore.getState();
      const rating = settings.ratingTagFilter() ?? "";
      const asked = e621Api
        .getPosts(site, `${query} ${rating}`.trim(), 40)
        .then((r) => visiblePosts(r.posts, settings.blacklistEntries, settings.blacklistDisabled))
        .then((posts) => posts.filter((p) => p.sample.url ?? p.preview.url))
        .then((posts) => (posts.length ? posts[Math.floor(Math.random() * posts.length)] : null))
        .catch(() => null);
      later(at + 300, () => {
        setTyping(true);
        void asked.then((post) => {
          const url = post ? (post.sample.url ?? post.preview.url ?? undefined) : undefined;
          setMessages((m) => [
            ...m,
            url
              ? { id: nextId.current++, at: Date.now(), from: "gus", text: "", image: url }
              : { id: nextId.current++, at: Date.now(), from: "gus", text: "Ugh, my camera's broken. Ask me later." },
          ]);
          setTyping(false);
          if (url) later(1200, () => deliver([{ text: after, motion: "wobble" }]));
        });
      });
    }
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
    setConv((sessionConv = EMPTY_CONV));
    setConfirmForget(false);
    setMessages([{ id: nextId.current++, at: Date.now(), from: "gus", text: "Huh? Who are you? Hi! I'm Gus." }]);
  }

  const stage = stageFor(chat.affection);
  const huffy = Date.now() < chat.huffyUntil;
  const suggestions = typing ? [] : quickReplies(conv.expect, messages.filter((m) => m.from === "you").length);

  /** Up recalls what you last said, like a terminal. */
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "ArrowUp" || draft) return;
    const last = [...messages].reverse().find((m) => m.from === "you" && m.text);
    if (!last) return;
    e.preventDefault();
    setDraft(last.text);
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-3">
      <div className="flex items-center gap-3 rounded-2xl bg-neutral-900/85 px-3 py-2">
        <div key={motion?.id ?? "idle"} className={`mascot-motion ${!reduced && motion ? `mascot-m-${motion.m}` : ""}`}>
          <Mascot size={44} mood={huffy ? "sad" : "happy"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-bold">
            {MASCOT_NAME}
            <span className={`h-2 w-2 rounded-full ${huffy ? "bg-red-400" : typing ? "bg-amber-300" : "bg-emerald-400"}`} />
            <span className="text-xs font-normal opacity-60">{huffy ? "sulking" : typing ? "typing…" : "online"}</span>
          </div>
          <div className="flex items-center gap-1 text-xs opacity-80" title={`Affection ${Math.round(chat.affection)}/100`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Heart
                key={i}
                size={11}
                className={chat.affection >= (i + 1) * 20 - 10 ? "fill-pink-400 text-pink-400" : "text-white/30"}
              />
            ))}
            <span className="ml-1">{STAGE_LABEL[stage]}</span>
            {tier === "nasty" && (
              <span className="ml-2 flex items-center gap-1" title="Heat - flirting warms him up, it cools off over time">
                <Flame size={11} className="text-orange-400" />
                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/15">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 transition-[width] duration-500"
                    style={{ width: `${cooledHeat(chat.heat, chat.heatAt, Date.now())}%` }}
                  />
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 rounded-full bg-white/5 p-0.5">
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
            className={`rounded-full px-2 py-1 text-xs font-semibold transition-colors ${confirmForget ? "bg-red-500/30 text-red-300" : "opacity-60 hover:opacity-100"}`}
          >
            {confirmForget ? "Sure?" : <Trash2 size={13} />}
          </button>
        </div>
      </div>

      <div ref={logRef} className="min-h-[260px] flex-1 overflow-y-auto rounded-2xl bg-black/40 px-3 py-4 [text-shadow:none]">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const divider = timeDivider(prev?.at, m.at);
          // Runs of messages from the same side stack tightly; the last one gets the tail (and his face).
          const first = !prev || prev.from !== m.from || !!divider;
          const last = !next || next.from !== m.from || !!timeDivider(m.at, next.at);
          const mine = m.from === "you";
          return (
            <div key={m.id}>
              {divider && <div className="my-3 text-center text-[11px] font-medium text-white/40">{divider}</div>}
              <div
                className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-0.5"} ${
                  !reduced && m.id > initialMaxId.current ? "chat-in" : ""
                }`}
                title={m.at ? new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : undefined}
              >
                {!mine && <div className="w-7 shrink-0">{last && <Mascot size={28} mood={huffy ? "sad" : "happy"} bob={false} />}</div>}
                <div
                  className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl text-sm leading-relaxed shadow-sm ${
                    m.image && !m.text ? "p-1" : "px-3.5 py-2"
                  } ${
                    mine
                      ? `bg-[rgb(var(--accent))] text-white ${last ? "rounded-br-md" : ""}`
                      : `bg-neutral-100 text-neutral-900 ${last ? "rounded-bl-md" : ""}`
                  }`}
                >
                  {m.image && <img src={m.image} alt="Shared post" className="max-h-56 rounded-xl" draggable={false} />}
                  {m.text && <ChatText text={m.text} />}
                </div>
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="mt-3 flex items-end gap-2">
            <div className="w-7 shrink-0">
              <Mascot size={28} mood="happy" bob={false} />
            </div>
            <div className="flex gap-1 rounded-2xl rounded-bl-md bg-neutral-100 px-3.5 py-3" aria-label={`${MASCOT_NAME} is typing`}>
              {[0, 1, 2].map((d) => (
                <span key={d} className={`h-1.5 w-1.5 rounded-full bg-neutral-500 ${reduced ? "" : "typing-dot"}`} />
              ))}
            </div>
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="-mb-1 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                send(undefined, s);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-white/15 bg-neutral-900/80 px-3 py-1 text-xs font-medium text-white/80 transition-colors
                         hover:border-[rgb(var(--accent))] hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 rounded-full border border-white/15 bg-neutral-900/90 py-1 pl-4 pr-1 focus-within:border-[rgb(var(--accent))]">
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${MASCOT_NAME}…`}
          maxLength={300}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-white/40"
        />
        <button
          type="submit"
          disabled={!draft.trim() || typing}
          title="Send"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-white transition-opacity disabled:opacity-30"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

const DIVIDER_GAP = 10 * 60_000;

/** "Today 3:42 PM" / "Tue 9:10 AM" between messages sent far apart. */
function timeDivider(before: number | undefined, at: number | undefined): string | null {
  if (!at || (before && at - before < DIVIDER_GAP)) return null;
  if (!before) return null;
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `Today ${time}` : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
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
