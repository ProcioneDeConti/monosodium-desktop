import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Flame, Heart, Send, Smile } from "lucide-react";
import { GUS_FORGET_EVENT } from "./GusChatSettings";
import { bondGreeting, EMPTY_BOND, hasFiveHearts, isPartner } from "../../lib/gusBond";
import {
  buildBabbler,
  EMPTY_MEMORY,
  openingFollowUp,
  ownVoice,
  respond,
  retrievalLines,
  stageFor,
  type GusReply,
  type Stage,
  type Tier,
} from "../../lib/gusChat";
import { browseQuip, gusDayAside, idleNudge, type BrowseStats } from "../../lib/gusLife";
import { indexLines, loadSemantic, semanticHint, useSemanticStatus, type SemanticHint } from "../../lib/gusSemantic";
import { commentOnPost, sharedThumb, takeSharedPost } from "../../lib/gusShare";
import { cooledHeat, greeting } from "../../lib/gusBrain";
import { act, advance, ageDays } from "../../lib/gusPet";
import { EMPTY_CONV, quickReplies, tagCountReply, wikiReply, type ChatStats, type ConvState } from "../../lib/gusSmarts";
import { e621Api } from "../../api/client";
import type { Site } from "../../models/site";
import { dayKey, useStatsStore } from "../../state/statsStore";
import { visiblePosts } from "../../lib/blacklist";
import { extensionOf, isVideo, previewVideoUrl, type Post } from "../../models/post";
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
  /** A video he sent (webm/mp4) - plays muted on a loop. */
  video?: string;
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
/** Today's browsing and your most-opened artist/character, for his remarks about it. */
function browseStats(): BrowseStats {
  const s = useStatsStore.getState();
  const today = s.daily[dayKey()];
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  const artist = top(s.viewedTags.artist);
  const character = top(s.viewedTags.character);
  return {
    todayViews: today?.postsViewed ?? 0,
    todaySearches: today?.searches ?? 0,
    topSearches: chatStats().topSearches,
    topArtist: artist && artist[1] >= 5 ? artist[0] : undefined,
    topCharacter: character && character[1] >= 5 ? character[0] : undefined,
  };
}

/** What to show for a post he sends: a small video encode for webm/mp4, the original for a gif
 *  (its sample is a still frame), the sample otherwise. */
function picMedia(p: Post): { image: string } | { video: string } | null {
  if (isVideo(p)) {
    const v = previewVideoUrl(p);
    return v ? { video: v } : null;
  }
  if (extensionOf(p) === "gif" && p.file.url) return { image: p.file.url };
  const url = p.sample.url ?? p.preview.url;
  return url ? { image: url } : null;
}

/** How long the embedding model gets to look at a message before he answers without it. */
const SEMANTIC_WAIT_MS = 600;
/** Going quiet this long after his last message gets a nudge (once per silence). */
const IDLE_NUDGE_MS = 75_000;

