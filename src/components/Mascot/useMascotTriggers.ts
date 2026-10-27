import { useEffect, useRef } from "react";
import { useHealthCheck } from "../../queries/useHealthCheck";
import {
  AWAY_PERK_MS,
  crossedMilestone,
  DEEP_SEARCH_PAGE,
  FIDGET_AFTER_MS,
  IDLE_SLEEP_MS,
  KONAMI,
  launchGreeting,
  LONG_SCROLL_POSTS,
  LONG_SESSION_MS,
  queryReaction,
  QUICK_HIDE,
  TAB_SPREE,
} from "../../lib/mascot";
import { mascotReact, useMascotStore } from "../../state/mascotStore";
import type { Site } from "../../models/site";
import { MAX_THUMBNAIL_SIZE_PX, MIN_THUMBNAIL_SIZE_PX, useSettingsStore } from "../../state/settingsStore";

/** Wheel events in this window that count as fling-scrolling (dizzy). */
const DIZZY_WINDOW_MS = 1500;
const DIZZY_WHEEL_EVENTS = 45;
const GREETING_DELAY_MS = 4000;
const FIDGET_CHECK_MS = 60_000;
const FIDGET_CHANCE = 0.3;
/** Previous launch time, for "missed you" - plain localStorage, it's only a timestamp. */
const LAST_LAUNCH_KEY = "mascot.lastLaunch";

// Read the previous launch once, at module load - effects can run twice (React dev), and the
// second run must not see the timestamp the first one just wrote.
const previousLaunch = Number(localStorage.getItem(LAST_LAUNCH_KEY)) || null;
localStorage.setItem(LAST_LAUNCH_KEY, String(Date.now()));

const overlayOpen = () => document.documentElement.dataset.overlay !== undefined;

/** App-level reactions that aren't tied to one user action: launch greetings, idle sleep and
 *  fidgets, scrolling and search state, connection trouble, dmail, milestones, easter eggs.
 *  Mounted once in App. Everything funnels through `react()`, which applies mode/cooldowns -
 *  so this hook never checks settings itself. */
