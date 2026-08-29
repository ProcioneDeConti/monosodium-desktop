import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

/** A collection's posts, re-sorted to match the stored order - same approach as
 *  usePoolPostsQuery. Capped at e621's 320-per-request limit. */
export function useCollectionPostsQuery(site: Site, postIds: number[] | undefined) {
  const ids = (postIds ?? []).slice(0, 320);
  return useQuery({
    queryKey: ["collectionPosts", site, ids.join(",")],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const res = await e621Api.getPosts(site, `id:${ids.join(",")}`, ids.length);
      const order = new Map(ids.map((id, i) => [id, i]));
      return [...res.posts].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    },
    enabled: postIds != null,
    staleTime: 60_000,
  });
}
