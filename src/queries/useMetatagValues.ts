import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import { enumCompletions, matchMetatag } from "../lib/metatags";
import { useDebouncedValue } from "../lib/useDebouncedValue";

export interface MetatagSuggestion {
  /** The full token to commit as a search chip, e.g. "rating:safe" or "-user:foo". */
  value: string;
  label: string;
  detail?: string;
}

export interface MetatagCompletions {
  /** True when the draft is a recognised metatag operator (so tag autocomplete stays hidden). */
  active: boolean;
  /** A non-selectable syntax note (comparison/date metatags, or a "searching…" status). */
  hint: string | null;
  suggestions: MetatagSuggestion[];
}

/** Value completions for whatever metatag the SearchBar draft currently is. Static enums resolve
 *  synchronously; `user:`/`pool:` values are fetched (debounced). */
export function useMetatagCompletions(site: Site, draft: string): MetatagCompletions {
  const match = matchMetatag(draft);
  const debounced = useDebouncedValue(match?.valuePart ?? "", 200);
  const neg = match?.negated ? "-" : "";
  const prefix = match?.def.prefix ?? "";

  const usersQuery = useQuery({
    queryKey: ["metaUsers", site, debounced],
    queryFn: () => e621Api.autocompleteUsers(site, debounced),
    enabled: match?.def.kind === "user" && debounced.length >= 1,
    staleTime: 60_000,
  });

  const poolsQuery = useQuery({
    queryKey: ["metaPools", site, debounced],
    queryFn: () => e621Api.autocompletePools(site, debounced),
    enabled: match?.def.kind === "pool" && debounced.length >= 2,
    staleTime: 60_000,
  });

  if (!match) return { active: false, hint: null, suggestions: [] };

  switch (match.def.kind) {
    case "hint":
      return { active: true, hint: match.def.hint ?? null, suggestions: [] };
    case "enum":
      return {
        active: true,
        hint: null,
        suggestions: enumCompletions(match).map((v) => ({ value: `${neg}${prefix}${v}`, label: v })),
      };
    case "user":
      return {
        active: true,
        hint: usersQuery.isLoading ? "Searching users…" : null,
        suggestions: (usersQuery.data ?? []).map((u) => ({
          value: `${neg}${prefix}${u.name}`,
          label: u.name,
        })),
      };
    case "pool":
      return {
        active: true,
        hint: poolsQuery.isLoading ? "Searching pools…" : null,
        suggestions: (poolsQuery.data ?? []).map((p) => ({
          value: `${neg}${prefix}${p.name}`,
          label: p.name.replace(/_/g, " "),
          detail: `${p.post_count}`,
        })),
      };
  }
}
