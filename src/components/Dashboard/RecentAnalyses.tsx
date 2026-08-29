import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import type { Site } from "../../models/site";
import { listFreshAnalyses, removeCachedAnalysis } from "../../state/favoritesAnalysisCache";

interface RecentAnalysesProps {
  site: Site;
  /** The ref currently open in the runner, if any - highlighted in the list. */
  activeRef: string | null;
  onPick: (ref: string) => void;
}

function fmt(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Recently analyzed" - fresh (< 30 min) cached favourites analyses, with a countdown to when
 *  each one's cache lapses. Clicking a row re-opens that cached result in the runner. */
export function RecentAnalyses({ site, activeRef, onPick }: RecentAnalysesProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = listFreshAnalyses(site).filter((r) => r.expiresAt > now);
  if (rows.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-50">
        Recently analyzed
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div
            key={r.ref}
            className={`group flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs
                        ${
                          activeRef?.toLowerCase() === r.ref
                            ? "border-[rgb(var(--accent))]/50 bg-[rgb(var(--accent))]/[0.08]"
                            : "border-black/10 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.05]"
                        }`}
          >
            <button
              type="button"
              onClick={() => onPick(r.ref)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className="truncate font-medium">{r.name}</span>
              <span className="shrink-0 opacity-50">{r.sampled.toLocaleString()} favs</span>
            </button>
            <span
              className="flex shrink-0 items-center gap-1 tabular-nums opacity-45"
              title="Time until this cached result expires"
            >
              <Clock size={11} />
              {fmt(r.expiresAt - now)}
            </span>
            <button
              type="button"
              onClick={() => {
                removeCachedAnalysis(site, r.ref);
                setNow(Date.now());
              }}
              title="Forget this analysis"
              className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-60 dark:hover:bg-white/10"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
