// Patches a single post in place everywhere it's on screen - every cached query that holds it
// (search grids, Favorites, Popular, pools, sets, collections) and any out-of-cache list that
// subscribes (For you) - after a vote/favorite mutation succeeds - mirrors the reference
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

type PostUpdater = (post: Post) => Post;

function isPost(x: unknown): x is Post {
  return !!x && typeof x === "object" && typeof (x as Post).id === "number" && "tags" in x && "file" in x;
}

function patchList(list: unknown[], postId: number, updater: PostUpdater): unknown[] | null {
  let hit = false;
  const out = list.map((p) => {
    if (isPost(p) && p.id === postId) {
      hit = true;
      return updater(p);
    }
    return p;
  });
  return hit ? out : null;
}

/** Patch the post inside one query's data, whatever its shape: a plain `Post[]` (Popular, pool,
 *  set and collection posts), an infinite query of `{ posts }` pages (search grids, favourites),
 *  or a single `{ posts }` page. Returns null when this query doesn't contain the post. */
function patchData(data: unknown, postId: number, updater: PostUpdater): unknown | null {
  if (Array.isArray(data)) return patchList(data, postId, updater);
  if (!data || typeof data !== "object") return null;
  const d = data as { pages?: unknown[]; posts?: unknown[] };
  if (Array.isArray(d.pages)) {
    let hit = false;
    const pages = d.pages.map((page) => {
      const pg = page as { posts?: unknown[] };
      if (!Array.isArray(pg?.posts)) return page;
      const posts = patchList(pg.posts, postId, updater);
      if (!posts) return page;
      hit = true;
      return { ...pg, posts };
    });
    return hit ? { ...d, pages } : null;
  }
  if (Array.isArray(d.posts)) {
    const posts = patchList(d.posts, postId, updater);
    return posts ? { ...d, posts } : null;
  }
  return null;
}

const listeners = new Set<(postId: number, updater: PostUpdater) => void>();

/** For post lists that live outside the query cache (e.g. "For you", built in useForYou's own
 *  state): called with every vote/favorite patch. Returns the unsubscribe. */
export function subscribePostUpdates(fn: (postId: number, updater: PostUpdater) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Patch a post everywhere it's shown: every cached query holding it (any list shape - see
 *  patchData) plus any subscribed out-of-cache list. */
export function updatePostInCache(queryClient: QueryClient, postId: number, updater: PostUpdater) {
  for (const query of queryClient.getQueryCache().getAll()) {
    const next = patchData(query.state.data, postId, updater);
    if (next) queryClient.setQueryData(query.queryKey, next);
  }
  for (const fn of listeners) fn(postId, updater);
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
