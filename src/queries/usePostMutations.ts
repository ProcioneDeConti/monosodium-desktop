import { mascotReact, useMascotStore } from "../state/mascotStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import { useStatsStore } from "../state/statsStore";
import { updatePostInCache } from "./postCache";

/** Vote/favorite/unfavorite against the signed-in account, patching the shared post cache
 *  on success so every view showing that post (grid, viewer) updates instantly. */
export function usePostMutations(site: Site) {
  const queryClient = useQueryClient();

  const vote = useMutation({
    mutationFn: ({ postId, direction }: { postId: number; direction: 1 | -1 }) =>
      e621Api.vote(site, postId, direction),
    onSuccess: (res, { postId, direction }) => {
      updatePostInCache(queryClient, postId, (p) => ({
        ...p,
        score: { up: res.up, down: res.down, total: res.score },
        vote_by: res.our_score,
      }));
      useStatsStore.getState().recordVote(direction);
      // A repeat click un-votes (our_score 0) - no reaction for that. Upvoting something the
      // crowd scored negative is a bold choice.
      if (res.our_score !== 0) {
        mascotReact(direction === 1 ? (res.score < 0 ? "boldChoice" : "upvote") : "downvote");
      }
    },
  });

  const favorite = useMutation({
    mutationFn: (postId: number) => e621Api.favorite(site, postId),
    onSuccess: (res, postId) => {
      let score = 0;
      updatePostInCache(queryClient, postId, (p) => {
        score = p.score.total;
        return { ...p, is_favorited: true, fav_count: res.favorite_count };
      });
      useStatsStore.getState().recordFavorite(true);
      useMascotStore.getState().favorited(score, res.favorite_count);
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
      mascotReact("unfavorite");
      useStatsStore.getState().recordFavorite(false);
    },
  });

  const report = useMutation({
    mutationFn: ({ postId, reason }: { postId: number; reason: string }) =>
      e621Api.reportPost(site, postId, reason),
  });

  return { vote, favorite, unfavorite, report };
}
