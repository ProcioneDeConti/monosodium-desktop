import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

export function useWikiPageQuery(site: Site, title: string, enabled = true) {
  return useQuery({
    queryKey: ["wikiPage", site, title],
    queryFn: () => e621Api.getWikiPage(site, title),
    enabled: enabled && title.trim().length > 0,
    staleTime: 10 * 60_000,
  });
}

export function useTagInfoQuery(site: Site, name: string) {
  return useQuery({
    queryKey: ["tagInfo", site, name],
    queryFn: () => e621Api.getTag(site, name),
    enabled: name.trim().length > 0,
    staleTime: 10 * 60_000,
  });
}

export function useTagRelationsQuery(site: Site, name: string) {
  return useQuery({
    queryKey: ["tagRelations", site, name],
    queryFn: () => e621Api.getTagRelations(site, name),
    enabled: name.trim().length > 0,
    staleTime: 10 * 60_000,
  });
}
