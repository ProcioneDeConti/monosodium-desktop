// Keyset ("cursor") pagination against forum_topics.json/forum_posts.json, same b<id> convention
// as usePostsQuery.ts/useDmailsQuery.ts. Forum browsing is public - no site credentials required,
// unlike dmails.

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { ForumPost, ForumTopic } from "../models/forum";
import type { Site } from "../models/site";

export interface ForumTopicsPage {
  topics: ForumTopic[];
  nextCursor: string | null;
}

export function forumTopicsQueryKey(site: Site) {
  return ["forumTopics", site] as const;
}

export function useForumTopicsQuery(site: Site) {
  return useInfiniteQuery({
    queryKey: forumTopicsQueryKey(site),
    queryFn: async ({ pageParam }): Promise<ForumTopicsPage> => {
      const topics = await e621Api.getForumTopics(site, pageParam);
      return { topics, nextCursor: topics.length > 0 ? `b${topics[topics.length - 1].id}` : null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

/** Also used to refresh a topic's title/is_locked once its id is known - see ForumTopicPanel. */
export function useForumTopicQuery(site: Site, topicId: number | null) {
  return useQuery({
    queryKey: ["forumTopic", site, topicId],
    queryFn: () => e621Api.getForumTopic(site, topicId!),
    enabled: topicId != null,
    staleTime: 30_000,
  });
}

export interface ForumPostsPage {
  posts: ForumPost[];
  nextCursor: string | null;
}

export function forumPostsQueryKey(site: Site, topicId: number) {
  return ["forumPosts", site, topicId] as const;
}

export function useForumPostsQuery(site: Site, topicId: number) {
  return useInfiniteQuery({
    queryKey: forumPostsQueryKey(site, topicId),
    queryFn: async ({ pageParam }): Promise<ForumPostsPage> => {
      const posts = await e621Api.getForumPosts(site, topicId, pageParam);
      return { posts, nextCursor: posts.length > 0 ? `b${posts[posts.length - 1].id}` : null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

/** Appends the newly created post to the last cached page, same "patch the cache directly"
 *  pattern as useCommentMutations.ts's `post` mutation. */
export function useForumReply(site: Site, topicId: number) {
  const queryClient = useQueryClient();
  const queryKey = forumPostsQueryKey(site, topicId);
  return useMutation({
    mutationFn: (body: string) => e621Api.createForumPost(site, topicId, body),
    onSuccess: (created) => {
      queryClient.setQueryData<{ pages: ForumPostsPage[]; pageParams: unknown[] }>(queryKey, (data) =>
        data && {
          ...data,
          pages: data.pages.map((p, i, arr) => (i === arr.length - 1 ? { ...p, posts: [...p.posts, created] } : p)),
        },
      );
    },
  });
}
