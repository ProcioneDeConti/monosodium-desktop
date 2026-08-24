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

  return useQuery({
    queryKey: ["tagAutocomplete", site, prefix],
    queryFn: () => e621Api.autocompleteTags(site, `${prefix}*`),
    enabled: prefix.length >= 2,
    staleTime: 60_000,
  });
}
