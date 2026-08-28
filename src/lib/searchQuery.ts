// Small helpers for manipulating an e621 tag-query string. Kept separate from SearchBar's own
// splitTags so non-UI callers (the shuffle button, recent-search history, ...) can share it.

/** Tokenises an e621 tag query, tolerating repeated whitespace. */
export function splitQuery(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

export function normalizeQuery(query: string): string {
  return splitQuery(query).join(" ");
}

/** `query` with an `order:random` token, replacing any existing `order:*` (e621 only honours the
 *  last one anyway, but dropping the stale token keeps the search bar's chips clean). */
export function withRandomOrder(query: string): string {
  const tokens = splitQuery(query).filter((t) => !/^-?order:/i.test(t));
  tokens.push("order:random");
  return tokens.join(" ");
}
