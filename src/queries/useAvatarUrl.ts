import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import { useUserProfileQuery } from "./useUserProfileQuery";

/** Profiles only carry an `avatar_id` (a post id) - resolve it to an image via the same
 *  rate-limited `get_posts` path everything else uses, rather than adding new backend surface.
 *  Extracted from ProfilePanel so CommentsPanel's per-commenter avatars share the same cache. */
export function useAvatarUrl(site: Site, avatarId: number | null) {
  return useQuery({
    queryKey: ["avatar", site, avatarId],
    queryFn: async () => {
      const res = await e621Api.getPosts(site, `id:${avatarId}`, 1);
      return res.posts[0]?.preview.url ?? null;
    },
    enabled: avatarId != null,
    staleTime: 5 * 60_000,
  });
}

/** Two-hop resolution for a comment's `creator_id`: profile lookup for `avatar_id`, then the
 *  same avatar-image lookup above. Both hops are cached/shared by query key (React Query
 *  dedupes identical in-flight/cached keys), so the same commenter appearing in multiple
 *  comments - or having already been viewed via ProfilePanel - costs at most one round trip
 *  each, not one per occurrence. */
export function useUserAvatarUrl(site: Site, userId: number | null) {
  const { data: profile } = useUserProfileQuery(site, userId ?? 0, userId != null);
  return useAvatarUrl(site, profile?.avatar_id ?? null);
}
