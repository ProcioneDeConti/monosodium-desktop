import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { DEFAULT_SHLINK_TAG, useShlinkStore } from "../../state/shlinkStore";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

const INPUT =
  "rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 " +
  "px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";

/** The user's own Shlink server, used to shorten post links for "Copy short link" and Telegram
 *  sharing. Saved in credentials.dat; the API key is write-only from here (the backend never
 *  sends it back), so a configured server shows a blank key field that only needs filling in to
 *  change it. */
export function ShlinkSection() {
  const savedServer = useShlinkStore((s) => s.serverUrl);
  const savedTag = useShlinkStore((s) => s.tag);
  const save = useShlinkStore((s) => s.save);
  const clear = useShlinkStore((s) => s.clear);

  const [server, setServer] = useState(savedServer ?? "");
  const [apiKey, setApiKey] = useState("");
  const [tag, setTag] = useState(savedTag);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => setServer(savedServer ?? ""), [savedServer]);
  useEffect(() => setTag(savedTag), [savedTag]);

  // The key has to be re-entered to change anything - the backend re-validates the pair on save.
  const canSave = server.trim() !== "" && apiKey.trim() !== "" && !busy;

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await save(server, apiKey, tag);
      setApiKey("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    setError(null);
    try {
      await clear();
      setServer("");
      setApiKey("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-60">
        Shorten post links through your own Shlink server. Once set up, the post viewer gets a
        "Copy short link" button and Telegram sharing sends the short link. Links are tagged and
        reused, so sharing the same post twice gives the same short URL.
      </p>
      {savedServer && (
        <p className="text-xs">
          Connected to <span className="font-semibold">{savedServer}</span>
        </p>
      )}
      <input
        value={server}
        onChange={(e) => setServer(e.target.value)}
        placeholder="Server URL, e.g. https://s.example.com"
        className={INPUT}
      />
      <div className="flex gap-1">
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type={showKey ? "text" : "password"}
          placeholder={savedServer ? "API key (re-enter to change settings)" : "API key"}
          className={`flex-1 ${INPUT}`}
        />
        <IconButton
          onClick={() => setShowKey((v) => !v)}
          title={showKey ? "Hide API key" : "Show API key"}
          className="border border-black/10 dark:border-white/10"
        >
          {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
        </IconButton>
      </div>
      <input
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        placeholder={`Tag for created links (blank = none), e.g. ${DEFAULT_SHLINK_TAG}`}
        className={INPUT}
      />
      <button
        type="button"
        onClick={() => void openUrl("https://shlink.io/documentation/api-docs/api-key/")}
        className="flex items-center gap-1 self-start text-xs text-[rgb(var(--accent))] hover:underline"
      >
        How to create a Shlink API key
        <ExternalLink size={11} />
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="rounded-[var(--radius-sm)] bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-semibold text-white
                     transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Checking..." : savedFlash ? "Saved!" : "Test & save"}
        </button>
        {savedServer && (
          <Button disabled={busy} onClick={handleClear}>
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
