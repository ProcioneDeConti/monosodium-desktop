import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { TriangleAlert } from "lucide-react";
import { e621Api, type StorageLocation } from "../../api/client";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

const CONFIRM_WORD = "ERASE";

const INPUT_CLASS =
  "rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 " +
  "px-2.5 py-1.5 text-sm outline-none focus:border-[rgb(var(--accent))]";

/** Settings > Reset - a full factory wipe. Marks every local file for deletion at the next
 *  launch (src-tauri/src/paths.rs's `request_full_reset` - it can't happen live because WebView2
 *  locks its cache directory) and restarts, same deferred-then-relaunch shape as CacheSection /
 *  EncryptionSection. Also surfaces where data is stored and warns when the exe directory wasn't
 *  writable and it landed in %LOCALAPPDATA% instead. */
export function ResetSection() {
  const [location, setLocation] = useState<StorageLocation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void e621Api.getStorageLocation().then(setLocation).catch(() => {});
  }, []);

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await e621Api.requestFullReset();
      await relaunch();
    } catch (e) {
      setError(errorMessage(e, "Failed to reset."));
      setBusy(false);
    }
  }

  function cancel() {
    setConfirming(false);
    setTyped("");
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {location && (
        <div className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Local data is stored in</span>
          <code className="break-all rounded-[var(--radius-sm)] bg-black/5 dark:bg-white/5 px-2 py-1 opacity-80">
            {location.dataDir}
          </code>
          {!location.portable && (
            <p className="mt-1 flex items-start gap-1.5 rounded-[var(--radius-sm)] border border-amber-500/30 bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              Program directory not writable — files are stored in AppData.
            </p>
          )}
        </div>
      )}

      <p className="text-xs opacity-60">
        Erases everything this app has saved: settings, blacklist, saved searches, search
        history, collections, usage stats, the media cache, and every stored login (e621, e6AI,
        and the SauceNAO key), plus any encryption password. Both storage locations are cleared.
        Downloaded image and video files on your disk are left alone. The app restarts afterwards.
      </p>

      {!confirming ? (
        <Button
          onClick={() => setConfirming(true)}
          className="self-start border-red-500/40 text-red-600 hover:bg-red-500/15 dark:text-red-400"
        >
          Erase all data…
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-red-500/30 bg-red-500/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-red-500">
            <TriangleAlert size={13} /> This can't be undone
          </p>
          <label className="text-xs opacity-70">
            Type <span className="font-semibold">{CONFIRM_WORD}</span> to confirm
          </label>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            className={INPUT_CLASS}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              icon={busy ? <Spinner size={13} /> : undefined}
              onClick={() => void erase()}
              disabled={busy || typed !== CONFIRM_WORD}
              className="border-red-500/40 text-red-600 hover:bg-red-500/15 dark:text-red-400"
            >
              Erase everything &amp; restart
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
