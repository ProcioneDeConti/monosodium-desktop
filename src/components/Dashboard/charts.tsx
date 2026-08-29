// Small dependency-free chart primitives for the User Dashboard. Single-hue (the app accent) for
// every magnitude encoding, recessive tracks, direct value labels, rounded data-ends - no chart
// library, matching the app's zero-extra-deps approach. Hover feedback is a row highlight + a
// native title tooltip (the app's existing lightweight convention), not a floating tooltip layer.

import type { ReactNode } from "react";

export function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-55">
        <span className="text-[rgb(var(--accent))] opacity-90">{icon}</span>
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
      {sub != null && <div className="mt-0.5 text-[11px] opacity-55">{sub}</div>}
    </div>
  );
}

export interface BarItem {
  label: string;
  value: number;
  /** Formatted value shown at the row's right edge (defaults to the number). */
  display?: string;
  /** Optional category-colored dot before the label + custom bar color. */
  color?: string;
  onClick?: () => void;
}

export function BarList({
  items,
  emptyLabel = "No data yet",
}: {
  items: BarItem[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-2 text-xs opacity-45">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-1">
      {items.map((item, i) => {
        const pct = Math.max(2, (item.value / max) * 100);
        const display = item.display ?? item.value.toLocaleString();
        const inner = (
          <>
            <span className="flex items-center gap-1.5 truncate">
              {item.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              )}
              <span className={`truncate ${item.onClick ? "group-hover:underline" : ""}`}>
                {item.label}
              </span>
            </span>
            <span className="h-2.5 min-w-0 rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
              <span
                className="block h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: item.color ?? "rgb(var(--accent))" }}
              />
            </span>
            <span className="shrink-0 tabular-nums opacity-60">{display}</span>
          </>
        );
        const cls =
          "group grid w-full grid-cols-[9rem_1fr_auto] items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-left text-xs";
        return item.onClick ? (
          <button
            key={`${item.label}-${i}`}
            type="button"
            onClick={item.onClick}
            title={`${item.label}: ${display}`}
            className={`${cls} hover:bg-black/[0.04] dark:hover:bg-white/[0.06]`}
          >
            {inner}
          </button>
        ) : (
          <div key={`${item.label}-${i}`} title={`${item.label}: ${display}`} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function SplitBar({ segments }: { segments: { label: string; value: number; color?: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <p className="py-2 text-xs opacity-45">No data yet</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <span
            key={s.label}
            title={`${s.label}: ${s.value.toLocaleString()} (${Math.round((s.value / total) * 100)}%)`}
            style={{
              width: `${(s.value / total) * 100}%`,
              backgroundColor:
                s.color ?? (i === 0 ? "rgb(var(--accent))" : "rgb(var(--accent) / 0.4)"),
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {segments.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1.5 opacity-70">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  s.color ?? (i === 0 ? "rgb(var(--accent))" : "rgb(var(--accent) / 0.4)"),
              }}
            />
            {s.label}
            <span className="tabular-nums opacity-60">
              {s.value.toLocaleString()} · {Math.round((s.value / total) * 100)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export interface HeatDay {
  /** "YYYY-MM-DD" */
  date: string;
  value: number;
  label: string;
}

/** GitHub-style contribution grid. `days` ascending by date. */
export function Heatmap({ days, unit }: { days: HeatDay[]; unit: string }) {
  const max = Math.max(...days.map((d) => d.value), 1);
  const firstWeekday = days.length ? new Date(days[0].date + "T00:00:00").getDay() : 0;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid w-max gap-[3px]"
        style={{ gridTemplateRows: "repeat(7, 11px)", gridAutoFlow: "column", gridAutoColumns: "11px" }}
      >
        {days.map((d, i) => {
          const empty = d.value <= 0;
          const r = d.value / max;
          const op = r > 0.75 ? 1 : r > 0.5 ? 0.72 : r > 0.25 ? 0.48 : 0.28;
          return (
            <span
              key={d.date}
              title={`${d.label}: ${d.value.toLocaleString()} ${unit}`}
              className={`rounded-[2px] ${empty ? "bg-black/[0.06] dark:bg-white/[0.08]" : ""}`}
              style={{
                ...(i === 0 ? { gridRowStart: firstWeekday + 1 } : {}),
                ...(empty ? {} : { backgroundColor: `rgb(var(--accent) / ${op})` }),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
