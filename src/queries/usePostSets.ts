import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { PostSet } from "../models/postSet";
import type { Site } from "../models/site";

/** The signed-in account's own post sets. `creatorId` comes from the shared `users/me.json`
 *  query - null until that resolves, which keeps this disabled. */
export function useMyPostSetsQuery(site: Site, creatorId: number | null | undefined) {
  return useQuery({
    queryKey: ["postSets", site, creatorId],
    queryFn: () => e621Api.getPostSets(site, creatorId),
    enabled: creatorId != null,
    staleTime: 30_000,
  });
}

/** A set's posts, re-sorted to match `post_ids` - identical approach to usePoolPostsQuery
 *  (e621 has no "fetch these posts, in this order" endpoint). Capped at the 320-per-request limit. */
export function usePostSetPostsQuery(site: Site, set: PostSet | undefined) {
  return useQuery({
    queryKey: ["postSetPosts", site, set?.id, set?.post_ids.length],
    queryFn: async () => {
      const ids = set!.post_ids.slice(0, 320);
      if (ids.length === 0) return [];
      const res = await e621Api.getPosts(site, `id:${ids.join(",")}`, ids.length);
      const order = new Map(ids.map((id, i) => [id, i]));
      return [...res.posts].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    },
    enabled: !!set,
    staleTime: 30_000,
  });
}

export function usePostSetMutations(site: Site) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["postSets", site] });
    void qc.invalidateQueries({ queryKey: ["postSetPosts", site] });
  };

  const create = useMutation({
    mutationFn: (v: { name: string; shortname: string; description: string; isPublic: boolean }) =>
      e621Api.createPostSet(site, v.name, v.shortname, v.description, v.isPublic),
    onSuccess: invalidate,
  });

  const addPosts = useMutation({
    mutationFn: (v: { setId: number; postIds: number[] }) =>
      e621Api.addPostsToSet(site, v.setId, v.postIds),
    onSuccess: invalidate,
  });

  const removePosts = useMutation({
    mutationFn: (v: { setId: number; postIds: number[] }) =>
      e621Api.removePostsFromSet(site, v.setId, v.postIds),
    onSuccess: invalidate,
  });

  return { create, addPosts, removePosts };
}