export function useMascotTriggers({
  site,
  query,
  ownName,
  searchKey,
  loadedCount,
  pageCount,
  resultsSettled,
  tabCount,
  unreadMessageCount,
  favoriteCount,
  apiError,
}: {
  site: Site;
  /** The active search (no rating filters) - species, ordering and size reactions. */
  query: string;
  /** Signed-in username, for spotting a `fav:<you>` search. */
  ownName: string | null;
  /** Identifies the current result list - the per-search reactions fire once per key. */
  searchKey: string;
  loadedCount: number;
  pageCount: number;
  /** Results finished loading and there are no more pages (so `loadedCount` is the total). */
  resultsSettled: boolean;
  tabCount: number;
  unreadMessageCount: number;
  favoriteCount: number | null;
  /** The current search's error, if any - a 503 means we hit e621's rate limit. */
  apiError: unknown;
}) {
  // Idle -> asleep; any input wakes him (with a little startled shake).
  useEffect(() => {
    let timer = window.setTimeout(sleep, IDLE_SLEEP_MS);
    function sleep() {
      useMascotStore.getState().setSleeping(true);
    }
    function activity() {
      window.clearTimeout(timer);
      timer = window.setTimeout(sleep, IDLE_SLEEP_MS);
      if (useMascotStore.getState().sleeping) {
        useMascotStore.getState().setSleeping(false);
        mascotReact("wake");
      }
    }
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, activity));
    };
  }, []);

  // Launch greeting - holiday/birthday, missed-you, late-night, morning or weekend, whichever is
  // most special today (lib/mascot.ts launchGreeting). Then: a stretch nudge after 2h.
  useEffect(() => {
    const greeting = launchGreeting(new Date(), previousLaunch);
    const t = greeting
      ? window.setTimeout(() => mascotReact(greeting.kind, greeting.vars), GREETING_DELAY_MS)
      : undefined;
    const stretch = window.setTimeout(() => mascotReact("stretchBreak"), LONG_SESSION_MS);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(stretch);
    };
  }, []);

  // Back after a while away (window hidden / unfocused 30+ min): he perks up.
  useEffect(() => {
    let awaySince: number | null = null;
    let hiddenSince: number | null = null;
    const away = () => (awaySince ??= Date.now());
    const back = () => {
      if (awaySince != null && Date.now() - awaySince >= AWAY_PERK_MS) mascotReact("perkUp");
      awaySince = null;
    };
    // Minimised / hidden to tray and straight back = a panic hide. Only real hides count (not
    // alt-tab), so this doesn't fire every time you glance at another window.
    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
        away();
        return;
      }
      const hiddenFor = hiddenSince != null ? Date.now() - hiddenSince : 0;
      hiddenSince = null;
      if (hiddenFor >= QUICK_HIDE.minMs && hiddenFor <= QUICK_HIDE.maxMs) mascotReact("quickHide");
      back();
    };
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Ambient life: if nothing has happened for a long while (and he's awake), now and then he
  // looks around on his own.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = useMascotStore.getState();
      if (s.sleeping || document.hidden || Date.now() - s.lastReactAt < FIDGET_AFTER_MS) return;
      if (Math.random() < FIDGET_CHANCE) s.react("fidget");
    }, FIDGET_CHECK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Konami code on the grid (not while typing, not under an overlay): disco.
  useEffect(() => {
    let pos = 0;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (overlayOpen() || target?.closest("input, textarea, [contenteditable]")) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = key === KONAMI[pos] ? pos + 1 : key === KONAMI[0] ? 1 : 0;
      if (pos === KONAMI.length) {
        pos = 0;
        mascotReact("disco");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reactions fired while the viewer / a sheet covered him are held by the store - play the
  // held one once the last overlay closes (after its exit animation).
  useEffect(() => {
    const html = document.documentElement;
    let t: number | undefined;
    const obs = new MutationObserver(() => {
      if (overlayOpen()) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => useMascotStore.getState().flushPending(), 350);
    });
    obs.observe(html, { attributes: true, attributeFilter: ["data-overlay"] });
    return () => {
      obs.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  // Site switch: e6AI gets the robot, coming home to e621 a little fox nod. Not on launch.
  const prevSite = useRef(site);
  useEffect(() => {
    if (prevSite.current === site) return;
    prevSite.current = site;
    mascotReact(site === "e6ai" ? "robot" : "homeSite");
  }, [site]);

  // What's being searched: species, ordering, your own favorites, a very long query.
  useEffect(() => {
    const kind = queryReaction(query, ownName);
    if (kind) mascotReact(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Per-search progress: a long scroll, a deep dig, or a search with exactly one result. Each
  // fires once per result list.
  const fired = useRef<{ key: string; kinds: Set<string> }>({ key: searchKey, kinds: new Set() });
  useEffect(() => {
    if (fired.current.key !== searchKey) fired.current = { key: searchKey, kinds: new Set() };
    const once = (kind: "longScroll" | "deepSearch" | "unicorn") => {
      if (fired.current.kinds.has(kind)) return;
      fired.current.kinds.add(kind);
      mascotReact(kind);
    };
    if (loadedCount >= LONG_SCROLL_POSTS) once("longScroll");
    if (pageCount >= DEEP_SEARCH_PAGE) once("deepSearch");
    if (resultsSettled && loadedCount === 1) once("unicorn");
  }, [searchKey, loadedCount, pageCount, resultsSettled]);

  // Tab spree: crossing into 4+ tabs.
  const prevTabs = useRef(tabCount);
  useEffect(() => {
    if (tabCount >= TAB_SPREE && tabCount > prevTabs.current) mascotReact("juggle");
    prevTabs.current = tabCount;
  }, [tabCount]);

  // Thumbnail slider pinned to either end: squinting at tiny ones, wowed by huge ones.
  const thumbPx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const prevThumb = useRef(thumbPx);
  useEffect(() => {
    if (prevThumb.current === thumbPx) return;
    prevThumb.current = thumbPx;
    if (thumbPx <= MIN_THUMBNAIL_SIZE_PX) mascotReact("squint");
    else if (thumbPx >= MAX_THUMBNAIL_SIZE_PX) mascotReact("bigThumbs");
  }, [thumbPx]);

  // Adult mode switched on / off (from Settings - held until it closes).
  const adult = useSettingsStore((s) => s.adultModeEnabled);
  const prevAdult = useRef(adult);
  useEffect(() => {
    if (prevAdult.current === adult) return;
    prevAdult.current = adult;
    mascotReact(adult ? "adultOn" : "adultOff");
  }, [adult]);

  // Grid layout toggle.
  const gridMode = useSettingsStore((s) => s.gridMode);
  const prevGridMode = useRef(gridMode);
  useEffect(() => {
    if (prevGridMode.current === gridMode) return;
    prevGridMode.current = gridMode;
    mascotReact(gridMode === "uniform" ? "layoutUniform" : "layoutMasonry");
  }, [gridMode]);

  // Fling-scrolling: lots of wheel ticks in a short window.
  useEffect(() => {
    let stamps: number[] = [];
    function onWheel() {
      // Only grid scrolling - wheel in the viewer is zoom, and sheets scroll their own content.
      if (overlayOpen()) return;
      const now = performance.now();
      stamps.push(now);
      stamps = stamps.filter((t) => now - t < DIZZY_WINDOW_MS);
      if (stamps.length >= DIZZY_WHEEL_EVENTS) {
        stamps = [];
        mascotReact("dizzy");
      }
    }
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // Connection lost, or a rate-limit 503 on the current search.
  const health = useHealthCheck(site);
  useEffect(() => {
    if (health.status === "error") mascotReact("sweat");
  }, [health.status]);
  useEffect(() => {
    if (apiError && String(apiError).includes("503")) mascotReact("sweat");
  }, [apiError]);

  // New dmail (count went up, not first load).
  const prevUnread = useRef<number | null>(null);
  useEffect(() => {
    if (prevUnread.current != null && unreadMessageCount > prevUnread.current) mascotReact("dmail");
    prevUnread.current = unreadMessageCount;
  }, [unreadMessageCount]);

  // Favorite milestones - compared against the previous poll, so it only fires on a crossing
  // seen live, never just for already being past one. Reset per site.
  const prevFavs = useRef<{ site: Site; count: number } | null>(null);
  useEffect(() => {
    if (favoriteCount == null) return;
    const prev = prevFavs.current;
    if (prev && prev.site === site) {
      const hit = crossedMilestone(prev.count, favoriteCount);
      if (hit != null) mascotReact("milestone", { count: hit.toLocaleString() });
    }
    prevFavs.current = { site, count: favoriteCount };
  }, [favoriteCount, site]);
}
