// Local state for the Games launcher's post-based games, in its own JSON file (same reasoning as
// tagdleStore.ts - self-contained, not general settings): best scores per game + site, and the
// Six Degrees daily results. Tagdle keeps its own store.

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { e621Api } from "../api/client";
import { EMPTY_MEMORY, type ChatMemory } from "../lib/gusChat";
import type { PetState } from "../lib/gusPet";
import { GAME_SPECIES, isRealArtist, leafSpecies, MIN_SPECIES_POSTS } from "../lib/games";
import type { Site } from "../models/site";
import { loadPool } from "./tagdleStore";

const STORE_FILE = "games.json";

interface GamesState {
  isLoaded: boolean;
  /** `${key}:${site}` -> best value. Keys are game-chosen (e.g. "higherLower:score"). */
  best: Record<string, number>;
  /** `${site}:${dayKey}` -> hops taken, or null for a given-up daily. */
  sixDaily: Record<string, number | null>;
  /** Higher-is-better best (streaks, quiz scores). */
  recordBest: (key: string, value: number) => void;
  /** Lower-is-better best (Six Degrees hops). */
  recordLowest: (key: string, value: number) => void;
  recordSixDaily: (key: string, hops: number | null) => void;
  /** Games draw only from the signed-in user's favorites (where the game supports it). */
  favoritesOnly: boolean;
  setFavoritesOnly: (on: boolean) => void;
  /** Background music while the Games panel is open. */
  musicOn: boolean;
  setMusicOn: (on: boolean) => void;
  /** The Gus pet game's state (null until first opened - he "hatches" then). */
  pet: PetState | null;
  setPet: (pet: PetState | null) => void;
  /** Talk to Gus: what he remembers about you, and how much he likes you. */
  chat: ChatMemory;
  setChat: (chat: ChatMemory) => void;
  /** Opt-in "nasty" tier - only takes effect while adult mode + Explicit are on. */
  chatNasty: boolean;
  setChatNasty: (on: boolean) => void;
  /** Opt-in: what you type trains his babbler (used only while adult mode + Explicit are on). */
  chatLearn: boolean;
  setChatLearn: (on: boolean) => void;
  learned: string[];
  addLearned: (line: string) => void;
  clearLearned: () => void;
  /** Read his replies aloud with a Windows voice. */
  chatVoice: boolean;
  setChatVoice: (on: boolean) => void;
  /** Opt-in "smart brain": the local embedding model (lib/gusSemantic.ts), downloaded on first use. */
  chatSmart: boolean;
  setChatSmart: (on: boolean) => void;
  /** His last lines, kept across sessions so he doesn't open with the same thing every time. */
  chatRecent: string[];
  setChatRecent: (lines: string[]) => void;
  /** Opt-in: at five hearts he sometimes sends a "thinking about you" notification (lib/gusPings.ts). */
  chatPings: boolean;
  setChatPings: (on: boolean) => void;
}

/** Cap on remembered training lines. */
const MAX_LEARNED = 2000;

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = e621Api.getDataDir().then((dir) => load(`${dir}/${STORE_FILE}`, { autoSave: true }));
  }
  return storePromise;
}

async function persist(key: string, value: unknown) {
  const store = await getStore();
  await store.set(key, value);
}

export const useGamesStore = create<GamesState>((set, get) => ({
  isLoaded: false,
  best: {},
  sixDaily: {},
  favoritesOnly: false,
  musicOn: true,
  pet: null,
  chat: EMPTY_MEMORY,
  chatNasty: false,
  chatLearn: false,
  learned: [],
  chatVoice: false,
  chatSmart: false,
  chatRecent: [],
  chatPings: false,

  setChat: (chat) => {
    set({ chat });
    void persist("chat", chat);
  },
  setChatNasty: (chatNasty) => {
    set({ chatNasty });
    void persist("chatNasty", chatNasty);
  },
  setChatLearn: (chatLearn) => {
    set({ chatLearn });
    void persist("chatLearn", chatLearn);
  },
  addLearned: (line) => {
    const learned = [...get().learned, line].slice(-MAX_LEARNED);
    set({ learned });
    void persist("learned", learned);
  },
  clearLearned: () => {
    set({ learned: [] });
    void persist("learned", []);
  },
  setChatSmart: (chatSmart) => {
    set({ chatSmart });
    void persist("chatSmart", chatSmart);
  },
  setChatPings: (chatPings) => {
    set({ chatPings });
    void persist("chatPings", chatPings);
  },
  setChatRecent: (chatRecent) => {
    set({ chatRecent });
    void persist("chatRecent", chatRecent);
  },
  setChatVoice: (chatVoice) => {
    set({ chatVoice });
    void persist("chatVoice", chatVoice);
  },

  setPet: (pet) => {
    set({ pet });
    void persist("pet", pet);
  },

  setMusicOn: (musicOn) => {
    set({ musicOn });
    void persist("musicOn", musicOn);
  },

  setFavoritesOnly: (favoritesOnly) => {
    set({ favoritesOnly });
    void persist("favoritesOnly", favoritesOnly);
  },

  recordBest: (key, value) => {
    if (value <= (get().best[key] ?? 0)) return;
    const best = { ...get().best, [key]: value };
    set({ best });
    void persist("best", best);
  },

  recordLowest: (key, value) => {
    const current = get().best[key];
    if (current !== undefined && value >= current) return;
    const best = { ...get().best, [key]: value };
    set({ best });
    void persist("best", best);
  },

  recordSixDaily: (key, hops) => {
    const sixDaily = { ...get().sixDaily, [key]: hops };
    set({ sixDaily });
    void persist("sixDaily", sixDaily);
  },
}));

