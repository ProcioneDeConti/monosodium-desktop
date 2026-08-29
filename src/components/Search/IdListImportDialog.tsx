import { useEffect, useMemo, useState } from "react";
import { Hash, X } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";

interface IdListImportDialogProps {
  onClose: () => void;
  onSubmit: (query: string) => void;
}

// e621 accepts a comma-separated list in one `id:` metatag. Keep it to the per-request post cap
// so the result is a single complete page.
const MAX_IDS = 320;

/** Paste a blob of post IDs (or URLs) in any format and open them as one `id:a,b,c` search. */
export function IdListImportDialog({ onClose, onSubmit }: IdListImportDialogProps) {
  const [text, setText] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const ids = useMemo(() => {
    const seen = new Set<number>();
    for (const m of text.matchAll(/\d+/g)) {
      const n = Number(m[0]);
      if (Number.isInteger(n) && n > 0) seen.add(n);
    }
    return [...seen];
  }, [text]);

  const capped = ids.slice(0, MAX_IDS);
  const overflow = ids.length - capped.length;

  function submit() {
    if (capped.length === 0) return;
    onSubmit(`id:${capped.join(",")}`);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md animate-[scale-in_120ms_ease-out] flex-col
                   rounded-[var(--radius-md)] border border-black/10 dark:border-white/10
                   bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <Hash size={15} className="text-[rgb(var(--accent))]" />
          <h2 className="text-sm font-semibold">Open a list of post IDs</h2>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={16} />
          </IconButton>
        </div>

        <div className="flex flex-col gap-2 p-4">
          <p className="text-xs opacity-60">
            Paste IDs or post URLs in any format - commas, spaces, newlines, anything. Non-numbers
            are ignored.
          </p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            spellCheck={false}
            placeholder={"12345, 67890\n112233\nhttps://e621.net/posts/445566"}
            className="resize-y rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                       bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm font-mono outline-none
                       focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />
          <div className="flex items-center justify-between text-xs opacity-70">
            <span>
              {capped.length} post{capped.length === 1 ? "" : "s"}
              {overflow > 0 && <span className="text-amber-500"> · {overflow} over the {MAX_IDS} limit dropped</span>}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-black/10 dark:border-white/10 px-4 py-3">
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={capped.length === 0}>
            Open {capped.length || ""} {capped.length === 1 ? "post" : "posts"}
          </Button>
        </div>
      </div>
    </div>
  );
}
