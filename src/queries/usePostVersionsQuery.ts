import { useInfiniteQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

const LIMIT = 40;

/** A post's edit history, newest first (numbered pages). Only fetched when the History tab is
 *  actually opened. */
export function usePostVersionsQuery(site: Site, postId: number, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["postVersions", site, postId],
    queryFn: async ({ pageParam }) => {
      const versions = await e621Api.getPostVersions(site, postId, String(pageParam));
      return { versions, nextPage: versions.length === LIMIT ? pageParam + 1 : null };
    },
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    enabled,
    staleTime: 60_000,
  });
}
