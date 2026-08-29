// Patches a single post in place across every cached "posts" infinite query (the active search's
// grid, and later Favorites) after a vote/favorite mutation succeeds - mirrors the reference
// Android app's `onPostUpdated` callback (post objects are replaced wholesale via `.copy()`,
// never mutated), so the grid thumbnail and an open viewer both reflect the new score/favorite
// state instantly with no refetch.

import type { QueryClient } from "@tanstack/react-query";
import type { Post } from "../models/post";
import type { PostsPage } from "./usePostsQuery";

interface InfiniteData {
  pages: PostsPage[];
  pageParams: unknown[];
}

export function updatePostInCache(
  queryClient: QueryClient,
  postId: number,
  updater: (post: Post) => Post,
) {
  queryClient.setQueriesData<InfiniteData>({ queryKey: ["posts"] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        posts: page.posts.map((p) => (p.id === postId ? updater(p) : p)),
      })),
    };
  });
}

/** Drops posts from every cached "posts" infinite query - used after a bulk un-favorite on the
 *  favourites view so the cleaned-up posts vanish from the grid immediately instead of lingering
 *  with an empty heart until a refetch. (A background tab on an unrelated search would also lose
 *  them until it refetches; harmless - they still match that search.) */
export function removePostsFromCache(queryClient: QueryClient, ids: Iterable<number>) {
  const drop = new Set(ids);
  if (drop.size === 0) return;
  queryClient.setQueriesData<InfiniteData>({ queryKey: ["posts"] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        posts: page.posts.filter((p) => !drop.has(p.id)),
      })),
    };
  });
}
