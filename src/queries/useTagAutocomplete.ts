import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import { useDebouncedValue } from "../lib/useDebouncedValue";

/** Live tag-autocomplete suggestions for whatever the user is currently typing (the "draft"
 *  token in SearchBar). Debounced client-side so fast typing doesn't fire a request per keystroke
 *  - the Rust-side rate limiter would otherwise just queue them up and answer late anyway. */
export function useTagAutocomplete(site: Site, draft: string) {
  const debounced = useDebouncedValue(draft.trim(), 200);
  const prefix = debounced.replace(/^-/, "");
  // A colon means this is a meta search operator (rating:safe, score:>1500, id:123, user:foo,
  // order:score, ...), not a taggable name - e621 tags themselves never contain one. Fetching
  // "suggestions" for these returns whatever loosely matches the raw string, which then looks
  // like a real option and (see SearchBar's Enter handler) would otherwise get silently
  // auto-selected in place of the operator the user actually typed.
  const isMetaOperator = prefix.includes(":");

  return useQuery({
    queryKey: ["tagAutocomplete", site, prefix],
    queryFn: () => e621Api.autocompleteTags(site, `${prefix}*`),
    enabled: prefix.length >= 2 && !isMetaOperator,
    staleTime: 60_000,
  });
}
