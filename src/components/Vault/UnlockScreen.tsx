import { useState } from "react";
import { Lock, TriangleAlert } from "lucide-react";
import { e621Api } from "../../api/client";
import { errorMessage } from "../../lib/errors";
import { Spinner } from "../ui/Spinner";

interface UnlockScreenProps {
  onUnlocked: () => void;
}

/** Full-screen gate App.tsx renders instead of the rest of the app when Settings > Encryption's
 *  password protection is on and hasn't been unlocked yet this session (src-tauri/src/vault.rs).
 *  settings.json/saved-searches.json/credentials.dat are all unreadable until the right password
 *  re-derives the key server-side, so nothing past this screen can safely boot yet - same timing
 *  role as EulaScreen, just earlier (before loadSettings/loadAllAccounts/loadSavedSearches). */
export function UnlockScreen({ onUnlocked }: UnlockScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  async function submit() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await e621Api.unlockVault(password);
      onUnlocked();
    } catch (e) {
      setError(errorMessage(e, "Incorrect password."));
      setBusy(false);
    }
  }

  async function resetEverything() {
    setBusy(true);
    setError(null);
    try {
      await e621Api.resetVault();
      onUnlocked();
    } catch (e) {
      setError(errorMessage(e, "Failed to reset."));
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] p-8">
      <Lock size={32} className="text-[rgb(var(--accent))]" />
      <div className="w-full max-w-xs text-center">
        <h1 className="mb-1 text-base font-semibold">Enter your password</h1>
        <p className="mb-4 text-xs opacity-60">Local data is encrypted - Settings &gt; Encryption.</p>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          disabled={busy}
          className="w-full rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                     bg-black/5 dark:bg-white/5 px-3 py-2 text-sm outline-none
                     focus:border-[rgb(var(--accent))]"
        />
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !password}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)]
                     bg-[rgb(var(--accent))] py-2 text-sm font-semibold text-white
                     transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy && <Spinner size={13} />}
          Unlock
        </button>

        {!confirmingReset ? (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="mt-4 text-xs opacity-50 hover:opacity-80 hover:underline"
          >
            Forgot password?
          </button>
        ) : (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-red-500/30 bg-red-500/5 p-3 text-left">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-red-500">
              <TriangleAlert size={13} /> This can't be undone
            </p>
            <p className="mb-2 text-xs opacity-70">
              Resetting deletes all local settings, saved searches, and saved credentials, and
              starts fresh. There's no way to recover the password or the data it protects.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                disabled={busy}
                className="flex-1 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                           py-1.5 text-xs disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void resetEverything()}
                disabled={busy}
                className="flex-1 rounded-[var(--radius-sm)] bg-red-600 py-1.5 text-xs font-semibold
                           text-white disabled:opacity-40"
              >
                Reset everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
