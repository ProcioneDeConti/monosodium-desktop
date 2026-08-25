import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

/** `enabled` gates the fetch until the preview is actually opened - a [[wiki]] link is common
 *  enough in DText that fetching every one eagerly on render would be wasteful. Canonical wiki
 *  titles use underscores, same as tag names; the raw [[page]] text may have spaces. */
export function useWikiPageQuery(site: Site, page: string, enabled: boolean) {
  const title = page.trim().replace(/\s+/g, "_");
  return useQuery({
    queryKey: ["wikiPage", site, title],
    queryFn: () => e621Api.getWikiPage(site, title),
    enabled: enabled && title !== "",
    staleTime: 5 * 60_000,
  });
}
