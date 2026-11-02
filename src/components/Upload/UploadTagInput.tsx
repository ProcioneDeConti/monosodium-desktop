import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Site } from "../../models/site";
import { useTagAutocomplete } from "../../queries/useTagAutocomplete";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { numericTagCategory, tagSuggestionCategory } from "../../models/user";
import { normalizeTags, TAG_CAT, type ResolvedTag } from "../../lib/uploadChecks";

interface UploadTagInputProps {
  site: Site;
  tags: string[];
  onChange: (tags: string[]) => void;
  /** From the tag preview - colors chips and marks aliases/implied/invalid. */
  resolved: ResolvedTag[];
  implied: Set<string>;
}

/** Chip input for upload tags. Simpler than SearchBar's (no metatags, history or exclusions):
 *  space/Enter commits, pasting a whole tag string splits it, autocomplete is category-colored. */
export function UploadTagInput({ site, tags, onChange, resolved, implied }: UploadTagInputProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data } = useTagAutocomplete(site, draft);
  const suggestions = useMemo(() => (data ?? []).slice(0, 8), [data]);
  const byInput = useMemo(() => new Map(resolved.map((r) => [r.input, r])), [resolved]);

  useEffect(() => setHighlighted(0), [draft]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function add(raw: string) {
    const next = normalizeTags([...tags, ...normalizeTags(raw)]);
    onChange(next);
    setDraft("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (open && suggestions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setHighlighted((h) => (h + d + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === "Tab" && open && suggestions.length && draft.trim()) {
      e.preventDefault();
      add(suggestions[highlighted].name);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && suggestions.length && draft.trim()) add(suggestions[highlighted].name);
      else if (draft.trim()) add(draft);
      return;
    }
    if (e.key === " " && draft.trim()) {
      e.preventDefault();
      add(draft);
      return;
    }
    if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <div
        className="flex min-h-24 flex-wrap content-start items-start gap-1.5 rounded-[var(--radius-md)] border border-black/10 bg-white/70 p-2
                   focus-within:ring-2 focus-within:ring-[rgb(var(--accent))] dark:border-white/10 dark:bg-black/30"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => {
          const r = byInput.get(tag);
          const cat = r?.category;
          const invalid = cat === TAG_CAT.invalid;
          const style = cat != null && !invalid && cat !== TAG_CAT.contributor ? TAG_CATEGORY_STYLE[numericTagCategory(cat)] : null;
          const isImplied = r ? implied.has(r.canonical) : false;
          const title = [
            r?.aliasedFrom ? `Alias of ${r.canonical}` : "",
            isImplied ? "Implied by another tag - doesn't count toward the 10" : "",
            invalid ? "Invalid tag" : "",
            r?.isNew ? "New tag - doesn't exist on e621 yet" : "",
          ]
            .filter(Boolean)
            .join("\n");
          return (
            <span
              key={tag}
              title={title || undefined}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style ? "" : "bg-black/8 dark:bg-white/10"}
                ${invalid ? "outline outline-2 outline-offset-1 outline-red-500" : ""}
                ${r?.isNew ? "outline outline-1 outline-dashed outline-amber-400" : ""}
                ${isImplied ? "opacity-50" : ""}`}
              style={style ? { backgroundColor: style.chipBg, color: style.chipFg } : undefined}
            >
              {tag}
              {r?.aliasedFrom && <span className="opacity-70">→ {r.canonical}</span>}
              <button
                type="button"
                className="opacity-60 hover:opacity-100"
                aria-label={`Remove ${tag}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(tags.filter((t) => t !== tag));
                }}
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            // A pasted/typed tag string with spaces commits everything but the last token.
            if (/\s/.test(v.trim())) {
              const parts = v.split(/\s+/);
              const last = /\s$/.test(v) ? "" : parts.pop() ?? "";
              add(parts.join(" "));
              setDraft(last);
            } else setDraft(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={tags.length ? "" : "Add tags (space to commit, paste a whole tag string)"}
          className="min-w-[160px] flex-1 bg-transparent py-0.5 text-sm outline-none"
        />
      </div>
      {open && draft.trim() && suggestions.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-[var(--radius-md)] border border-black/10 bg-[rgb(var(--lt-surface))]
                     shadow-lg dark:border-white/10 dark:bg-[rgb(var(--dk-surface-3))]"
        >
          {suggestions.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                  i === highlighted ? "bg-[rgb(var(--accent))]/15" : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s.name);
                  inputRef.current?.focus();
                }}
              >
                <span
                  className="truncate font-medium"
                  style={{ color: TAG_CATEGORY_STYLE[tagSuggestionCategory(s)].headerColor ?? "inherit" }}
                >
                  {s.name.replace(/_/g, " ")}
                </span>
                <span className="shrink-0 text-xs opacity-60">{s.post_count.toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
