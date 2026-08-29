import { useEffect, useMemo, useState } from "react";
import { ArrowDownAZ, Download, FlaskConical, Upload } from "lucide-react";
import { e621Api } from "../../api/client";
import type { Site } from "../../models/site";
import type { Post } from "../../models/post";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { parseBlacklist, testBlacklist } from "../../lib/blacklist";
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

      <BlacklistTester site={site} draft={draft} />
    </div>
  );
}

/** Paste a post ID or e621/e6AI URL and see, line by line, how the (unsaved) draft blacklist
 *  above would treat it. */
function BlacklistTester({ site, draft }: { site: Site; draft: string }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<Post | null>(null);

  const results = useMemo(
    () => (post ? testBlacklist(parseBlacklist(draft), post) : []),
    [post, draft],
  );
  const hiddenBy = results.filter((r) => r.matched);

  async function run() {
    const id = parsePostId(input);
    if (id == null) {
      setError("Enter a post ID or a posts/<id> URL.");
      setPost(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await e621Api.getPosts(site, `id:${id}`, 1);
      const found = res.posts[0] ?? null;
      if (!found) setError(`No post #${id} on ${site === "e621" ? "e621" : "e6AI"}.`);
      setPost(found);
    } catch (e) {
      setError(errorMessage(e, "Lookup failed."));
      setPost(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold opacity-70">
        <FlaskConical size={13} />
        Blacklist tester
      </div>
      <p className="text-xs opacity-60">
        Checks a post against the text above (unsaved edits included).
      </p>
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          placeholder="12345 or https://e621.net/posts/12345"
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                     bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        />
        <Button onClick={() => void run()} disabled={busy || !input.trim()}>
          {busy ? "Testing…" : "Test"}
        </Button>
      </div>

      {error && <span className="text-xs text-red-500">{error}</span>}

      {post && (
        <div className="flex gap-3">
          {post.preview.url && (
            <img
              src={post.preview.url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-[var(--radius-sm)] object-cover"
            />
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p
              className={`font-semibold ${
                hiddenBy.length > 0 ? "text-red-500" : "text-green-600 dark:text-green-400"
              }`}
            >
              #{post.id} —{" "}
              {hiddenBy.length > 0
                ? `hidden by ${hiddenBy.length} line${hiddenBy.length === 1 ? "" : "s"}`
                : "not blacklisted"}
            </p>
            {results.length === 0 ? (
              <p className="mt-1 opacity-60">Blacklist is empty.</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1">
                {results.map((r, i) => (
                  <li
                    key={i}
                    className={`rounded px-1.5 py-1 font-mono ${
                      r.matched
                        ? "bg-red-500/10 text-red-600 dark:text-red-300"
                        : "bg-black/5 opacity-60 dark:bg-white/5"
                    }`}
                  >
                    <span>{r.line}</span>
                    {!r.matched && (
                      <span className="ml-1.5 font-sans not-italic opacity-80">
                        — post lacks {r.missingTags.join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Accepts a bare id, `#id`, or any URL containing `posts/<id>` (or a trailing numeric path). */
function parsePostId(raw: string): number | null {
  const s = raw.trim();
  const fromUrl = s.match(/posts\/(\d+)/) ?? s.match(/(?:^|\/)#?(\d+)(?:[/?#]|$)/);
  const id = fromUrl ? Number(fromUrl[1]) : Number(s.replace(/^#/, ""));
  return Number.isInteger(id) && id > 0 ? id : null;
}
