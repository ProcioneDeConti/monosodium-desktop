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

const FORUM_PAGE_LIMIT = 50;
const FORUM_SEARCH_LIMIT = 40;
const MAX_FORUM_PAGE = 750;

export interface ForumPostsPage {
  posts: ForumPost[];
  nextPage: number | null;
}

export function forumPostsQueryKey(site: Site, topicId: number) {
  return ["forumPosts", site, topicId] as const;
}

/** Oldest-first (see get_forum_posts) via numbered pages - keyset only works for the default
 *  newest-first order. */
export function useForumPostsQuery(site: Site, topicId: number) {
  return useInfiniteQuery({
    queryKey: forumPostsQueryKey(site, topicId),
    queryFn: async ({ pageParam }): Promise<ForumPostsPage> => {
      const posts = await e621Api.getForumPosts(site, topicId, String(pageParam));
      const nextPage =
        posts.length === FORUM_PAGE_LIMIT && pageParam < MAX_FORUM_PAGE ? pageParam + 1 : null;
      return { posts, nextPage };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    staleTime: 30_000,
  });
}

export interface ForumSearchPage {
  posts: ForumPost[];
  nextPage: number | null;
}

/** Full-text search over forum post bodies (newest-first, numbered pages). */
export function useForumSearchQuery(site: Site, query: string) {
  const trimmed = query.trim();
  return useInfiniteQuery({
    queryKey: ["forumSearch", site, trimmed],
    queryFn: async ({ pageParam }): Promise<ForumSearchPage> => {
      const posts = await e621Api.searchForumPosts(site, trimmed, String(pageParam));
      const nextPage =
        posts.length === FORUM_SEARCH_LIMIT && pageParam < MAX_FORUM_PAGE ? pageParam + 1 : null;
      return { posts, nextPage };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  });
}

/** Batch topic-title lookup for forum-search results (one request for the whole result set). */
export function useForumTopicTitles(site: Site, topicIds: number[]) {
  const key = [...new Set(topicIds)].sort((a, b) => a - b).join(",");
  return useQuery({
    queryKey: ["forumTopicTitles", site, key],
    queryFn: async () => {
      const topics = await e621Api.getForumTopics(site, null, key);
      return Object.fromEntries(topics.map((t) => [t.id, t.title])) as Record<number, string>;
    },
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
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
