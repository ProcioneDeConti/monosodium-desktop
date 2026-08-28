// Shared constants/helpers for the Popular browser (components/Popular/PopularPanel.tsx) - e621's
// day/week/month post ranking (its own /explore/posts/popular page). No reference-app equivalent;
// neither app has surfaced this endpoint before.

export type PopularScale = "day" | "week" | "month";

export const POPULAR_SCALES: { value: PopularScale; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

/** `YYYY-MM-DD` in local time (the e621 `date` param wants any date within the target period). */
export function isoDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function today(): string {
  return isoDate(new Date());
}

function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Step one period earlier (-1) or later (+1) at the given scale. */
export function shiftPeriod(iso: string, scale: PopularScale, direction: -1 | 1): string {
  const d = parseIso(iso);
  if (scale === "day") d.setDate(d.getDate() + direction);
  else if (scale === "week") d.setDate(d.getDate() + 7 * direction);
  else d.setMonth(d.getMonth() + direction);
  return isoDate(d);
}

/** True once the selected period is the current one (or somehow in the future) - the "next"
 *  stepper is disabled here since e621 has no popular ranking for a period that hasn't happened. */
export function isCurrentOrFuturePeriod(iso: string, scale: PopularScale): boolean {
  return shiftPeriod(iso, scale, 1) > today();
}

export function formatPeriod(iso: string, scale: PopularScale): string {
  const d = parseIso(iso);
  if (scale === "month") {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  }
  if (scale === "week") {
    return `Week of ${d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
