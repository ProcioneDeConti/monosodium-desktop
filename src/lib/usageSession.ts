// Tracks foreground-active time for the User Dashboard's "Time in app" / sessions stats.
//
// Active = the window is visible AND focused AND there's been some input within IDLE_MS. A brief
// blur (alt-tab) just *pauses* the active clock; the window being hidden (minimised / closed to
// tray), an idle timeout, or unload *ends the session* - re-activating after that starts a new
// one. The active clock is flushed to statsStore every FLUSH_MS so a hard kill (a `tauri dev`
// rebuild) loses at most that much.

import { useStatsStore } from "../state/statsStore";

const IDLE_MS = 5 * 60_000;
const FLUSH_MS = 15_000;

let started = false;
let activeSince: number | null = null; // clock running since this ms, or null (paused)
let sessionStart: number | null = null; // current session began at this ms, or null (no session)
let lastInput = Date.now();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function focusedAndVisible(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

function armIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(onIdle, IDLE_MS);
}

/** Roll the active clock forward, banking elapsed time without stopping. */
function flush() {
  if (activeSince === null) return;
  const now = Date.now();
  useStatsStore.getState().recordActive(now - activeSince);
  activeSince = now;
}

function beginActive() {
  if (activeSince !== null) return;
  const now = Date.now();
  activeSince = now;
  if (sessionStart === null) sessionStart = now;
  armIdleTimer();
}

/** Pause the active clock. `endSession` also closes the current session (idle / hidden / unload). */
function stopActive(endSession: boolean) {
  flush();
  activeSince = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (endSession && sessionStart !== null) {
    useStatsStore.getState().recordSession(Date.now() - sessionStart);
    sessionStart = null;
  }
}

function onIdle() {
  stopActive(true);
}

function onInput() {
  lastInput = Date.now();
  if (focusedAndVisible()) {
    beginActive();
  }
  if (activeSince !== null) armIdleTimer();
}

function onFocusChange() {
  if (focusedAndVisible() && Date.now() - lastInput < IDLE_MS) {
    beginActive();
  } else {
    // A blur pauses; the tab going hidden (tray / minimise) ends the session.
    stopActive(document.visibilityState === "hidden");
  }
}

/** Start tracking. Safe to call more than once (no-op after the first). */
export function startUsageSession() {
  if (started) return;
  started = true;

  for (const ev of ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const) {
    window.addEventListener(ev, onInput, { passive: true });
  }
  window.addEventListener("focus", onFocusChange);
  window.addEventListener("blur", onFocusChange);
  document.addEventListener("visibilitychange", onFocusChange);
  window.addEventListener("beforeunload", () => stopActive(true));

  setInterval(flush, FLUSH_MS); // app-lifetime; never cleared

  if (focusedAndVisible()) beginActive();
}
