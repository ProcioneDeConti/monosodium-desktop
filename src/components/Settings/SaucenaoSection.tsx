import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { useSaucenaoStore } from "../../state/saucenaoStore";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

/** SauceNAO API key for the drag-and-drop reverse image search feature - required, SauceNAO
 *  rejects anonymous API requests outright. Stored in credentials.dat next to the exe, same
 *  treatment as e621/e6AI credentials - see state/saucenaoStore.ts. */
export function SaucenaoSection() {
  const savedKey = useSaucenaoStore((s) => s.apiKey);
  const save = useSaucenaoStore((s) => s.save);
  const clear = useSaucenaoStore((s) => s.clear);

  const [apiKey, setApiKey] = useState(savedKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => setApiKey(savedKey ?? ""), [savedKey]);

  const dirty = apiKey !== (savedKey ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      await save(apiKey.trim());
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await clear();
      setApiKey("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-60">
        Drag and drop an image file onto the window to search it against SauceNAO. An API key is
        required - SauceNAO rejects anonymous API requests outright, it isn't just a lower rate
        limit without one.
      </p>
      <div className="flex gap-1">
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type={showKey ? "text" : "password"}
          placeholder="SauceNAO API key (optional)"
          className="flex-1 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                     bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2
                     focus:ring-[rgb(var(--accent))]"
        />
        <IconButton
          onClick={() => setShowKey((v) => !v)}
          title={showKey ? "Hide API key" : "Show API key"}
          className="border border-black/10 dark:border-white/10"
        >
          {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
        </IconButton>
      </div>
      <button
        type="button"
        onClick={() => void openUrl("https://saucenao.com/user.php?page=search-api")}
        className="flex items-center gap-1 self-start text-xs text-[rgb(var(--accent))] hover:underline"
      >
        Get an API key on saucenao.com
        <ExternalLink size={11} />
      </button>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={handleSave}
          className="rounded-[var(--radius-sm)] bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-semibold text-white
                     transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {savedFlash ? "Saved!" : "Save"}
        </button>
        {savedKey && (
          <Button disabled={saving} onClick={handleClear}>
            Remove key
          </Button>
        )}
      </div>
    </div>
  );
}
