import { useEffect, useRef, useState } from "react";
import type { TagCategory } from "../../models/post";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";

interface TagChipProps {
  name: string;
  category: TagCategory;
  isBlacklistMatch: boolean;
  onSearch: (tag: string) => void;
  onAddToSearch: (tag: string) => void;
  onExcludeFromSearch: (tag: string) => void;
  onAddToBlacklist: (tag: string) => void;
}

/** A category-colored pill, matching the reference Android app's TagChip look exactly - tapping
 *  opens a small menu (Search / Add to search / Exclude / Add to blacklist) rather than acting
 *  immediately, same as there. */
export function TagChip({
  name,
  category,
  isBlacklistMatch,
  onSearch,
  onAddToSearch,
  onExcludeFromSearch,
  onAddToBlacklist,
}: TagChipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const style = TAG_CATEGORY_STYLE[category];
  const displayName = name.replace(/_/g, " ");

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function choose(action: (tag: string) => void) {
    setOpen(false);
    action(name);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={isBlacklistMatch ? "Blacklisted - shown because filtering is disabled" : undefined}
        className={`rounded-[7px] px-2 py-1 text-xs font-medium leading-none ${
          isBlacklistMatch ? "outline outline-2 outline-offset-1 outline-amber-400" : ""
        }`}
        style={{ backgroundColor: style.chipBg, color: style.chipFg }}
      >
        {displayName}
      </button>

      {open && (
        <ul
          className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-[var(--radius-sm)]
                     border border-white/10 bg-[rgb(28,28,28)] py-1 text-xs shadow-lg"
        >
          <li className="truncate border-b border-white/10 px-3 py-1.5 font-semibold text-white/90">
            {displayName}
          </li>
          <li>
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-white hover:bg-white/10"
              onClick={() => choose(onSearch)}
            >
              🔍 Search
            </button>
          </li>
          <li>
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-white hover:bg-white/10"
              onClick={() => choose(onAddToSearch)}
            >
              + Add to search
            </button>
          </li>
          <li>
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-white hover:bg-white/10"
              onClick={() => choose(onExcludeFromSearch)}
            >
              – Exclude from search
            </button>
          </li>
          <li>
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-red-400 hover:bg-white/10"
              onClick={() => choose(onAddToBlacklist)}
            >
              ⊘ Add to blacklist
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
