// "Thinking about you" notifications from Gus - opt-in (Talk to Gus's bell, only shown at five
// hearts), and rare: only while you're away from the app, a few hours after you last talked,
// at most once every PING_GAP_MS, and only during the day.
import { useEffect } from "react";
import { EMPTY_BOND, hasFiveHearts, isPartner, pingLine } from "./gusBond";
import { MASCOT_NAME } from "./mascot";
import { notify } from "./notifications";
import { loadGames, useGamesStore } from "../state/gamesStore";

const CHECK_MS = 10 * 60_000;
const QUIET_MS = 3 * 3600_000;
const PING_GAP_MS = 8 * 3600_000;

export function useGusPings(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void loadGames();
    const id = window.setInterval(() => {
      const s = useGamesStore.getState();
      const now = Date.now();
      const bond = { ...EMPTY_BOND, ...s.chat.bond };
      const hour = new Date(now).getHours();
      if (!s.isLoaded || !s.chatPings || !hasFiveHearts(s.chat.affection) || document.hasFocus()) return;
      if (hour < 9 || hour >= 23 || now - s.chat.lastSeen < QUIET_MS || now - (bond.lastPing ?? 0) < PING_GAP_MS) return;
      s.setChat({ ...s.chat, bond: { ...bond, lastPing: now } });
      void notify(MASCOT_NAME, pingLine(s.chat.name, isPartner(bond, s.chat.affection), Math.random));
    }, CHECK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);
}
