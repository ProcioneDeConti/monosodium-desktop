import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownAZ, Download, RefreshCw, Upload } from "lucide-react";
import { e621Api } from "../../api/client";
import { SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import {
  autoSyncBlacklist,
  markBlacklistSynced,
  syncBlacklist,
  useBlacklistSyncStatus,
} from "../../state/blacklistSync";
import { parseBlacklist } from "../../lib/blacklist";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";
import { Segmented, Toggle } from "./controls";
import { BlacklistChips } from "./BlacklistChips";
import { BlacklistTester } from "./BlacklistTester";

/** The blacklist editor: auto-sync switch, the text itself, save/sort/sync, and (tucked away)
 *  the destructive one-way import/push. */
export function BlacklistEditor({ site }: { site: Site }) {
  // This site's own list - not necessarily the active site's (the Blacklist page can switch).
  const blacklist = useSettingsStore((s) => s.blacklistBySite[site]);
  const setSiteBlacklist = useSettingsStore((s) => s.setBlacklist);
  const setBlacklist = (text: string) => setSiteBlacklist(text, site);
  const autoSync = useSettingsStore((s) => s.blacklistAutoSync);
  const setAutoSync = useSettingsStore((s) => s.setBlacklistAutoSync);
  const isAuthenticated = useAccountStore((s) => s.isAuthenticated(site));
  const sync = useBlacklistSyncStatus(site);
  const siteName = SITE_DISPLAY_NAME[site];

  const [draft, setDraft] = useState(blacklist);
  const [busy, setBusy] = useState<"import" | "push" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<"chips" | "text">("chips");

  // Follow outside changes (a tag menu's "Add to blacklist", a background sync) - but only while
  // there are no unsaved edits, so a sync landing mid-typing doesn't wipe them.
  const lastSaved = useRef(blacklist);
  useEffect(() => {
    setDraft((d) => (d === lastSaved.current ? blacklist : d));
    lastSaved.current = blacklist;
  }, [blacklist]);

  const dirty = draft !== blacklist;

  // Sorted, case-insensitively, ignoring a leading `-` so `-young` sits next to `young`; blank
  // lines are dropped. Disabled once the draft is already in that order.
  const sortedDraft = useMemo(
    () =>
      draft
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .sort((a, b) =>
          a.replace(/^-/, "").localeCompare(b.replace(/^-/, ""), undefined, { sensitivity: "base" }),
        )
        .join("\n"),
    [draft],
  );
  const canSort = sortedDraft !== draft.trim();

  // Live counts, parsed exactly as the filter will see them. A `-tag` counts as its own tag.
  const counts = useMemo(() => {
    const entries = parseBlacklist(draft);
    const tags = entries.flat();
    return { lines: entries.length, tags: tags.length, unique: new Set(tags).size };
  }, [draft]);

  function save() {
    setMessage(null);
    setBlacklist(draft);
    autoSyncBlacklist(site);
  }

  async function handleSyncNow() {
    setMessage(null);
    if (dirty) setBlacklist(draft); // unsaved edits are part of what gets synced
    await syncBlacklist(site).catch(() => undefined);
  }

  async function handleImport() {
    if (
      !window.confirm(
        `Replace the blacklist here with the one on your ${siteName} account? Lines only in this app will be lost.`,
      )
    )
      return;
    setBusy("import");
    setMessage(null);
    try {
      const profile = await e621Api.getCurrentUser(site);
      const imported = profile.blacklisted_tags ?? "";
      setDraft(imported);
      setBlacklist(imported);
      markBlacklistSynced(site, imported);
      setMessage("Replaced with the account's blacklist.");
    } catch (e) {
      setMessage(errorMessage(e, "Import failed."));
    } finally {
      setBusy(null);
    }
  }

  async function handlePush() {
    if (
      !window.confirm(
        `Overwrite the blacklist on your ${siteName} account with this one? Lines added from other apps will be lost.`,
      )
    )
      return;
    setBusy("push");
    setMessage(null);
    try {
      const profile = await e621Api.getCurrentUser(site);
      await e621Api.updateBlacklist(site, profile.id, draft);
      setBlacklist(draft);
      markBlacklistSynced(site, draft);
      setMessage("Account overwritten.");
    } catch (e) {
      setMessage(errorMessage(e, "Push failed."));
    } finally {
      setBusy(null);
    }
  }

  const syncing = sync.state === "syncing";
  const status = message ?? sync.message;
  const statusIsError = !message && sync.state === "error";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[rgb(var(--accent))]/25 bg-[rgb(var(--accent))]/[0.07] p-3">
        <RefreshCw
          size={16}
          className={`shrink-0 text-[rgb(var(--accent))] ${syncing ? "animate-spin" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Sync automatically with {siteName}</div>
          <div className="text-xs opacity-60">
            {isAuthenticated
              ? "Merges with your account whenever you add or save a line here, and at launch. Lines added in other apps (like the Android app) are kept; lines you delete here are deleted there too."
              : `Sign in to ${siteName} under Account to sync.`}
          </div>
        </div>
        <Toggle
          checked={autoSync && isAuthenticated}
          disabled={!isAuthenticated}
          label="Sync blacklist automatically"
          onChange={(on) => {
            setAutoSync(on);
            if (on) void handleSyncNow();
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-xs opacity-60">
          One entry per line. Tags on the same line must all match (AND); separate lines are
          alternatives (OR). Example: <code className="opacity-80">young -age_difference</code>
        </p>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "chips", label: "Chips" },
            { value: "text", label: "Text" },
          ]}
        />
      </div>
      {/* Ctrl+S saves from either view. */}
      <div
        onKeyDown={(e) => {
          if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (dirty) save();
          }
        }}
      >
        {view === "chips" ? (
          <BlacklistChips site={site} draft={draft} onChange={setDraft} />
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={9}
            spellCheck={false}
            className="block w-full resize-y rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-2.5 py-2 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            placeholder={"rating:explicit\nyoung -age_difference"}
          />
        )}
      </div>
      <div className="-mt-1 flex items-center gap-2 text-xs">
        {dirty && (
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            Unsaved changes · Ctrl+S to save
          </span>
        )}
        <span className="ml-auto tabular-nums opacity-60">
          {counts.lines} {counts.lines === 1 ? "line" : "lines"} · {counts.tags}{" "}
          {counts.tags === 1 ? "tag" : "tags"}
          {counts.unique !== counts.tags && ` (${counts.unique} unique)`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!dirty}
          onClick={save}
          className="rounded-[var(--radius-sm)] bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-semibold text-white
                     transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Save
        </button>
        {dirty && <Button onClick={() => setDraft(blacklist)}>Discard</Button>}
        <Button icon={<ArrowDownAZ size={13} />} disabled={!canSort} onClick={() => setDraft(sortedDraft)}>
          Sort A–Z
        </Button>
        <Button
          icon={<RefreshCw size={13} />}
          disabled={!isAuthenticated || busy !== null || syncing}
          onClick={() => void handleSyncNow()}
          title={
            isAuthenticated
              ? "Merge with your account - keeps lines added on either side"
              : `Sign in to ${siteName} to sync`
          }
        >
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
        {status && (
          <span className={`text-xs ${statusIsError ? "text-red-500" : "opacity-70"}`}>{status}</span>
        )}
      </div>

      {isAuthenticated && (
        <details className="text-xs">
          <summary className="cursor-pointer select-none opacity-60 hover:opacity-100">
            Overwrite one side instead of merging…
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button icon={<Download size={13} />} disabled={busy !== null || syncing} onClick={handleImport}>
              {busy === "import" ? "Importing…" : "Replace this app's with account's"}
            </Button>
            <Button icon={<Upload size={13} />} disabled={busy !== null || syncing} onClick={handlePush}>
              {busy === "push" ? "Pushing…" : "Overwrite account's with this app's"}
            </Button>
          </div>
        </details>
      )}

      <BlacklistTester site={site} draft={draft} />
    </div>
  );
}