/** Long replies arrive as a couple of bubbles, split between sentences, like a person typing. */
function splitBubbles(reply: GusReply): GusReply[] {
  if (reply.text.length < 90 || reply.text.includes("¦")) return [reply];
  const parts = reply.text.match(/[^.!?…]+(?:[.!?…]+["')*]*|$)\s*/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
  if (parts.length < 2) return [reply];
  const half = Math.ceil(parts.length / 2);
  const out = [parts.slice(0, half).join(" "), parts.slice(half).join(" ")];
  // Never split inside an *action*.
  if (out.some((t) => (t.match(/\*/g) ?? []).length % 2)) return [reply];
  return [{ ...reply, text: out[0] }, { text: out[1] }];
}

/** Now and then he fat-fingers a word and corrects it in a follow-up bubble ("*bins"). */
function withTypo(reply: GusReply, rnd: () => number): GusReply[] {
  if (rnd() > 0.05 || /[*¦]/.test(reply.text)) return [reply];
  const words = reply.text.match(/[a-z]{5,}/g);
  if (!words) return [reply];
  const w = words[Math.floor(rnd() * words.length)];
  const i = 1 + Math.floor(rnd() * (w.length - 2));
  const typo = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
  if (typo === w) return [reply];
  return [{ ...reply, text: reply.text.replace(new RegExp(`\\b${w}\\b`), typo) }, { text: `*${w}` }];
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
  const { chat, chatNasty, chatLearn, chatSmart } = games;
  const bond = { ...EMPTY_BOND, ...chat.bond };
  const fiveHearts = hasFiveHearts(chat.affection);
  const partner = isPartner(bond, chat.affection);
  /** The fire bar flashes when it maxes out. */
  const [flash, setFlash] = useState(false);
  const smart = useSemanticStatus((s) => s.status);
  const tier: Tier = !adultExplicit ? "clean" : chatNasty ? "nasty" : cheekyOn ? "cheeky" : "clean";
  const useLearned = adultExplicit && chatLearn;

  // Rebuilt when the tier or learning flips; new lines are taught incrementally after that.
  const babbler = useMemo(
    () => buildBabbler(tier, useLearned ? useGamesStore.getState().learned : []),
    [tier, useLearned],
  );

  // A new chat opens with anything that's happened since you told him about it ("how'd the exam go?").
  const [opener] = useState(() => (sessionLog ? null : openingFollowUp(chat, Date.now())));
  const [messages, setMessages] = useState<Message[]>(
    () =>
      sessionLog ?? [
        {
          id: 0,
          at: Date.now(),
          from: "gus",
          text: (fiveHearts && chat.lastSeen ? bondGreeting((Date.now() - chat.lastSeen) / 3600_000, chat.name, partner, Math.random) : null) ?? greeting(chat.lastSeen, {
            tier,
            stage: stageFor(chat.affection),
            heat: cooledHeat(chat.heat, chat.heatAt, Date.now()),
            name: chat.name,
            now: new Date(),
            topSearches: [],
          }),
        },
        ...(opener ? [{ id: 1, at: Date.now(), from: "gus" as const, text: opener.text }] : []),
      ],
  );
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  const [conv, setConv] = useState(sessionConv);
  const [typing, setTyping] = useState(false);
  const [motion, setMotion] = useState<{ id: number; m: MascotMotion } | null>(null);
  const nextId = useRef(Math.max(0, ...messages.map((m) => m.id)) + 1);
  /** Messages already there when the panel opened don't animate in again. */
  const initialMaxId = useRef(nextId.current - 1);
  const recent = useRef<string[]>(useGamesStore.getState().chatRecent);
  /** Set once he's nudged you during a silence - one nudge, not a stream of them. */
  const nudged = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const sharedReplies = useRef<GusReply[] | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const reduced = motionReduced();

  useEffect(() => {
    sessionLog = messages;
  }, [messages]);
  useEffect(() => {
    if (!emojiOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (!emojiRef.current?.contains(e.target as Node)) setEmojiOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [emojiOpen]);

  /** Drops an emoji in at the cursor (or the end), keeping focus in the box. */
  function insertEmoji(e: string) {
    const el = inputRef.current;
    const at = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? at;
    const next = (draft.slice(0, at) + e + draft.slice(end)).slice(0, 300);
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + e.length, at + e.length);
    });
  }
  useEffect(() => {
    if (!opener) return;
    useGamesStore.getState().setChat(opener.memory);
    setConv((sessionConv = { ...sessionConv, expect: opener.expect }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The smart brain: load the model (from cache after the first time), then index his lines.
  useEffect(() => {
    if (chatSmart) void loadSemantic();
  }, [chatSmart]);
  useEffect(() => {
    if (chatSmart && smart.state === "ready") void indexLines(retrievalLines(tier));
  }, [chatSmart, smart.state, tier]);
  // Go quiet on him and he double-texts, once.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (typing || messages.length < 3 || last?.from !== "gus" || nudged.current) return;
    const t = window.setTimeout(() => {
      if (inputRef.current?.value) return;
      nudged.current = true;
      const said = sessionConv.volunteered ?? [];
      const extra = [
        said.includes("day") ? null : gusDayAside(new Date(), Math.random),
        said.includes("browse") ? null : browseQuip(browseStats(), tier, Math.random),
      ];
      deliver([{ text: idleNudge(Math.random, extra), motion: "tilt" }]);
    }, IDLE_NUDGE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, typing]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages, typing, reduced]);

  function later(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function rememberSaid(text: string) {
    recent.current = [...recent.current, text].slice(-RECENT_MAX);
    useGamesStore.getState().setChatRecent(recent.current);
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
  function deliver(given: GusReply[]): number {
    if (!given.length) return 0;
    const replies = given.flatMap(splitBubbles).flatMap((r) => withTypo(r, Math.random));
    setTyping(true);
    // A moment to "read" before he starts typing, then each bubble takes as long as it's long.
    let at = 200 + Math.random() * 500;
    replies.forEach((reply, i) => {
      const correction = /^\*\w+$/.test(reply.text);
      at += correction ? 350 : Math.min(2400, 350 + reply.text.length * (24 + Math.random() * 10)) + (i ? 350 + Math.random() * 400 : 0);
      // Nervous: starts typing, stops, starts again.
      if (reply.hesitate) {
        later(at, () => setTyping(false));
        later(at + 900, () => setTyping(true));
        at += 1800;
      }
      later(at, () => {
        rememberSaid(reply.text);
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
    nudged.current = false;
    if (useSemanticStatus.getState().status.state !== "ready") return reply(text, null);
    // Let the embedding model look first - but never keep him waiting on it.
    setTyping(true);
    const timeout = new Promise<null>((r) => window.setTimeout(() => r(null), SEMANTIC_WAIT_MS));
    void Promise.race([semanticHint(text).catch(() => null), timeout]).then((hint) => reply(text, hint));
  }

  function reply(text: string, semantic: SemanticHint | null) {
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
      browse: browseStats(),
      semantic,
      learn: useLearned,
    });
    if (!result) return setTyping(false);
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
      if (useLearned) babbler.learn(ownVoice(text));
    }

    const at = deliver(result.replies);
    if (!at) setTyping(false);
    if (result.overheat) later(Math.max(0, at - 1500), () => {
      setFlash(true);
      later(2500, () => setFlash(false));
    });
    if (result.lookup) {
      const { tag, kind } = result.lookup;
      const asked: Promise<string> =
        kind === "wiki"
          ? e621Api
              .getWikiPage(site, tag)
              .then((page) => page?.body ?? null)
              .catch(() => null)
              .then((body) => wikiReply(tag, body))
          : e621Api
              .getTag(site, tag)
              .then((info) => info?.post_count ?? null)
              .catch(() => null)
              .then((count) => tagCountReply(tag, count, tier));
      // Said once both the "counting…" line has shown and the answer is in.
      later(at + 200, () => {
        setTyping(true);
        void asked.then((text) => {
          rememberSaid(text);
          setMessages((m) => [...m, { id: nextId.current++, at: Date.now(), from: "gus", text }]);
          setMotion({ id: nextId.current, m: /^Hmm/.test(text) ? "shrug" : "nod" });
          speak(text);
          setTyping(false);
        });
      });
    }
    if (result.sendPic) {
      const { query, after, fallback } = result.sendPic;
      const settings = useSettingsStore.getState();
      const rating = settings.ratingTagFilter() ?? "";
      const find = (q: string): Promise<Post | null> =>
        e621Api
          .getPosts(site, `${q} ${rating}`.trim(), 40)
          .then((r) => visiblePosts(r.posts, settings.blacklistEntries, settings.blacklistDisabled))
          .then((posts) => posts.filter((p) => picMedia(p)))
          .then((posts) => (posts.length ? posts[Math.floor(Math.random() * posts.length)] : null))
          .catch(() => null);
      // A video search that comes back empty falls back to a still (and a line owning up to it).
      const asked = find(query).then(async (post) =>
        post ? { post, after } : fallback ? find(fallback.query).then((p) => (p ? { post: p, after: fallback.after } : null)) : null,
      );
      later(at + 300, () => {
        setTyping(true);
        void asked.then((got) => {
          const media = got ? picMedia(got.post) : null;
          setMessages((m) => [
            ...m,
            media
              ? { id: nextId.current++, at: Date.now(), from: "gus", text: "", ...media }
              : { id: nextId.current++, at: Date.now(), from: "gus", text: "Ugh, my camera's broken. Ask me later." },
          ]);
          setTyping(false);
          if (got && media) later(1200, () => deliver([{ text: got.after, motion: "wobble" }]));
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

  // "Make Gus forget me" lives in the settings menu (GusChatSettings), which fires this.
  useEffect(() => {
    const onForget = () => forget();
    window.addEventListener(GUS_FORGET_EVENT, onForget);
    return () => window.removeEventListener(GUS_FORGET_EVENT, onForget);
  });

  function forget() {
    games.clearLearned();
    games.setChat(EMPTY_MEMORY);
    recent.current = [];
    games.setChatRecent([]);
    setConv((sessionConv = EMPTY_CONV));
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
      {/* Header: who you're talking to and how it's going. Settings live in the Games top bar
          (GusChatSettings), so this is just Gus. */}
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/95 via-neutral-900/90 to-neutral-800/90 px-3.5 py-2.5 shadow-lg [text-shadow:none]">
        {fiveHearts && !reduced && <BondSparkles />}
        <div className="relative shrink-0">
          <div className="rounded-full bg-white/5 p-0.5 ring-1 ring-white/10">
            <div key={motion?.id ?? "idle"} className={`mascot-motion ${!reduced && motion ? `mascot-m-${motion.m}` : ""}`}>
              <Mascot size={44} mood={huffy ? "sad" : "happy"} />
            </div>
          </div>
          <span
            className={`absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full ring-2 ring-neutral-900 ${huffy ? "bg-red-400" : typing ? "bg-amber-300" : "bg-emerald-400"}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-black tracking-tight">{MASCOT_NAME}</span>
            <span
              className={`rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide ${
                partner ? "bg-fuchsia-500/20 text-fuchsia-200" : stage === "crush" ? "bg-pink-500/20 text-pink-200" : stage === "friend" ? "bg-sky-500/20 text-sky-200" : "bg-white/10 text-white/70"
              }`}
            >
              {partner ? "Partner" : STAGE_LABEL[stage]}
            </span>
          </div>
          <div className={`flex items-center gap-1 text-xs ${huffy ? "text-red-300" : typing ? "text-amber-200" : "text-white/55"}`}>
            {huffy ? (
              "sulking… say sorry"
            ) : typing ? (
              <>
                typing
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className={`h-1 w-1 rounded-full bg-current ${reduced ? "" : "typing-dot"}`} style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </span>
              </>
            ) : fiveHearts ? (
              "online 💕"
            ) : (
              "online"
            )}
          </div>
        </div>

        {/* How he feels about you: hearts, and in Nasty mode the fire bar. */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div
            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ${fiveHearts ? "bg-amber-300/10 ring-1 ring-amber-300/70 shadow-[0_0_10px_rgba(252,211,77,0.35)]" : "bg-white/5"}`}
            title={`Affection ${Math.round(chat.affection)}/100${fiveHearts && bond.maxedAt ? ` · five hearts since ${new Date(bond.maxedAt).toLocaleDateString()}` : ""}`}
          >
            {Array.from({ length: 5 }, (_, i) => (
              <Heart key={i} size={13} className={chat.affection >= (i + 1) * 20 - 10 ? "fill-pink-400 text-pink-400" : "text-white/25"} />
            ))}
          </div>
          {tier === "nasty" && (
            <div className="flex items-center gap-1.5" title="Heat - flirting warms him up, it cools off over time">
              {bond.overheats > 0 && (
                <span className="text-[10px] font-bold text-orange-300" title={`He's overheated ${bond.overheats} time${bond.overheats === 1 ? "" : "s"}`}>
                  🔥×{bond.overheats}
                </span>
              )}
              <Flame size={12} className="text-orange-400" />
              <span className={`h-1.5 w-16 overflow-hidden rounded-full bg-white/10 ${flash && !reduced ? "animate-pulse ring-2 ring-orange-400" : ""}`}>
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 transition-[width] duration-500"
                  style={{ width: `${cooledHeat(chat.heat, chat.heatAt, Date.now())}%` }}
                />
              </span>
            </div>
          )}
        </div>
      </div>

      <div ref={logRef} className="min-h-[260px] flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950/70 px-3 py-4 shadow-inner backdrop-blur-sm [text-shadow:none]">
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
              {divider && (
                <div className="my-4 flex items-center gap-3 text-[11px] font-semibold text-white/40">
                  <span className="h-px flex-1 bg-white/10" />
                  {divider}
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              )}
              <div
                className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-0.5"} ${
                  !reduced && m.id > initialMaxId.current ? "chat-in" : ""
                }`}
                title={m.at ? new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : undefined}
              >
                {!mine && <div className="w-7 shrink-0">{last && <Mascot size={28} mood={huffy ? "sad" : "happy"} bob={false} />}</div>}
                <div
                  className={`max-w-[78%] whitespace-pre-wrap break-words rounded-[1.25rem] text-sm leading-relaxed shadow-md ${
                    (m.image || m.video) && !m.text ? "p-1" : "px-3.5 py-2"
                  } ${
                    mine
                      ? `bg-[rgb(var(--accent))] bg-gradient-to-br from-white/15 to-transparent text-white ${last ? "rounded-br-md" : ""}`
                      : `bg-neutral-50 text-neutral-900 ring-1 ring-black/5 ${last ? "rounded-bl-md" : ""}`
                  }`}
                >
                  {m.image && <img src={m.image} alt="Shared post" className="max-h-56 rounded-xl" draggable={false} />}
                  {m.video && <video src={m.video} autoPlay loop muted playsInline controls className="max-h-56 rounded-xl" />}
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
            <div className="flex gap-1 rounded-[1.25rem] rounded-bl-md bg-neutral-50 px-3.5 py-3 shadow-md ring-1 ring-black/5" aria-label={`${MASCOT_NAME} is typing`}>
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
              className="rounded-full border border-[rgb(var(--accent)/0.5)] bg-neutral-900/85 px-3 py-1 text-xs font-semibold text-white/85 shadow-sm transition-colors
                         hover:bg-[rgb(var(--accent))] hover:text-white [text-shadow:none]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={send}
        className="relative flex items-center gap-1 rounded-full border border-white/10 bg-neutral-900/95 py-1.5 pl-1.5 pr-1.5 shadow-lg transition-shadow [text-shadow:none]
                   focus-within:border-[rgb(var(--accent))] focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.25)]"
      >
        <div ref={emojiRef} className="shrink-0">
          <button
            type="button"
            onClick={() => setEmojiOpen(!emojiOpen)}
            title="Emoji"
            aria-expanded={emojiOpen}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${emojiOpen ? "bg-white/10 text-[rgb(var(--accent))]" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
          >
            <Smile size={18} />
          </button>
          {emojiOpen && (
            <div className="absolute bottom-full left-0 z-30 mb-2 w-72 origin-bottom-left animate-[scale-in_100ms_ease-out] rounded-2xl border border-white/10 bg-neutral-900 p-2 shadow-xl">
              {EMOJI_GROUPS.filter((g) => !g.spicy || tier !== "clean").map((g) => (
                <div key={g.label} className="mb-1 last:mb-0">
                  <div className="px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-white/40">{g.label}</div>
                  <div className="grid grid-cols-8">
                    {g.emoji.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertEmoji(e)}
                        className="rounded-lg p-1 text-lg leading-none transition-transform hover:scale-125 hover:bg-white/10"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${MASCOT_NAME}…`}
          maxLength={300}
          className="min-w-0 flex-1 bg-transparent py-1.5 pl-1 text-sm outline-none placeholder:text-white/40"
        />
        <button
          type="submit"
          disabled={!draft.trim() || typing}
          title="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-white shadow transition-[opacity,transform] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

/** The emoji picker's contents - ones Gus has reactions for come first (see gusBrain's special()). */
const EMOJI_GROUPS: { label: string; emoji: string[]; spicy?: boolean }[] = [
  { label: "Gus favourites", emoji: ["🦝", "🗑️", "🍇", "🐟", "🧀", "🍕", "🦊", "✨"] },
  { label: "Love", emoji: ["❤️", "💕", "💖", "🥰", "😍", "😘", "💘", "🫶"] },
  { label: "Feelings", emoji: ["😂", "🤣", "😊", "😁", "🥺", "😢", "😭", "😤", "😳", "🙄", "😴", "🤔", "😎", "🤗", "😇", "💀"] },
  { label: "Paws & hands", emoji: ["👋", "👍", "👎", "👏", "🙏", "🤝", "✌️", "🐾"] },
  { label: "Spicy", emoji: ["😏", "😈", "🥵", "🫦", "👅", "🍆", "🍑", "💦"], spicy: true },
];

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

/** Little hearts floating up off the hearts row while you're at five hearts. */
function BondSparkles() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-6 top-1 flex justify-between">
      {["💕", "✨", "💖", "✨"].map((e, i) => (
        <span key={i} className="bond-float text-[9px]" style={{ animationDelay: `${i * 0.7}s` }}>
          {e}
        </span>
      ))}
    </span>
  );
}
