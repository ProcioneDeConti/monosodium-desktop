// Small helpers for manipulating an e621 tag-query string. Kept separate from SearchBar's own
// splitTags so non-UI callers (the shuffle button, recent-search history, ...) can share it.

/** Tokenises an e621 tag query, tolerating repeated whitespace. */
export function splitQuery(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

export function normalizeQuery(query: string): string {
  return splitQuery(query).join(" ");
}

/** True when the query is (or includes) the signed-in user's own favourites - `fav:me` or
 *  `fav:<their name>`. Used to decide whether a bulk un-favorite should prune the grid. */
export function isOwnFavoritesView(query: string, username?: string | null): boolean {
  const name = username?.toLowerCase();
  return splitQuery(query).some((t) => {
    const m = t.toLowerCase().match(/^fav:(.+)$/);
    if (!m) return false;
    return m[1] === "me" || (name != null && m[1] === name);
  });
}

/** `query` with an `order:random` token, replacing any existing `order:*` (e621 only honours the
 *  last one anyway, but dropping the stale token keeps the search bar's chips clean). */
export function withRandomOrder(query: string): string {
  const tokens = splitQuery(query).filter((t) => !/^-?order:/i.test(t));
  tokens.push("order:random");
  return tokens.join(" ");
}
