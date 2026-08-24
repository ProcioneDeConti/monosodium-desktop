import { useMutation, useQueryClient } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import { updatePostInCache } from "./postCache";

/** Vote/favorite/unfavorite against the signed-in account, patching the shared post cache
 *  on success so every view showing that post (grid, viewer) updates instantly. */
export function usePostMutations(site: Site) {
  const queryClient = useQueryClient();

  const vote = useMutation({
    mutationFn: ({ postId, direction }: { postId: number; direction: 1 | -1 }) =>
      e621Api.vote(site, postId, direction),
    onSuccess: (res, { postId }) => {
      updatePostInCache(queryClient, postId, (p) => ({
        ...p,
        score: { up: res.up, down: res.down, total: res.score },
        vote_by: res.our_score,
      }));
    },
  });

  const favorite = useMutation({
    mutationFn: (postId: number) => e621Api.favorite(site, postId),
    onSuccess: (res, postId) => {
      updatePostInCache(queryClient, postId, (p) => ({
        ...p,
        is_favorited: true,
        fav_count: res.favorite_count,
      }));
    },
  });

  const unfavorite = useMutation({
    mutationFn: (postId: number) => e621Api.unfavorite(site, postId),
    onSuccess: (res, postId) => {
      updatePostInCache(queryClient, postId, (p) => ({
        ...p,
        is_favorited: false,
        fav_count: res.favorite_count,
      }));
    },
  });

  return { vote, favorite, unfavorite };
}
