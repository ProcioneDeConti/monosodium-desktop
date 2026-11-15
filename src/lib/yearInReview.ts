// Year-in-review scoping for the favourites analysis / Wrapped card.
//
// e621 never says *when* something was favourited, so two scopes are offered:
//   - "uploaded": favourites whose post was uploaded in the year (a plain `date:` search; any year).
//   - "faved":    favourites that were certainly *added* this year, inferred from order.
//     favorites.json lists newest favourite first. A post can't be favourited before it exists,
//     so if a post uploaded this year sits at position k, every favourite at positions 0..k
//     was added this year too. The confirmed set is that prefix, up to the oldest-favourited post
//     uploaded this year that we find. Old art favourited this year *after* that point is missed,
//     so the result is a guaranteed minimum, never an overcount. Only works for the current
//     year: there's no upper bound on a favourite's time, so a past year can't be isolated.

import type { Post } from "../models/post";

export type PeriodMode = "faved" | "uploaded";

export interface WrappedPeriod {
  year: number;
  mode: PeriodMode;
}

/** Stop walking after this many favourites in a row without a this-year upload. Each later find
 *  would only extend the confirmed prefix, so giving up early can undercount but never overcount. */
export const FAVED_SCAN_GAP = 960;

/** First year e621 has posts for; the "uploaded" year picker starts here. */
export const FIRST_YEAR = 2007;

export function uploadedYearTags(name: string, year: number, includeDeleted: boolean): string {
  return `fav:${name} date:${year}-01-01..${year}-12-31${includeDeleted ? " status:any" : ""}`;
}

/** Streaming scanner for the "faved" scope. Feed pages in favourite order; each call returns the
 *  posts it just confirmed (in order). Unconfirmed posts are held only until the next this-year
 *  upload or the gap runs out, so memory stays bounded by FAVED_SCAN_GAP. */
export class FavedYearScanner {
  private pending: Post[] = [];
  private sinceHit = 0;
  private readonly start: number;
  confirmed = 0;

  constructor(
    year: number,
    private readonly gap = FAVED_SCAN_GAP,
  ) {
    this.start = new Date(year, 0, 1).getTime();
  }

  feed(page: Post[]): Post[] {
    const out: Post[] = [];
    for (const post of page) {
      this.pending.push(post);
      const t = post.created_at ? Date.parse(post.created_at) : NaN;
      if (Number.isFinite(t) && t >= this.start) {
        out.push(...this.pending);
        this.pending = [];
        this.sinceHit = 0;
      } else {
        this.sinceHit += 1;
      }
    }
    this.confirmed += out.length;
    return out;
  }

  /** True once a long enough run without a this-year upload makes further pages pointless. */
  get exhausted(): boolean {
    return this.sinceHit >= this.gap;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Upload-month histogram for one year ("uploaded" scope only - in "faved" scope upload months
 *  say nothing about when you favourited). Months with zero are kept so the chart reads as a year. */
export function monthCounts(posts: Iterable<Post>, year: number, into: number[] = new Array(12).fill(0)): number[] {
  for (const p of posts) {
    if (!p.created_at) continue;
    const d = new Date(p.created_at);
    if (d.getFullYear() === year) into[d.getMonth()] += 1;
  }
  return into;
}

export function monthBars(counts: number[]): { label: string; count: number }[] {
  return counts.map((count, i) => ({ label: MONTHS[i], count }));
}

export function busiestMonth(counts: number[]): string | null {
  let best = -1;
  let bestCount = 0;
  counts.forEach((c, i) => {
    if (c > bestCount) {
      best = i;
      bestCount = c;
    }
  });
  return best >= 0 ? MONTHS_LONG[best] : null;
}

/** Card title, e.g. "2026, wrapped" (or the all-time "Favorites, wrapped"). */
export function wrappedTitle(period: WrappedPeriod | null | undefined): string {
  return period ? `${period.year}, wrapped` : "Favorites, wrapped";
}

/** "1,234 favorites analyzed" / "at least 312 faved in 2026" / "418 favorites from 2026". */
export function analyzedLine(sampled: number, period: WrappedPeriod | null | undefined): string {
  const n = sampled.toLocaleString();
  if (!period) return `${n} favorites analyzed`;
  return period.mode === "faved"
    ? `at least ${n} faved in ${period.year}`
    : `${n} favorites from ${period.year}`;
}
