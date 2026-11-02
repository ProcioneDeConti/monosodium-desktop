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
import { useAccountStore } from "../state/accountStore";

/** e621 allows up to 320; 100 halves the round trips per scroll (and per blacklist hop) under
 *  the ~1 req/sec budget while keeping each response small enough to land quickly. */
const PAGE_LIMIT = 100;
/** Bounds how many raw pages a single logical page will chase when the blacklist is very broad,
 *  so a pathological blacklist can't turn one loadMore into an unbounded request storm. */
const MAX_HOPS = 20;
/** e621 rejects `page=N` past this. */
const MAX_NUMBERED_PAGE = 750;

export type PaginationMode = "keyset" | "numbered" | "favorites";

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
export function paginationMode(tags: string): PaginationMode {
  const order = orderValue(tags);
  return !order || order === "id" || order === "id_desc" ? "keyset" : "numbered";
}

/** When `tags` is just the signed-in user's own favorites (`fav:me` / `fav:<name>`), optionally
 *  plus the Settings rating filter App.tsx appends, returns the ratings to keep client-side
 *  (null = all). Otherwise undefined. Such a view is fetched from favorites.json so it's ordered
 *  by when each post was favorited, like e621's own Favorites page, rather than by post id. */
export function ownFavoritesRatings(
  tags: string,
  username: string | null | undefined,
): string[] | null | undefined {
  const name = username?.toLowerCase();
  if (!name) return undefined;
  let sawFav = false;
  const ratings: string[] = [];
  for (const t of tags.toLowerCase().trim().split(/\s+/).filter(Boolean)) {
    const fav = t.match(/^fav:(.+)$/);
    if (fav && (fav[1] === "me" || fav[1] === name) && !sawFav) {
      sawFav = true;
      continue;
    }
    const r = t.match(/^~?rating:([sqe])/);
    if (r) {
      ratings.push(r[1]);
      continue;
    }
    return undefined;
  }
  if (!sawFav) return undefined;
  return ratings.length ? ratings : null;
}

function isRandomOrder(tags: string): boolean {
  return orderValue(tags) === "random";
}

export async function fetchLogicalPage(
  site: Site,
  tags: string,
  pageParam: string | undefined,
  blacklistEntries: BlacklistEntries,
  mode: PaginationMode,
  favRatings: string[] | null = null,
): Promise<PostsPage> {
  const accumulated: Post[] = [];
  // The value handed to the API: `b<id>` (keyset) or `"2"`, `"3"`, … (numbered).
  let apiPage = pageParam;
  let pageNum = mode !== "keyset" ? Number(pageParam ?? "1") : 0;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const resp =
      mode === "favorites"
        ? await e621Api.getFavorites(site, PAGE_LIMIT, apiPage)
        : await e621Api.getPosts(site, tags, PAGE_LIMIT, apiPage);
    const fetched = resp.posts;
    // favorites.json takes no tags, so the rating filter is applied here instead.
    const raw = favRatings ? fetched.filter((p) => favRatings.includes(p.rating)) : fetched;
    if (fetched.length === 0) {
      return { posts: accumulated, nextCursor: null };
    }
    accumulated.push(...raw);

    let nextCursor: string | null;
    if (mode === "keyset") {
      nextCursor = `b${raw[raw.length - 1].id}`;
    } else {
      pageNum += 1;
      nextCursor =
        fetched.length === PAGE_LIMIT && pageNum <= MAX_NUMBERED_PAGE ? String(pageNum) : null;
    }
    apiPage = nextCursor ?? undefined;

    const anyVisible =
      (raw.length > 0 && blacklistEntries.length === 0) || raw.some((p) => !isBlacklisted(blacklistEntries, p));
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
  const queryClient = useQueryClient();

  const username = useAccountStore((s) => s.accounts[site]?.username);
  const favRatings = ownFavoritesRatings(tags, username);
  const mode: PaginationMode = favRatings !== undefined ? "favorites" : paginationMode(tags);
  // `order:random` re-rolls server-side on every request, so caching it as "fresh" would make
  // navigating back to the search (or a remount) show a stale, no-longer-random-feeling set.
  const isRandom = isRandomOrder(tags);

  // Mode in the key so signing in/out on a fav: view doesn't reuse pages from the other source.
  const queryKey = [...postsQueryKey(site, tags, blacklistSignature), mode] as const;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchLogicalPage(site, tags, pageParam, blacklistEntries, mode, favRatings ?? null),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    // Never auto-revalidate a non-random list: refetching an infinite query re-fetches *every*
    // loaded page in sequence, and since new uploads (keyset) or shifting scores (numbered) move
    // posts across page boundaries, the already-rendered grid reshuffles mid-scroll - posts
    // "jump around" and scroll position drifts. The Refresh button (`refresh()` below) is the
    // explicit way to get new results.
    staleTime: isRandom ? 0 : Infinity,
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
