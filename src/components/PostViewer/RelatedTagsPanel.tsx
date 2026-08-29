import { useEffect } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import type { Site } from "../../models/site";
import { numericTagCategory } from "../../models/user";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { useRelatedTagsQuery } from "../../queries/useRelatedTags";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface RelatedTagsPanelProps {
  site: Site;
  tag: string;
  /** e621's related_tag.json is `member_only` - a logged-out request just 403s. */
  isAuthenticated: boolean;
  onClose: () => void;
  onSearch: (tag: string) => void;
  onAddToSearch: (tag: string) => void;
  onExclude: (tag: string) => void;
}

/** Modal over the post viewer: tags related to one tag (e621's related_tag.json), each with
 *  search / add-to-search / exclude actions for refining a broad search. */
export function RelatedTagsPanel({
  site,
  tag,
  isAuthenticated,
  onClose,
  onSearch,
  onAddToSearch,
  onExclude,
}: RelatedTagsPanelProps) {
  const { data: related, isLoading, isError } = useRelatedTagsQuery(site, tag, isAuthenticated);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    // Capture so it beats the viewer's own Escape handler.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md animate-[scale-in_120ms_ease-out] flex-col
                   rounded-[var(--radius-md)] border border-white/10 bg-[rgb(24,24,24)] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">
            Related to <span className="text-[rgb(var(--accent))]">{tag.replace(/_/g, " ")}</span>
          </h2>
          <IconButton tone="invert" onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={16} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!isAuthenticated ? (
            <p className="py-4 text-sm opacity-60">Sign in (Settings) to see related tags.</p>
          ) : isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm opacity-60">
              <Spinner size={13} />
              Loading…
            </div>
          ) : isError ? (
            <p className="py-4 text-sm text-red-400">Failed to load related tags.</p>
          ) : !related || related.length === 0 ? (
            <p className="py-4 text-sm opacity-60">No related tags found.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {related.map((t) => {
                const style = TAG_CATEGORY_STYLE[numericTagCategory(t.category)];
                return (
                  <li
                    key={t.name}
                    className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-white/5"
                  >
                    <span
                      className="min-w-0 flex-1 truncate rounded-[6px] px-2 py-1 text-xs font-medium"
                      style={{ backgroundColor: style.chipBg, color: style.chipFg }}
                    >
                      {t.name.replace(/_/g, " ")}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100">
                      <button
                        type="button"
                        title="Add to search"
                        onClick={() => onAddToSearch(t.name)}
                        className="rounded p-1 hover:bg-white/15"
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        type="button"
                        title="Exclude from search"
                        onClick={() => onExclude(t.name)}
                        className="rounded p-1 hover:bg-white/15"
                      >
                        <Minus size={13} />
                      </button>
                      <button
                        type="button"
                        title="Search this tag"
                        onClick={() => onSearch(t.name)}
                        className="rounded p-1 hover:bg-white/15"
                      >
                        <Search size={13} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
