import { useState } from "react";
import { useSettingsStore, type SeenMode } from "../../state/settingsStore";
import { useSeenStore } from "../../state/seenStore";
import { Button } from "../ui/Button";

const MODES: { value: SeenMode; label: string }[] = [
  { value: "dim", label: "Dim them" },
  { value: "hide", label: "Hide them" },
  { value: "off", label: "Don't track" },
];

/** Seen-post tracking (state/seenStore.ts): what the grid does with posts you've already opened. */
export function SeenPostsSection() {
  const seenMode = useSettingsStore((s) => s.seenMode);
  const setSeenMode = useSettingsStore((s) => s.setSeenMode);
  const count = useSeenStore((s) => Object.values(s.seen).reduce((n, ids) => n + ids.size, 0));
  const clear = useSeenStore((s) => s.clear);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm w-36 shrink-0">Posts you've opened</span>
        <select
          value={seenMode}
          onChange={(e) => setSeenMode(e.target.value as SeenMode)}
          className="rounded-[var(--radius-sm)] border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs opacity-60">
        Hidden posts stay visible until your next search, so the viewer never loses its place. Stored
        only on this device. Don't track stops recording but keeps the existing history.
      </p>
      <div className="flex items-center gap-2 text-sm">
        <span className="opacity-70">{count.toLocaleString()} seen</span>
        {confirming ? (
          <>
            <Button
              onClick={() => {
                clear();
                setConfirming(false);
              }}
            >
              Really clear
            </Button>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        ) : (
          <Button disabled={count === 0} onClick={() => setConfirming(true)}>
            Clear seen history
          </Button>
        )}
      </div>
    </div>
  );
}
