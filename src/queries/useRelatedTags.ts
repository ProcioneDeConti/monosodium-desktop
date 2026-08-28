import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

/** Tags related to `tag` (e621's `related_tag.json`). Only fetched once the caller opts in
 *  (`enabled`) - it's a heavier query than autocomplete and only wanted on demand. */
export function useRelatedTagsQuery(site: Site, tag: string, enabled: boolean) {
  return useQuery({
    queryKey: ["relatedTags", site, tag],
    queryFn: async () => {
      const raw = await e621Api.getRelatedTags(site, tag);
      // Drop the query tag itself and de-dupe, keeping the first occurrence's category.
      const seen = new Set<string>([tag.toLowerCase()]);
      return raw.filter((t) => {
        const key = t.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    enabled: enabled && tag.trim().length > 0,
    staleTime: 5 * 60_000,
  });
}
