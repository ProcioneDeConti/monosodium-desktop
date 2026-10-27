import type { Post } from "../models/post";
import type { TagInfo } from "../models/wiki";
import { testBlacklist, type BlacklistEntries } from "./blacklist";

/** One search term and why dropping it might bring results back. */
export interface DropSuggestion {
  /** The term exactly as typed (including any `-`/`~` prefix). */
  term: string;
  /** unknown - no such tag (likely a typo); rare - exists but on few posts; other - anything else
   *  (negations, metatags, wildcards, common tags). */
  reason: "unknown" | "rare" | "other";
  /** Post count, for looked-up tags that exist. */
  count?: number;
}

/** A tag "rare" enough to be the likely culprit when an AND search comes back empty. */
export const RARE_TAG_THRESHOLD = 100;

export function queryTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/** Plain tag names worth a tags.json lookup - positive or `~`-OR terms with no metatag or
 *  wildcard (those aren't tag names, so a lookup would always say "unknown"). */
export function lookupNames(query: string): string[] {
  const names = new Set<string>();
  for (const term of queryTerms(query)) {
    const name = term.replace(/^~/, "").toLowerCase();
    if (!name || name.startsWith("-") || name.includes(":") || name.includes("*")) continue;
    names.add(name);
  }
  return [...names];
}

/** Every term the user could drop, most-likely-culprit first: unknown tags, then rare tags
 *  (rarest first), then the rest in query order. `tags` is the lookup result for
 *  `lookupNames(query)`, or undefined while it's loading / failed (then nothing is classified). */
export function dropSuggestions(query: string, tags: TagInfo[] | undefined): DropSuggestion[] {
  const counts = new Map(tags?.map((t) => [t.name.toLowerCase(), t.post_count]));
  const looked = new Set(lookupNames(query));
  const out = queryTerms(query).map((term): DropSuggestion => {
    const name = term.replace(/^~/, "").toLowerCase();
    if (!tags || !looked.has(name)) return { term, reason: "other" };
    const count = counts.get(name);
    if (count == null || count === 0) return { term, reason: "unknown", count: 0 };
    return { term, reason: count < RARE_TAG_THRESHOLD ? "rare" : "other", count };
  });
  const rank = { unknown: 0, rare: 1, other: 2 } as const;
  return out
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        rank[a.s.reason] - rank[b.s.reason] ||
        (a.s.reason === "rare" ? (a.s.count ?? 0) - (b.s.count ?? 0) : 0) ||
        a.i - b.i,
    )
    .map(({ s }) => s);
}

/** The query with one term removed. */
export function withoutTerm(query: string, term: string): string {
  const terms = queryTerms(query);
  const i = terms.indexOf(term);
  if (i >= 0) terms.splice(i, 1);
  return terms.join(" ");
}

/** Which blacklist lines hid these posts, and how many each - most-hiding first. A post matched
 *  by several lines counts toward each, so the numbers can sum past the post count. */
export function blacklistCulprits(
  entries: BlacklistEntries,
  posts: Post[],
): { line: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const t of testBlacklist(entries, post)) {
      if (t.matched) counts.set(t.line, (counts.get(t.line) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([line, count]) => ({ line, count }))
    .sort((a, b) => b.count - a.count || a.line.localeCompare(b.line));
}
