// Pagination against posts.json. e621's `page=b<id>` keyset ("before" cursor) is **only valid
// for the default id-descending order** - used with `order:score`, `order:favcount`, etc. it
// silently degrades to "id < N" and returns a near-random low-relevance slice (missing most of
// the real results, and overlapping earlier pages). So: keyset for the default order, e621's
// numbered `page=N` for every other `order:` (numbered pages honour the sort correctly, capped
// at e621's page-750 limit).
//
// Either way this keeps the reference Android app's blacklist-aware accumulation: a raw page
// that's *entirely* blacklisted must not surface as "end reached" - the fetch transparently
// continues to the next raw page until it finds a visible post (or runs out). All raw posts
// (blacklisted included) stay in the returned page so the grid's blacklist toggle can reveal
// them again instantly without a refetch.

import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Post } from "../models/post";
import type { Site } from "../models/site";
import { isBlacklisted, type BlacklistEntries } from "../lib/blacklist";

const PAGE_LIMIT = 50;
/** Bounds how many raw pages a single logical page will chase when the blacklist is very broad,
 *  so a pathological blacklist can't turn one loadMore into an unbounded request storm. */
const MAX_HOPS = 20;
/** e621 rejects `page=N` past this. */
const MAX_NUMBERED_PAGE = 750;

type PaginationMode = "keyset" | "numbered";

export interface PostsPage {
  posts: Post[];
  /** The `page` value for the next fetch (a `b<id>` cursor or a stringified page number), or
   *  null when there's nothing more. */
  nextCursor: string | null;
}

function orderValue(tags: string): string | null {
  const m = tags.toLowerCase().match(/(?:^|\s)-?order:(\S+)/);
  return m ? m[1] : null;
}

/** Keyset only for the default order; everything else must use numbered pages. */
function paginationMode(tags: string): PaginationMode {
  const order = orderValue(tags);
  return !order || order === "id" || order === "id_desc" ? "keyset" : "numbered";
}

function isRandomOrder(tags: string): boolean {
  return orderValue(tags) === "random";
}

async function fetchLogicalPage(
  site: Site,
  tags: string,
  pageParam: string | undefined,
  blacklistEntries: BlacklistEntries,
  mode: PaginationMode,
): Promise<PostsPage> {
  const accumulated: Post[] = [];
  // The value handed to the API: `b<id>` (keyset) or `"2"`, `"3"`, … (numbered).
  let apiPage = pageParam;
  let pageNum = mode === "numbered" ? Number(pageParam ?? "1") : 0;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const resp = await e621Api.getPosts(site, tags, PAGE_LIMIT, apiPage);
    const raw = resp.posts;
    if (raw.length === 0) {
      return { posts: accumulated, nextCursor: null };
    }
    accumulated.push(...raw);

    let nextCursor: string | null;
    if (mode === "keyset") {
      nextCursor = `b${raw[raw.length - 1].id}`;
    } else {
      pageNum += 1;
      nextCursor =
        raw.length === PAGE_LIMIT && pageNum <= MAX_NUMBERED_PAGE ? String(pageNum) : null;
    }
    apiPage = nextCursor ?? undefined;

    const anyVisible =
      blacklistEntries.length === 0 || raw.some((p) => !isBlacklisted(blacklistEntries, p));
    if (anyVisible || nextCursor === null) {
      return { posts: accumulated, nextCursor };
    }
  }
  return { posts: accumulated, nextCursor: apiPage ?? null };
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
  const queryKey = postsQueryKey(site, tags, blacklistSignature);
  const queryClient = useQueryClient();

  const mode = paginationMode(tags);
  // `order:random` re-rolls server-side on every request, so caching it as "fresh" would make
  // navigating back to the search (or a remount) show a stale, no-longer-random-feeling set.
  const isRandom = isRandomOrder(tags);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchLogicalPage(site, tags, pageParam, blacklistEntries, mode),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: isRandom ? 0 : 60_000,
    // Longer than the global 2-min default so switching between search tabs (App.tsx) serves the
    // other tab's already-paged results from cache instead of refetching from scratch.
    gcTime: 10 * 60_000,
  });

  // Mirrors the reference Android app's pull-to-refresh: discards every page beyond the first
  // before refetching, rather than re-validating everything that's already been paged in (which
  // is what a plain `refetch()` would do for an infinite query) - a manual "refresh" should feel
  // like starting the search over, not a silent re-check of a potentially long scroll history.
  function refresh() {
    queryClient.setQueryData(
      queryKey,
      (data: InfiniteData<PostsPage, string | undefined> | undefined) =>
        data && data.pages.length > 1
          ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
          : data,
    );
    return query.refetch();
  }

  return { ...query, refresh };
}