export async function loadGames(): Promise<void> {
  if (useGamesStore.getState().isLoaded) return;
  const store = await getStore();
  const best = (await store.get<Record<string, number>>("best")) ?? {};
  const sixDaily = (await store.get<Record<string, number | null>>("sixDaily")) ?? {};
  const favoritesOnly = (await store.get<boolean>("favoritesOnly")) ?? false;
  const musicOn = (await store.get<boolean>("musicOn")) ?? true;
  const pet = (await store.get<PetState>("pet")) ?? null;
  const chat = { ...EMPTY_MEMORY, ...((await store.get<ChatMemory>("chat")) ?? {}) };
  const chatNasty = (await store.get<boolean>("chatNasty")) ?? false;
  const chatLearn = (await store.get<boolean>("chatLearn")) ?? false;
  const learned = (await store.get<string[]>("learned")) ?? [];
  const chatVoice = (await store.get<boolean>("chatVoice")) ?? false;
  const chatSmart = (await store.get<boolean>("chatSmart")) ?? false;
  const chatRecent = (await store.get<string[]>("chatRecent")) ?? [];
  const chatPings = (await store.get<boolean>("chatPings")) ?? false;
  useGamesStore.setState({
    best,
    sixDaily,
    favoritesOnly,
    musicOn,
    pet,
    chat,
    chatNasty,
    chatLearn,
    learned,
    chatVoice,
    chatSmart,
    chatRecent,
    chatPings,
    isLoaded: true,
  });
}

const SPECIES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Names per implications request - keeps the URL short and each page well under 320 rows. */
const IMPLICATION_BATCH = 50;
/** Below this the live list is suspect (API change, odd response) - use the fallback instead. */
const MIN_LIVE_SPECIES = 20;

interface CachedSpecies {
  fetchedAt: number;
  species: string[];
}

/** The species Species Guesser / Zoom Reveal draw from: Tagdle's cached top-species pool minus
 *  grouping tags, found via what each pool tag implies (about 13 rate-limited requests, cached
 *  for a week like the pool itself). Falls back to the hand-picked GAME_SPECIES on any failure. */
export async function loadGameSpecies(site: Site): Promise<string[]> {
  const store = await getStore();
  const key = `species:${site}`;
  const cached = await store.get<CachedSpecies>(key);
  if (cached && Date.now() - cached.fetchedAt < SPECIES_MAX_AGE_MS) return cached.species;
  try {
    const pool = (await loadPool(site, ["species"])).filter((t) => t.post_count >= MIN_SPECIES_POSTS);
    const implications: { antecedent_name: string; consequent_name: string }[] = [];
    for (let i = 0; i < pool.length; i += IMPLICATION_BATCH) {
      const names = pool.slice(i, i + IMPLICATION_BATCH).map((t) => t.name);
      for (let page = 1; page <= 5; page++) {
        const batch = await e621Api.getImplicationsFrom(site, names, page);
        implications.push(...batch);
        if (batch.length < 320) break;
      }
    }
    const species = leafSpecies(pool, implications);
    if (species.length < MIN_LIVE_SPECIES) return [...GAME_SPECIES];
    await store.set(key, { fetchedAt: Date.now(), species } satisfies CachedSpecies);
    return species;
  } catch {
    // Stale beats the fallback; don't cache the fallback so the next open retries.
    return cached?.species ?? [...GAME_SPECIES];
  }
}

export type ArtistTier = "easy" | "medium" | "hard";

/** Rank bands (0-based, by artist post count) for Whodunnit's difficulties. Easy/medium come from
 *  Tagdle's cached top-640 artist pool; hard is a deeper band fetched separately. */
const ARTIST_TIER_RANKS: Record<Exclude<ArtistTier, "hard">, [number, number]> = {
  easy: [0, 100],
  medium: [100, 640],
};
/** tags.json pages (320 per page) for the hard band - ranks ~1,280-1,920: real, active artists
 *  with a few hundred posts each, but not names most people know. */
const HARD_ARTIST_PAGES = [5, 6];

/** The artists one Whodunnit difficulty draws from (answers and decoys alike, so decoys are as
 *  obscure as the answer). Cached a week, like the other pools. */
export async function loadArtistTier(site: Site, tier: ArtistTier): Promise<string[]> {
  if (tier !== "hard") {
    const pool = (await loadPool(site, ["artist"]))
      .filter((t) => isRealArtist(t.name))
      .sort((a, b) => b.post_count - a.post_count);
    const [from, to] = ARTIST_TIER_RANKS[tier];
    return pool.slice(from, to).map((t) => t.name);
  }
  const store = await getStore();
  const key = `artistsHard:${site}`;
  const cached = await store.get<CachedSpecies>(key);
  if (cached && Date.now() - cached.fetchedAt < SPECIES_MAX_AGE_MS) return cached.species;
  const names: string[] = [];
  for (const page of HARD_ARTIST_PAGES) {
    const batch = await e621Api.getTopTags(site, 1, page, 320);
    names.push(...batch.map((t) => t.name).filter(isRealArtist));
  }
  await store.set(key, { fetchedAt: Date.now(), species: names } satisfies CachedSpecies);
  return names;
}
