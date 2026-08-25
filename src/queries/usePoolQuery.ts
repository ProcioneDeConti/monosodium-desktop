import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Pool } from "../models/pool";
import type { Site } from "../models/site";

export function usePoolQuery(site: Site, poolId: number | null) {
  return useQuery({
    queryKey: ["pool", site, poolId],
    queryFn: () => e621Api.getPool(site, poolId!),
    enabled: poolId != null,
    staleTime: 60_000,
  });
}

/** A pool's posts, in the pool's own defined order. e621's API has no dedicated "fetch these
 *  posts, ordered" endpoint, so this fetches by `id:` search (whose own result order isn't a
 *  documented guarantee) and re-sorts client-side against `pool.post_ids`, which is authoritative.
 *  Capped at e621's own per-request limit (320) - a pool larger than that only shows its first
 *  320 posts, a known limitation rather than paginating a fixed, already-small list. */
export function usePoolPostsQuery(site: Site, pool: Pool | undefined) {
  return useQuery({
    queryKey: ["poolPosts", site, pool?.id],
    queryFn: async () => {
      const ids = pool!.post_ids.slice(0, 320);
      const res = await e621Api.getPosts(site, `id:${ids.join(",")}`, ids.length);
      const order = new Map(ids.map((id, i) => [id, i]));
      return [...res.posts].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    },
    enabled: !!pool && pool.post_ids.length > 0,
    staleTime: 60_000,
  });
}
