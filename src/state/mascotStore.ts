import { SPICY_SHARE, spicyAllowed } from "../lib/mascotSpicy";
import { create } from "zustand";
import { useSettingsStore } from "./settingsStore";
import {
  ANNOYED_REFUSE_MS,
  countRecent,
  DOWNLOAD_BATCH,
  DRAG_SPREE,
  FAV_STREAK,
  petReaction,
  pickLine,
  POPULAR_FAV_COUNT,
  REACTIONS,
  SHINY_ODDS,
  shouldPlay,
  type Playing,
  type ReactionKind,
} from "../lib/mascot";

export interface ActiveReaction {
  kind: ReactionKind;
  /** Bumps on every play, so the same kind twice in a row still restarts its animation. */
  id: number;
  line: string | null;
  /** Emoji for the feed - the reaction's own, or a per-call `vars.emoji` override. */
  emoji: string[];
}

interface MascotState {
  active: ActiveReaction | null;
  sleeping: boolean;
  /** How many things are making him think (a favorites analysis running) - >0 = thinking pose. */
  thinking: number;
  setThinking: (on: boolean) => void;
  /** Right-click > Hide - until the app restarts. */
  hiddenForSession: boolean;
  /** When he was hidden - the undo pill only shows for a few seconds after this. */
  hiddenAt: number | null;
  lastPlayed: Partial<Record<ReactionKind, number>>;
  lastSpokeAt: number | null;
  /** MascotLayers mounted *inside* an overlay (the Games sheet) - while any is up, an open
   *  overlay doesn't count as covering him. */
  overlayHosts: number;
  /** The best reaction that fired while he was covered (viewer, Settings, ...) - played on return. */
  pending: { kind: ReactionKind; vars?: Record<string, string> } | null;
  /** Fire a reaction. Safe to call from anywhere, any time - throttling, mode and priority are
   *  all decided here, so callers never need to check settings. */
  react: (kind: ReactionKind, vars?: Record<string, string>) => void;
  setSleeping: (sleeping: boolean) => void;
  hideForSession: () => void;
  /** Undo for hideForSession (the undo pill, or Settings > Mascot > Restore). */
  restore: () => void;
  registerOverlayHost: () => () => void;
  /** Play (and clear) the held reaction - called when the last overlay closes. */
  flushPending: () => void;
  /** When anything last played - drives the ambient fidget. */
  lastReactAt: number;
  /** Companion click. Combos: flustered, then annoyed (refuses pets for a minute). */
  pet: () => void;
  /** Companion dropped after a drag - a few in quick succession and he's manhandled. */
  dragged: () => void;
  /** A favorite went through - picks shiny / streak / bold / popular / plain. */
  favorited: (score: number, favCount: number) => void;
  /** A download finished - several close together become one "batch" reaction. */
  downloaded: () => void;
}

// Rolling timestamps for the combo reactions (not state - nothing renders from them).
const INTRODUCED_KEY = "mascot.introduced";
let petStamps: number[] = [];
let refusePetsUntil = 0;
let dragStamps: number[] = [];
let favStamps: number[] = [];
let downloadStamps: number[] = [];
let batchFired = false;
const trim = (stamps: number[], now: number, windowMs: number) => stamps.filter((t) => now - t < windowMs);

/** The grid companion is under a full-screen overlay (viewer, Settings, any sheet) and no
 *  overlay-hosted layer can show the reaction instead. `data-overlay` is set by
 *  pushOverlayDepth (lib/theme.ts), which every overlay and the viewer call. */
function covered(overlayHosts: number): boolean {
  return document.documentElement.dataset.overlay !== undefined && overlayHosts === 0;
}

let seq = 0;
let clearTimer: number | undefined;

