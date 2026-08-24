import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useSavedSearchesStore } from "../../state/savedSearchesStore";
import { IconButton } from "../ui/IconButton";

interface SavedSearchesPanelProps {
  currentQuery: string;
  onClose: () => void;
  onApply: (query: string) => void;
}

/** Full-screen overlay, same shell pattern as SettingsPanel/ProfilePanel - matches the reference
 *  Android app's dedicated Saved Searches screen (not a dropdown/dialog). Create and delete only;
 *  the reference app has no rename or reorder either, so neither does this. */
export function SavedSearchesPanel({ currentQuery, onClose, onApply }: SavedSearchesPanelProps) {
  const savedSearches = useSavedSearchesStore((s) => s.savedSearches);
  const add = useSavedSearchesStore((s) => s.add);
  const remove = useSavedSearchesStore((s) => s.remove);
  const [label, setLabel] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSave() {
    if (!label.trim()) return;
    void add(label, currentQuery);
    setLabel("");
  }

  function handleApply(query: string) {
    onApply(query);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md animate-[scale-in_150ms_ease-out] flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <h1 className="text-sm font-semibold">Saved Searches</h1>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={18} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {currentQuery.trim() && (
            <div className="mb-4 border-b border-black/10 dark:border-white/10 pb-4">
              <p className="mb-2 text-xs opacity-60">
                Current search: <span className="font-medium opacity-90">{currentQuery}</span>
              </p>
              <div className="flex gap-2">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  placeholder="Label"
                  className="flex-1 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                             bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none
                             focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
                <IconButton
                  onClick={handleSave}
                  disabled={!label.trim()}
                  title="Save current search"
                  className="border border-black/10 dark:border-white/10"
                >
                  <Plus size={16} />
                </IconButton>
              </div>
            </div>
          )}

          {savedSearches.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm opacity-60">
              No saved searches yet.
            </div>
          ) : (
            <div className="flex flex-col">
              {savedSearches.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-1 border-b border-black/5 dark:border-white/5 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => handleApply(entry.query)}
                    className="min-w-0 flex-1 rounded-[var(--radius-sm)] px-1 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <p className="truncate text-sm font-semibold">{entry.label}</p>
                    <p className="truncate text-xs opacity-60">{entry.query}</p>
                  </button>
                  <IconButton onClick={() => void remove(entry.id)} title="Delete">
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
