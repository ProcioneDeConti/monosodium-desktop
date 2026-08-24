import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SITE_DISPLAY_NAME, SITE_WEB_BASE_URL, type Site } from "../../models/site";
import { useAccountStore } from "../../state/accountStore";

interface SiteAccountCardProps {
  site: Site;
}

export function SiteAccountCard({ site }: SiteAccountCardProps) {
  const account = useAccountStore((s) => s.accounts[site]);
  const save = useAccountStore((s) => s.save);
  const clear = useAccountStore((s) => s.clear);

  const [username, setUsername] = useState(account?.username ?? "");
  const [apiKey, setApiKey] = useState(account?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setUsername(account?.username ?? "");
    setApiKey(account?.apiKey ?? "");
  }, [account]);

  const isAuthenticated = !!account?.username && !!account?.apiKey;
  const dirty = username !== (account?.username ?? "") || apiKey !== (account?.apiKey ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      await save(site, username.trim(), apiKey.trim());
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSaving(true);
    try {
      await clear(site);
      setUsername("");
      setApiKey("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-black/10 dark:border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{SITE_DISPLAY_NAME[site]}</h3>
        <span className={`text-xs ${isAuthenticated ? "text-green-500" : "opacity-50"}`}>
          {isAuthenticated ? `Signed in as ${account?.username}` : "Not signed in"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-70">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            placeholder="e621 username"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-70">API key</span>
          <div className="flex gap-1">
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type={showKey ? "text" : "password"}
              className="flex-1 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              placeholder="API key"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 px-2 text-xs hover:bg-black/5 dark:hover:bg-white/5"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <button
          type="button"
          onClick={() => void openUrl(`${SITE_WEB_BASE_URL[site]}/users/home`)}
          className="self-start text-xs text-[rgb(var(--accent))] hover:underline"
        >
          Manage API access on {SITE_DISPLAY_NAME[site]} →
        </button>

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            disabled={!dirty || saving || !username.trim() || !apiKey.trim()}
            onClick={handleSave}
            className="rounded-[var(--radius-sm)] bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {savedFlash ? "Saved!" : "Save"}
          </button>
          {isAuthenticated && (
            <button
              type="button"
              disabled={saving}
              onClick={handleSignOut}
              className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
