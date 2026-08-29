import { Plus, X } from "lucide-react";

export interface SearchTab {
  id: string;
  query: string;
}

interface TabBarProps {
  tabs: SearchTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

/** Browser-style strip of parallel searches. Only rendered when there are 2+ tabs (App.tsx). */
export function TabBar({ tabs, activeTabId, onSelect, onClose, onNew }: TabBarProps) {
  return (
    <div className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-black/10 dark:border-white/10 px-2 py-1">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const label = tab.query.trim() || "All posts";
        return (
          <div
            key={tab.id}
            className={`group flex max-w-[220px] shrink-0 items-center gap-1 rounded-[var(--radius-sm)] pl-2.5 pr-1 py-1
                        text-xs transition-colors ${
                          active
                            ? "bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]"
                            : "hover:bg-black/5 dark:hover:bg-white/5"
                        }`}
          >
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              title={label}
              className="min-w-0 flex-1 truncate text-left font-medium"
            >
              {label}
            </button>
            <button
              type="button"
              onClick={() => onClose(tab.id)}
              aria-label="Close tab"
              className="shrink-0 rounded p-0.5 opacity-0 hover:bg-black/10 group-hover:opacity-70 dark:hover:bg-white/15"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onNew}
        title="New tab (Ctrl+T)"
        className="flex shrink-0 items-center rounded-[var(--radius-sm)] px-1.5 hover:bg-black/5 dark:hover:bg-white/5"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