export const useMascotStore = create<MascotState>((set, get) => ({
  active: null,
  sleeping: false,
  thinking: 0,
  hiddenForSession: false,
  hiddenAt: null,
  lastPlayed: {},
  lastSpokeAt: null,
  overlayHosts: 0,
  pending: null,
  lastReactAt: Date.now(),

  react: (kind, vars) => {
    const settings = useSettingsStore.getState();
    const { mascotMode, mascotTalk } = settings;
    const state = get();
    if (state.hiddenForSession || mascotMode === "off") return;
    if (covered(state.overlayHosts)) {
      // Hold it (no cooldown spent) - keep whichever held reaction matters most.
      const held = state.pending;
      if (kind !== "wake" && (!held || REACTIONS[kind].priority >= REACTIONS[held.kind].priority)) {
        set({ pending: { kind, vars } });
      }
      return;
    }
    const now = Date.now();
    const playing: Playing | null = state.active
      ? { kind: state.active.kind, startedAt: state.lastPlayed[state.active.kind] ?? 0 }
      : null;
    if (!shouldPlay(kind, mascotMode, now, state.lastPlayed, playing)) return;
    const spicy = spicyAllowed(settings) && Math.random() < SPICY_SHARE;
    const line = pickLine(kind, mascotTalk, now, state.lastSpokeAt, Math.random(), vars, spicy);
    // Speech stretches the reaction so there's time to read it.
    const duration = REACTIONS[kind].durationMs + (line ? 1800 : 0);
    set({
      active: { kind, id: ++seq, line, emoji: vars?.emoji ? [vars.emoji] : REACTIONS[kind].emoji },
      sleeping: false,
      lastPlayed: { ...state.lastPlayed, [kind]: now },
      lastSpokeAt: line ? now : state.lastSpokeAt,
      lastReactAt: now,
    });
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(() => set({ active: null }), duration);
  },

  setThinking: (on) => set((s) => ({ thinking: Math.max(0, s.thinking + (on ? 1 : -1)) })),

  setSleeping: (sleeping) => {
    if (get().sleeping === sleeping) return;
    set({ sleeping });
  },

  hideForSession: () => set({ hiddenForSession: true, hiddenAt: Date.now(), active: null }),
  restore: () => {
    set({ hiddenForSession: false });
    get().react("restored");
  },

  pet: () => {
    const now = Date.now();
    // The very first pet gets an introduction instead.
    if (localStorage.getItem(INTRODUCED_KEY) !== "1") {
      localStorage.setItem(INTRODUCED_KEY, "1");
      get().react("intro");
      return;
    }
    if (now < refusePetsUntil) {
      get().react("wake"); // a curt little shake - "no"
      return;
    }
    petStamps = trim([...petStamps, now], now, 10_000);
    const kind = petReaction(petStamps, now);
    if (kind === "annoyed") {
      refusePetsUntil = now + ANNOYED_REFUSE_MS;
      petStamps = [];
    }
    get().react(kind);
  },

  dragged: () => {
    const now = Date.now();
    dragStamps = trim([...dragStamps, now], now, DRAG_SPREE.windowMs);
    if (dragStamps.length >= DRAG_SPREE.count) {
      dragStamps = [];
      get().react("manhandled");
    }
  },

  favorited: (score, favCount) => {
    const now = Date.now();
    favStamps = trim([...favStamps, now], now, FAV_STREAK.windowMs);
    const react = get().react;
    if (Math.random() < SHINY_ODDS) react("shinyFav");
    else if (favStamps.length >= FAV_STREAK.count) {
      favStamps = [];
      react("favStreak");
    } else if (score < 0) react("boldChoice");
    else if (favCount >= POPULAR_FAV_COUNT) react("popularFav");
    else react("favorite");
  },

  downloaded: () => {
    const now = Date.now();
    downloadStamps = trim([...downloadStamps, now], now, DOWNLOAD_BATCH.windowMs);
    if (downloadStamps.length === 1) batchFired = false;
    if (!batchFired && countRecent(downloadStamps, now, DOWNLOAD_BATCH.windowMs) >= DOWNLOAD_BATCH.count) {
      batchFired = true;
      get().react("downloadBatch");
    } else if (!batchFired) get().react("download");
  },

  registerOverlayHost: () => {
    set((s) => ({ overlayHosts: s.overlayHosts + 1 }));
    return () => set((s) => ({ overlayHosts: s.overlayHosts - 1 }));
  },

  flushPending: () => {
    const held = get().pending;
    if (!held) return;
    set({ pending: null });
    get().react(held.kind, held.vars);
  },
}));

/** Shorthand for call sites outside React. */
export function mascotReact(kind: ReactionKind, vars?: Record<string, string>) {
  useMascotStore.getState().react(kind, vars);
}
