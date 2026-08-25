import { useMutation, useQueryClient } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Comment } from "../models/comment";
import type { Site } from "../models/site";
import { commentsQueryKey } from "./useCommentsQuery";
import { updatePostInCache } from "./postCache";

/** Post/edit/delete/vote/report against the signed-in account, patching this post's comment-list
 *  cache directly (and, for a new comment, the shared post cache's comment_count) so the panel
 *  updates instantly without a refetch - same pattern as usePostMutations.ts. */
export function useCommentMutations(site: Site, postId: number) {
  const queryClient = useQueryClient();
  const queryKey = commentsQueryKey(site, postId);

  const post = useMutation({
    mutationFn: (body: string) => e621Api.createComment(site, postId, body),
    onSuccess: (comment) => {
      queryClient.setQueryData<Comment[]>(queryKey, (prev) => [...(prev ?? []), comment]);
      updatePostInCache(queryClient, postId, (p) => ({ ...p, comment_count: p.comment_count + 1 }));
    },
  });

  const update = useMutation({
    mutationFn: ({ commentId, body }: { commentId: number; body: string }) =>
      e621Api.updateComment(site, commentId, body),
    onSuccess: (comment) => {
      queryClient.setQueryData<Comment[]>(queryKey, (prev) =>
        prev?.map((c) => (c.id === comment.id ? comment : c)),
      );
    },
  });

  const remove = useMutation({
    mutationFn: (commentId: number) => e621Api.deleteComment(site, commentId),
    onSuccess: (_void, commentId) => {
      queryClient.setQueryData<Comment[]>(queryKey, (prev) => prev?.filter((c) => c.id !== commentId));
      updatePostInCache(queryClient, postId, (p) => ({
        ...p,
        comment_count: Math.max(0, p.comment_count - 1),
      }));
    },
  });

  const vote = useMutation({
    mutationFn: ({ commentId, direction }: { commentId: number; direction: 1 | -1 }) =>
      e621Api.voteComment(site, commentId, direction),
    onSuccess: (res, { commentId }) => {
      queryClient.setQueryData<Comment[]>(queryKey, (prev) =>
        prev?.map((c) => (c.id === commentId ? { ...c, score: res.score, vote_by: res.our_score } : c)),
      );
    },
  });

  const report = useMutation({
    mutationFn: ({ commentId, reason }: { commentId: number; reason: string }) =>
      e621Api.reportComment(site, commentId, reason),
  });

  return { post, update, remove, vote, report };
}

export type CommentMutations = ReturnType<typeof useCommentMutations>;
