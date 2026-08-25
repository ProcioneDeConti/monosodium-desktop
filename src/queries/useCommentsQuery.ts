// A post's comment thread - unlike usePostsQuery this is a single unpaginated fetch (matching the
// reference Android app's PostActionsRepository.fetchComments: posts rarely have enough comments
// to need cursor pagination, and e621's search[post_id] filter returns the whole thread at once).

import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

export function commentsQueryKey(site: Site, postId: number) {
  return ["comments", site, postId] as const;
}

export function useCommentsQuery(site: Site, postId: number, enabled: boolean) {
  return useQuery({
    queryKey: commentsQueryKey(site, postId),
    // is_hidden comments are moderator-only - dropped client-side, same as the reference app.
    queryFn: async () => (await e621Api.getComments(site, postId)).filter((c) => !c.is_hidden),
    enabled,
    staleTime: 60_000,
  });
}
