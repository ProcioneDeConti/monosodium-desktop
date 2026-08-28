import { useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { ShieldCheck } from "lucide-react";
import { e621Api } from "../../api/client";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

interface EncryptionSectionProps {
  passwordProtected: boolean;
}

const INPUT_CLASS =
  "rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 " +
  "px-2.5 py-1.5 text-sm outline-none focus:border-[rgb(var(--accent))]";

/** Settings > Encryption - optional, off by default (src-tauri/src/vault.rs's doc comment).
 *  Enabling/disabling re-encrypts settings.json/saved-searches.json/credentials.dat in place and
 *  then restarts the app immediately, rather than offering a "restart now" button like Cache's -
 *  this session's already-open store handles were registered with the old (plaintext or
 *  machine-bound) hooks, and leaving them live even briefly risks an autosave overwriting the
 *  file this just migrated. */
export function EncryptionSection({ passwordProtected }: EncryptionSectionProps) {
  const [enabling, setEnabling] = useState(false);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enable() {
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await e621Api.enablePasswordEncryption(password);
      await relaunch();
    } catch (e) {
      setError(errorMessage(e, "Failed to enable encryption."));
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await e621Api.disablePasswordEncryption();
      await relaunch();
    } catch (e) {
      setError(errorMessage(e, "Failed to disable encryption."));
      setBusy(false);
    }
  }

  if (passwordProtected) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck size={16} className="text-[rgb(var(--accent))]" />
          Local data is encrypted with your password
        </div>
        {!confirmingDisable ? (
          <Button onClick={() => setConfirmingDisable(true)} className="self-start">
            Turn off…
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 p-3">
            <p className="text-xs opacity-70">
              Settings, saved searches, and saved credentials go back to being stored unencrypted.
              The app restarts to apply this.
            </p>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={() => setConfirmingDisable(false)} disabled={busy}>
                Cancel
              </Button>
              <Button icon={busy ? <Spinner size={13} /> : undefined} onClick={() => void disable()} disabled={busy}>
                Turn off &amp; restart
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-60">
        Off by default. Turning this on encrypts settings, saved searches, and saved credentials
        with a password you choose, instead of the machine-bound key used otherwise. There's no
        password recovery - forgetting it means resetting and starting over.
      </p>
      {!enabling ? (
        <Button onClick={() => setEnabling(true)} className="self-start">
          Set up a password…
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 p-3">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className={INPUT_CLASS}
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={busy}
            className={INPUT_CLASS}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setEnabling(false);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button icon={busy ? <Spinner size={13} /> : undefined} onClick={() => void enable()} disabled={busy}>
              Enable &amp; restart
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
