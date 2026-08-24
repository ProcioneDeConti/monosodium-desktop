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
