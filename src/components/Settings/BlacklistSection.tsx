import { useEffect, useMemo, useState } from "react";
import { ArrowDownAZ, Download, Upload } from "lucide-react";
import { e621Api } from "../../api/client";
import type { Site } from "../../models/site";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";

interface BlacklistSectionProps {
  site: Site;
}

export function BlacklistSection({ site }: BlacklistSectionProps) {
  const blacklist = useSettingsStore((s) => s.blacklist);
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const isAuthenticated = useAccountStore((s) => s.isAuthenticated(site));

  const [draft, setDraft] = useState(blacklist);
  const [busy, setBusy] = useState<"import" | "push" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setDraft(blacklist), [blacklist]);

  const dirty = draft !== blacklist;

  // Sorted, case-insensitively, ignoring a leading `-` so `-young` sits next to `young`; blank
  // lines are dropped. Disabled once the draft is already in that order.
  const sortedDraft = useMemo(() => {
    return draft
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort((a, b) =>
        a.replace(/^-/, "").localeCompare(b.replace(/^-/, ""), undefined, { sensitivity: "base" }),
      )
      .join("\n");
  }, [draft]);
  const canSort = sortedDraft !== draft.trim();

  async function handleImport() {
    setBusy("import");
    setMessage(null);
    try {
      const profile = await e621Api.getCurrentUser(site);
      const imported = profile.blacklisted_tags ?? "";
      setDraft(imported);
      setBlacklist(imported);
      setMessage("Imported from account.");
    } catch (e) {
      setMessage(errorMessage(e, "Import failed."));
    } finally {
      setBusy(null);
    }
  }

  async function handlePush() {
    setBusy("push");
    setMessage(null);
    try {
      const profile = await e621Api.getCurrentUser(site);
      await e621Api.updateBlacklist(site, profile.id, draft);
      setMessage("Pushed to account.");
    } catch (e) {
      setMessage(errorMessage(e, "Push failed."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-60">
        One entry per line. Tags on the same line must all match (AND); separate lines are
        alternatives (OR). Example: <code className="opacity-80">young -age_difference</code>
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        spellCheck={false}
        className="resize-y rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        placeholder="rating:explicit&#10;young -age_difference"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => setBlacklist(draft)}
          className="rounded-[var(--radius-sm)] bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-semibold text-white
                     transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Save
        </button>
        <Button icon={<ArrowDownAZ size={13} />} disabled={!canSort} onClick={() => setDraft(sortedDraft)}>
          Sort A–Z
        </Button>
        <Button
          icon={<Download size={13} />}
          disabled={!isAuthenticated || busy !== null}
          onClick={handleImport}
          title={isAuthenticated ? undefined : "Sign in above to import"}
        >
          {busy === "import" ? "Importing…" : "Import from account"}
        </Button>
        <Button
          icon={<Upload size={13} />}
          disabled={!isAuthenticated || busy !== null}
          onClick={handlePush}
          title={isAuthenticated ? undefined : "Sign in above to push"}
        >
          {busy === "push" ? "Pushing…" : "Push to account"}
        </Button>
        {message && <span className="text-xs opacity-70">{message}</span>}
      </div>
    </div>
  );
}
