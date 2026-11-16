import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { e621Api } from "../../api/client";
import type { Site } from "../../models/site";
import type { Post } from "../../models/post";
import { parseBlacklist, testBlacklist } from "../../lib/blacklist";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";

/** Paste a post ID or e621/e6AI URL and see, line by line, how the (unsaved) draft blacklist
 *  above would treat it. */
export function BlacklistTester({ site, draft }: { site: Site; draft: string }) {
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
