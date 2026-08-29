// Polls the Rust backend's process-lifetime API counters (src-tauri/src/api.rs) every 30s and
// folds the delta into the persisted local stats. Both sides start at 0 on launch, so tracking
// the delta from a 0 baseline correctly attributes every call - including boot-time ones - and
// survives restarts. Mounted once, from App.tsx.

import { useEffect, useRef } from "react";
import { e621Api } from "../api/client";
import { useSettingsStore } from "../state/settingsStore";
import { useStatsStore } from "../state/statsStore";

const POLL_MS = 30_000;

export function useApiMetricsFold(enabled: boolean) {
  const site = useSettingsStore((s) => s.site);
  const siteRef = useRef(site);
  siteRef.current = site;
  // Persists across the effect re-running so a re-run never re-reads the whole cumulative count
  // as one giant delta.
  const lastRef = useRef({ calls: 0, bytes: 0 });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function tick() {
      let m: { calls: number; response_bytes: number };
      try {
        m = await e621Api.getApiMetrics();
      } catch {
        return;
      }
      if (cancelled) return;
      const prev = lastRef.current;
      // Guard against a backend restart (counters would go backwards).
      const dCalls = m.calls >= prev.calls ? m.calls - prev.calls : m.calls;
      const dBytes = m.response_bytes >= prev.bytes ? m.response_bytes - prev.bytes : m.response_bytes;
      lastRef.current = { calls: m.calls, bytes: m.response_bytes };
      if (dCalls > 0) {
        useStatsStore.getState().recordApiActivity(dCalls, dBytes, siteRef.current);
      }
    }

    void tick();
    const iv = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
      void tick(); // best-effort final flush
    };
  }, [enabled]);
}
