// Keyset ("cursor") pagination against posts.json, mirroring the reference Android app's
// CursorPager (page=b<id> before-cursor) plus its blacklist-aware accumulation: a raw page that's
// *entirely* blacklisted must not surface as "end reached" - the fetch transparently continues to
// the next raw page until it finds at least one visible post (or genuinely runs out). All raw
// posts (blacklisted included) stay in the returned page, though, so the grid's blacklist
// disable/re-enable toggle can show them again instantly, with a caution-stripe marker, without
// needing to refetch anything.

import { useInfiniteQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Post } from "../models/post";
import type { Site } from "../models/site";
import { isBlacklisted, type BlacklistEntries } from "../lib/blacklist";

const PAGE_LIMIT = 50;
/** Bounds how many raw pages a single logical page will chase when the blacklist is very broad,
 *  so a pathological blacklist can't turn one loadMore into an unbounded request storm. */
const MAX_HOPS = 20;

export interface PostsPage {
  posts: Post[];
  nextCursor: string | null;
}

async function fetchLogicalPage(
  site: Site,
  tags: string,
  cursor: string | undefined,
  blacklistEntries: BlacklistEntries,
): Promise<PostsPage> {
  let localCursor = cursor;
  const accumulated: Post[] = [];
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const resp = await e621Api.getPosts(site, tags, PAGE_LIMIT, localCursor);
    const raw = resp.posts;
    if (raw.length === 0) {
      return { posts: accumulated, nextCursor: null };
    }
    accumulated.push(...raw);
    localCursor = `b${raw[raw.length - 1].id}`;
    const anyVisible =
      blacklistEntries.length === 0 || raw.some((p) => !isBlacklisted(blacklistEntries, p));
    if (anyVisible) {
      return { posts: accumulated, nextCursor: localCursor };
    }
  }
  return { posts: accumulated, nextCursor: localCursor ?? null };
}

export function postsQueryKey(site: Site, tags: string, blacklistSignature: string) {
  return ["posts", site, tags, blacklistSignature] as const;
}

export function usePostsQuery(
  site: Site,
  tags: string,
  blacklistEntries: BlacklistEntries,
  enabled: boolean,
) {
  // The blacklist's own content only affects which pages get auto-skipped during fetch, not the
  // request itself - included in the key so editing it (Settings) starts a fresh, correctly
  // re-filtered pagination sequence instead of mixing pages fetched under the old blacklist.
  const blacklistSignature = blacklistEntries.map((e) => e.join(" ")).join("\n");

  return useInfiniteQuery({
    queryKey: postsQueryKey(site, tags, blacklistSignature),
    queryFn: ({ pageParam }) => fetchLogicalPage(site, tags, pageParam, blacklistEntries),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 60_000,
  });
}
