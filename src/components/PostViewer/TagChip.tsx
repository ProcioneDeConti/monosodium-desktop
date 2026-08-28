import { useEffect, useRef, useState } from "react";
import { Ban, Minus, Network, Plus, Search } from "lucide-react";
import type { TagCategory } from "../../models/post";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { Button } from "../ui/Button";

interface TagChipProps {
  name: string;
  category: TagCategory;
  isBlacklistMatch: boolean;
  onSearch: (tag: string) => void;
  onAddToSearch: (tag: string) => void;
  onExcludeFromSearch: (tag: string) => void;
  onAddToBlacklist: (tag: string) => void;
  onFindRelated: (tag: string) => void;
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
  onFindRelated,
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
        className={`rounded-[7px] px-2 py-1 text-xs font-medium leading-none transition-transform
                    duration-100 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-[rgb(var(--accent))] ${
          isBlacklistMatch ? "outline outline-2 outline-offset-1 outline-amber-400" : ""
        }`}
        style={{ backgroundColor: style.chipBg, color: style.chipFg }}
      >
        {displayName}
      </button>

      {open && (
        <ul
          className="absolute left-0 top-full z-30 mt-1 w-48 animate-[scale-in_100ms_ease-out] origin-top-left
                     overflow-hidden rounded-[var(--radius-sm)] border border-white/10 bg-[rgb(28,28,28)]
                     py-1 text-xs shadow-xl shadow-black/40"
        >
          <li className="truncate border-b border-white/10 px-3 py-1.5 font-semibold text-white/90">
            {displayName}
          </li>
          <li>
            <Button variant="menu" icon={<Search size={13} />} onClick={() => choose(onSearch)}>
              Search
            </Button>
          </li>
          <li>
            <Button variant="menu" icon={<Plus size={13} />} onClick={() => choose(onAddToSearch)}>
              Add to search
            </Button>
          </li>
          <li>
            <Button variant="menu" icon={<Minus size={13} />} onClick={() => choose(onExcludeFromSearch)}>
              Exclude from search
            </Button>
          </li>
          <li>
            <Button variant="menu" icon={<Network size={13} />} onClick={() => choose(onFindRelated)}>
              Related tags
            </Button>
          </li>
          <li>
            <Button
              variant="menu"
              icon={<Ban size={13} />}
              className="!text-red-400"
              onClick={() => choose(onAddToBlacklist)}
            >
              Add to blacklist
            </Button>
          </li>
        </ul>
      )}
    </div>
  );
}
