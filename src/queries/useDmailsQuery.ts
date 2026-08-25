// Keyset ("cursor") pagination against dmails.json, same b<id> convention as usePostsQuery.ts but
// without its blacklist-hop logic - a dmail inbox has nothing to filter.

import { useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Dmail } from "../models/dmail";
import type { Site } from "../models/site";

export interface DmailsPage {
  dmails: Dmail[];
  nextCursor: string | null;
}

export function dmailsQueryKey(site: Site) {
  return ["dmails", site] as const;
}

export function useDmailsQuery(site: Site, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: dmailsQueryKey(site),
    queryFn: async ({ pageParam }): Promise<DmailsPage> => {
      const dmails = await e621Api.getDmails(site, pageParam);
      return { dmails, nextCursor: dmails.length > 0 ? `b${dmails[dmails.length - 1].id}` : null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 30_000,
  });
}

interface InfiniteDmails {
  pages: DmailsPage[];
  pageParams: unknown[];
}

/** Patches a dmail's `is_read` flag across the cached inbox list, mirroring postCache.ts's
 *  updatePostInCache pattern - lets MessageDetail mark a row read instantly once its own fetch
 *  confirms e621 marked it read server-side, without the list panel needing to be mounted. */
export function markDmailReadInCache(queryClient: QueryClient, site: Site, id: number) {
  queryClient.setQueryData<InfiniteDmails>(dmailsQueryKey(site), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((p) => ({ ...p, dmails: p.dmails.map((d) => (d.id === id ? { ...d, is_read: true } : d)) })),
    };
  });
}

/** Also marks the dmail as read server-side, if it wasn't already - see get_dmail's doc comment. */
export function useDmailQuery(site: Site, id: number | null) {
  return useQuery({
    queryKey: ["dmail", site, id],
    queryFn: () => e621Api.getDmail(site, id!),
    enabled: id != null,
  });
}
