import { useEffect, useMemo, useRef, useState } from "react";
import type { Site } from "../../models/site";
import { useTagAutocomplete } from "../../queries/useTagAutocomplete";
import { TAG_CATEGORY_COLOR } from "../../lib/tagCategoryColors";
import { tagSuggestionCategory } from "../../models/user";

interface SearchBarProps {
  site: Site;
  activeQuery: string;
  onSearch: (query: string) => void;
}

/** Splits an e621 tag query string into tokens, tolerating repeated whitespace. */
function splitTags(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

export function SearchBar({ site, activeQuery, onSearch }: SearchBarProps) {
  const [tags, setTags] = useState<string[]>(() => splitTags(activeQuery));
  const [draft, setDraft] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stay in sync when the active search changes from elsewhere (e.g. clicking a tag in the
  // viewer navigates here with a new query).
  useEffect(() => {
    setTags(splitTags(activeQuery));
    setDraft("");
  }, [activeQuery]);

  const { data: suggestions } = useTagAutocomplete(site, draft);
  const shownSuggestions = useMemo(() => suggestions?.slice(0, 8) ?? [], [suggestions]);

  useEffect(() => {
    setHighlighted(0);
  }, [shownSuggestions]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function commitDraft(rawTag?: string) {
    const value = (rawTag ?? draft).trim();
    if (!value) return;
    const next = [...tags, value];
    setTags(next);
    setDraft("");
    setOpen(false);
  }

  function removeTag(index: number) {
    setTags(tags.filter((_, i) => i !== index));
  }

  function submit(finalTags: string[]) {
    onSearch(finalTags.join(" "));
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && open && shownSuggestions.length > 0) {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % shownSuggestions.length);
      return;
    }
    if (e.key === "ArrowUp" && open && shownSuggestions.length > 0) {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + shownSuggestions.length) % shownSuggestions.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && shownSuggestions.length > 0) {
        const chosen = shownSuggestions[highlighted];
        const prefix = draft.startsWith("-") ? "-" : "";
        const next = [...tags, prefix + chosen.name];
        setTags(next);
        setDraft("");
        setOpen(false);
        submit(next);
        return;
      }
      if (draft.trim()) {
        const next = [...tags, draft.trim()];
        setTags(next);
        setDraft("");
        submit(next);
        return;
      }
      submit(tags);
      return;
    }
    if (e.key === " ") {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft();
      }
      return;
    }
    if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      removeTag(tags.length - 1);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border border-black/10 dark:border-white/10
                   bg-white/70 dark:bg-black/30 px-2 py-1.5 min-h-9 focus-within:ring-2 focus-within:ring-[rgb(var(--accent))]"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, i) => {
          const excluded = tag.startsWith("-");
          return (
            <span
              key={`${tag}-${i}`}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                excluded
                  ? "bg-red-500/15 text-red-600 dark:text-red-400"
                  : "bg-black/8 dark:bg-white/10"
              }`}
            >
              {tag}
              <button
                type="button"
                className="opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(i);
                }}
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id="post-search-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={tags.length === 0 ? "Search tags..." : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5"
        />
      </div>
      {open && shownSuggestions.length > 0 && (
        <ul
          className="absolute z-20 mt-1 w-full max-h-80 overflow-auto rounded-[var(--radius-md)]
                     border border-black/10 dark:border-white/10 bg-[rgb(250,250,250)] dark:bg-[rgb(38,38,38)] shadow-lg"
        >
          {shownSuggestions.map((s, i) => {
            const category = tagSuggestionCategory(s);
            return (
              <li key={s.name}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                    i === highlighted ? "bg-[rgb(var(--accent))]/15" : "hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const prefix = draft.startsWith("-") ? "-" : "";
                    const next = [...tags, prefix + s.name];
                    setTags(next);
                    setDraft("");
                    setOpen(false);
                    submit(next);
                  }}
                >
                  <span style={{ color: TAG_CATEGORY_COLOR[category] }} className="truncate font-medium">
                    {s.name.replace(/_/g, " ")}
                  </span>
                  <span className="shrink-0 text-xs opacity-60">{s.post_count.toLocaleString()}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
