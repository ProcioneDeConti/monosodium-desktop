import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { Rating } from "../../models/post";
import {
  buildQuery,
  EMPTY_CRITERIA,
  FILE_TYPES,
  parseCriteria,
  SORT_OPTIONS,
  type SearchCriteria,
} from "../../lib/searchBuilder";
import { IconButton } from "../ui/IconButton";

interface SearchBuilderProps {
  /** Current search - prefills the form. */
  initialQuery: string;
  onApply: (query: string) => void;
  onClose: () => void;
}

const RATINGS: { value: Rating; label: string }[] = [
  { value: "s", label: "Safe" },
  { value: "q", label: "Questionable" },
  { value: "e", label: "Explicit" },
];

const inputClass =
  "rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 " +
  "px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";

export function SearchBuilder({ initialQuery, onApply, onClose }: SearchBuilderProps) {
  const [c, setC] = useState<SearchCriteria>(() => parseCriteria(initialQuery));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const preview = useMemo(() => buildQuery(c), [c]);
  const set = <K extends keyof SearchCriteria>(key: K, value: SearchCriteria[K]) =>
    setC((prev) => ({ ...prev, [key]: value }));

  function toggleRating(r: Rating) {
    setC((prev) => ({
      ...prev,
      ratings: prev.ratings.includes(r) ? prev.ratings.filter((x) => x !== r) : [...prev.ratings, r],
    }));
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="mt-8 flex w-full max-w-md animate-[scale-in_120ms_ease-out] flex-col rounded-[var(--radius-md)]
                   border border-black/10 dark:border-white/10 bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <Search size={15} className="text-[rgb(var(--accent))]" />
          <h1 className="text-sm font-semibold">Advanced search</h1>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={17} />
          </IconButton>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          <Field label="Tags">
            <input
              value={c.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="e.g. canine solo -meme"
              className={inputClass}
            />
          </Field>

          <Field label="Rating">
            <div className="flex gap-1.5">
              {RATINGS.map((r) => {
                const on = c.ratings.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleRating(r.value)}
                    className={`flex-1 rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs font-medium transition-colors ${
                      on
                        ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]"
                        : "border-black/10 dark:border-white/10 opacity-70 hover:opacity-100"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] opacity-45">None or all = no rating filter.</p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Min. score">
              <input
                type="number"
                inputMode="numeric"
                value={c.minScore}
                onChange={(e) => set("minScore", e.target.value.replace(/\D/g, ""))}
                placeholder="any"
                className={inputClass}
              />
            </Field>
            <Field label="Min. favorites">
              <input
                type="number"
                inputMode="numeric"
                value={c.minFav}
                onChange={(e) => set("minFav", e.target.value.replace(/\D/g, ""))}
                placeholder="any"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date from">
              <input type="date" value={c.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Date to">
              <input type="date" value={c.dateTo} onChange={(e) => set("dateTo", e.target.value)} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="File type">
              <select value={c.fileType} onChange={(e) => set("fileType", e.target.value)} className={inputClass}>
                <option value="">Any</option>
                {FILE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sort by">
              <select value={c.order} onChange={(e) => set("order", e.target.value)} className={inputClass}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-50">Query</p>
            <code className="block truncate rounded-[var(--radius-sm)] bg-black/[0.04] px-2 py-1.5 text-xs dark:bg-white/[0.06]">
              {preview || "(all posts)"}
            </code>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-black/10 dark:border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => setC({ ...EMPTY_CRITERIA, ratings: [] })}
            className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/10"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onApply(preview)}
            className="rounded-[var(--radius-sm)] bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-semibold text-white
                       transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-50">{label}</span>
      {children}
    </label>
  );
}
