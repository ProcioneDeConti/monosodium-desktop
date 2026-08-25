import { useState } from "react";
import { FileDown, FileUp, TriangleAlert } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { e621Api } from "../../api/client";
import { applyBackup, buildBackup, isSettingsBackup } from "../../lib/backup";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

const FILTERS = [{ name: "Backup", extensions: ["json"] }];

type Mode =
  | { type: "idle" }
  | { type: "exporting" }
  | { type: "awaitingImportPassword"; path: string };

/** Settings > Backup & Restore - a portable, optionally password-protected snapshot of settings
 *  plus both sites' credentials (see lib/backup.ts). Ported from the reference Android app's
 *  own Backup & Restore section, minus its cloud-backup toggle (Android's system-level Auto
 *  Backup opt-out has no Windows equivalent to hook into). */
export function BackupSection() {
  const [mode, setMode] = useState<Mode>({ type: "idle" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function startExport() {
    setMessage(null);
    setMode({ type: "exporting" });
  }

  async function confirmExport(password: string | null) {
    setBusy(true);
    setMessage(null);
    try {
      const path = await save({ filters: FILTERS, defaultPath: "monosodium-desktop-backup.json" });
      if (!path) return;
      const plaintext = JSON.stringify(buildBackup());
      await e621Api.exportBackup(path, plaintext, password);
      setMessage("Backup exported.");
      setMode({ type: "idle" });
    } catch (e) {
      setMessage(errorMessage(e, "Export failed."));
    } finally {
      setBusy(false);
    }
  }

  async function startImport() {
    setMessage(null);
    const path = await open({ filters: FILTERS, multiple: false });
    if (!path || typeof path !== "string") return;
    setBusy(true);
    try {
      const encrypted = await e621Api.isBackupEncrypted(path);
      if (encrypted) {
        setMode({ type: "awaitingImportPassword", path });
      } else {
        await finishImport(path, null);
      }
    } catch (e) {
      setMessage(errorMessage(e, "Not a valid backup file."));
    } finally {
      setBusy(false);
    }
  }

  /** Doesn't dismiss on a wrong password - retries in place, matching the reference app's own
   *  dialog (re-picking the file just to try again would be needlessly punishing). */
  async function finishImport(path: string, password: string | null) {
    setBusy(true);
    setMessage(null);
    try {
      const plaintext = await e621Api.importBackup(path, password);
      const parsed: unknown = JSON.parse(plaintext);
      if (!isSettingsBackup(parsed)) throw new Error("Backup file is corrupted");
      await applyBackup(parsed);
      setMessage("Settings imported.");
      setMode({ type: "idle" });
    } catch (e) {
      setMessage(errorMessage(e, "Import failed."));
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-60">
        Export a portable snapshot of your settings and account credentials, or restore one on
        another machine.
      </p>

      {mode.type === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<FileDown size={13} />} onClick={() => void startExport()} disabled={busy}>
            Export backup
          </Button>
          <Button icon={busy ? <Spinner size={13} /> : <FileUp size={13} />} onClick={() => void startImport()} disabled={busy}>
            Import backup
          </Button>
          {message && <span className="text-xs opacity-70">{message}</span>}
        </div>
      )}

      {mode.type === "exporting" && (
        <ExportForm busy={busy} error={message} onConfirm={confirmExport} onCancel={() => setMode({ type: "idle" })} />
      )}

      {mode.type === "awaitingImportPassword" && (
        <ImportPasswordForm
          busy={busy}
          error={message}
          onSubmit={(password) => finishImport(mode.path, password)}
          onCancel={() => setMode({ type: "idle" })}
        />
      )}
    </div>
  );
}

function ExportForm({
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onConfirm: (password: string | null) => void;
  onCancel: () => void;
}) {
  const [encrypt, setEncrypt] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const mismatch = encrypt && password !== "" && confirmPassword !== "" && password !== confirmPassword;
  const canConfirm = encrypt ? password !== "" && password === confirmPassword : true;

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 p-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={encrypt}
          onChange={(e) => setEncrypt(e.target.checked)}
          className="accent-[rgb(var(--accent))]"
        />
        Encrypt this backup
      </label>

      {encrypt ? (
        <>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30
                       px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className={`rounded-[var(--radius-sm)] border bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none
                        focus:ring-2 focus:ring-[rgb(var(--accent))]
                        ${mismatch ? "border-red-500" : "border-black/10 dark:border-white/10"}`}
          />
          {mismatch && <p className="text-xs text-red-500">Passwords don&rsquo;t match.</p>}
        </>
      ) : (
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          This backup will contain your API key(s) in plain text.
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2">
        <Button
          icon={busy ? <Spinner size={13} /> : undefined}
          onClick={() => onConfirm(encrypt ? password : null)}
          disabled={busy || !canConfirm}
        >
          Export
        </Button>
        <button type="button" onClick={onCancel} className="text-xs opacity-70 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ImportPasswordForm({
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (password: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");

  function submit() {
    if (!password || busy) return;
    void onSubmit(password).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 p-3">
      <p className="text-sm">This backup is password-protected.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Password"
        autoFocus
        className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30
                   px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2">
        <Button icon={busy ? <Spinner size={13} /> : undefined} onClick={submit} disabled={busy || !password}>
          Unlock
        </Button>
        <button type="button" onClick={onCancel} className="text-xs opacity-70 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
