import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, X } from "lucide-react";
import type { Site } from "../../models/site";
import { useTagAutocomplete } from "../../queries/useTagAutocomplete";
import { useMetatagCompletions } from "../../queries/useMetatagValues";
import { useSearchHistoryStore } from "../../state/searchHistoryStore";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { cacheTagCategory, getCachedTagCategory } from "../../lib/tagCategoryCache";
import { tagSuggestionCategory } from "../../models/user";
import { EasterEggDialog } from "./EasterEggDialog";

/** Strips the leading `-` (exclusion) so the remainder can be looked up as a plain tag name;
 *  meta search operators (`rating:safe`, `user:foo`, `order:score`, ...) aren't real e621 tags
 *  and have no category, so they're deliberately left uncolored. */
function tagLookupName(tag: string): string | null {
  const name = tag.replace(/^-/, "");
  return name.includes(":") ? null : name;
}

// Ported from the reference Android app's PostGridScreen.kt - "cooter" isn't a real e621 tag,
// it only ever triggers EasterEggDialog, whether typed live or finalized as a token (a fast
// paste can skip the live check below, landing straight on a finalized "cooter " - so both
// paths guard against it, same as there).
const EASTER_EGG_WORD = "cooter";

function isEasterEggToken(token: string): boolean {
  return token.trim().replace(/^-/, "").toLowerCase() === EASTER_EGG_WORD;
}

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
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stay in sync when the active search changes from elsewhere (e.g. clicking a tag in the
  // viewer navigates here with a new query).
  useEffect(() => {
    setTags(splitTags(activeQuery));
    setDraft("");
  }, [activeQuery]);

  // Live typing straight into "cooter" (no space needed) triggers the egg immediately and clears
  // the field, so the word itself never lingers as a fake search chip.
  useEffect(() => {
    if (isEasterEggToken(draft)) {
      setShowEasterEgg(true);
      setDraft("");
      setOpen(false);
    }
  }, [draft]);

  // Close to (but not yet) the magic word: tease it instead of showing real suggestions, without
  // ever revealing/offering the word itself - same thresholds as the reference app (a prefix of
  // "cooter" at least 4 characters long, i.e. its length minus 2).
  const eggPrefix = draft.replace(/^-/, "").trim().toLowerCase();
  const almostThereEgg =
    eggPrefix.length > 0 &&
    EASTER_EGG_WORD.startsWith(eggPrefix) &&
    eggPrefix.length >= EASTER_EGG_WORD.length - 2 &&
    eggPrefix !== EASTER_EGG_WORD;

  const searchHistory = useSearchHistoryStore((s) => s.history);
  const removeHistory = useSearchHistoryStore((s) => s.remove);
  const clearHistory = useSearchHistoryStore((s) => s.clear);
  const recentSearches = useMemo(
    () => searchHistory.filter((q) => q !== activeQuery).slice(0, 8),
    [searchHistory, activeQuery],
  );
  const showHistory = open && draft.trim() === "" && recentSearches.length > 0;

  const { data: suggestions } = useTagAutocomplete(site, draft);
  const shownSuggestions = useMemo(
    () => (almostThereEgg ? [] : (suggestions?.slice(0, 8) ?? [])),
    [suggestions, almostThereEgg],
  );

  // Metatag operator completion (`rating:`, `order:`, `user:`, `pool:`, ...). Mutually exclusive
  // with tag autocomplete, which is suppressed for anything containing a colon.
  const meta = useMetatagCompletions(site, draft);
  const metaActive = meta.active && !almostThereEgg && draft.trim().length > 0;
  const metaSuggestions = metaActive ? meta.suggestions.slice(0, 10) : [];
  const navLen = metaActive ? metaSuggestions.length : shownSuggestions.length;

  useEffect(() => {
    suggestions?.forEach((s) => cacheTagCategory(s.name, tagSuggestionCategory(s)));
  }, [suggestions]);

  useEffect(() => {
    setHighlighted(0);
  }, [draft]);

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
    if (isEasterEggToken(value)) {
      setShowEasterEgg(true);
      setDraft("");
      setOpen(false);
      return;
    }
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
    if (e.key === "ArrowDown" && open && navLen > 0) {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % navLen);
      return;
    }
    if (e.key === "ArrowUp" && open && navLen > 0) {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + navLen) % navLen);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (metaActive && metaSuggestions.length > 0) {
        const chosen = metaSuggestions[highlighted] ?? metaSuggestions[0];
        const next = [...tags, chosen.value];
        setTags(next);
        setDraft("");
        setOpen(false);
        submit(next);
        return;
      }
      // Also re-checked here (not just in useTagAutocomplete's `enabled`) because the dropdown's
      // suggestions lag the debounce by up to 200ms - typing a meta operator like "score:>1500"
      // fast enough and hitting Enter within that window could otherwise still auto-select a
      // suggestion left over from an earlier, still-plain-tag-shaped prefix.
      if (open && shownSuggestions.length > 0 && tagLookupName(draft) !== null) {
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
        if (isEasterEggToken(draft)) {
          setShowEasterEgg(true);
          setDraft("");
          return;
        }
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
                   bg-white/70 dark:bg-black/30 px-2 py-1.5 min-h-9 transition-shadow
                   focus-within:ring-2 focus-within:ring-[rgb(var(--accent))]"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, i) => {
          const excluded = tag.startsWith("-");
          const lookupName = tagLookupName(tag);
          const category = lookupName ? getCachedTagCategory(lookupName) : null;
          const style = category ? TAG_CATEGORY_STYLE[category] : null;
          return (
            <span
              key={`${tag}-${i}`}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                style ? "" : "bg-black/8 dark:bg-white/10"
              } ${excluded ? "outline outline-2 outline-offset-1 outline-red-500" : ""}`}
              style={style ? { backgroundColor: style.chipBg, color: style.chipFg } : undefined}
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
                <X size={12} />
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

      {open && metaActive && (metaSuggestions.length > 0 || meta.hint) && (
        <ul
          className="absolute z-20 mt-1 w-full max-h-80 overflow-auto rounded-[var(--radius-md)] border
                     border-black/10 dark:border-white/10 bg-[rgb(250,250,250)] dark:bg-[rgb(38,38,38)] shadow-lg"
        >
          {meta.hint && (
            <li className="px-3 py-1.5 text-xs italic opacity-60">{meta.hint}</li>
          )}
          {metaSuggestions.map((s, i) => (
            <li key={s.value}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                  i === highlighted ? "bg-[rgb(var(--accent))]/15" : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const next = [...tags, s.value];
                  setTags(next);
                  setDraft("");
                  setOpen(false);
                  submit(next);
                }}
              >
                <span className="truncate font-medium">{s.label}</span>
                {s.detail && <span className="shrink-0 text-xs opacity-60">{s.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showHistory && !almostThereEgg && (
        <ul
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border
                     border-black/10 dark:border-white/10 bg-[rgb(250,250,250)] dark:bg-[rgb(38,38,38)] shadow-lg"
        >
          <li className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-50">
            Recent
            <button
              type="button"
              className="normal-case hover:text-[rgb(var(--accent))]"
              onMouseDown={(e) => {
                e.preventDefault();
                clearHistory();
              }}
            >
              Clear
            </button>
          </li>
          {recentSearches.map((q) => (
            <li key={q} className="group flex items-center">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setTags(splitTags(q));
                  setDraft("");
                  setOpen(false);
                  onSearch(q);
                }}
              >
                <Clock size={12} className="shrink-0 opacity-40" />
                <span className="truncate">{q}</span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${q}`}
                className="mr-1 shrink-0 rounded p-1 opacity-0 hover:bg-black/5 group-hover:opacity-60 dark:hover:bg-white/10"
                onMouseDown={(e) => {
                  e.preventDefault();
                  removeHistory(q);
                }}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && almostThereEgg && (
        <div
          className="absolute z-20 mt-1 w-full rounded-[var(--radius-md)] border border-black/10
                     dark:border-white/10 bg-[rgb(250,250,250)] dark:bg-[rgb(38,38,38)] px-3 py-2
                     text-sm italic opacity-70 shadow-lg"
        >
          Almost there…
        </div>
      )}
      {open && !almostThereEgg && shownSuggestions.length > 0 && (
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
                  <span
                    style={{ color: TAG_CATEGORY_STYLE[category].headerColor ?? "inherit" }}
                    className="truncate font-medium"
                  >
                    {s.name.replace(/_/g, " ")}
                  </span>
                  <span className="shrink-0 text-xs opacity-60">{s.post_count.toLocaleString()}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showEasterEgg && <EasterEggDialog onClose={() => setShowEasterEgg(false)} />}
    </div>
  );
}
