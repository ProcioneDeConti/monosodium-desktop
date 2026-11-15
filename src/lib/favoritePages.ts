// Shared keyset-paged post fetch, used by the Dashboard's favourites analysis and the "For you"
// taste-profile builder. Pages go one at a time through the normal rate-limited API path
// (`e621Api.getPosts` -> src-tauri's `request()` -> the per-site governor), so a long run can
// never exceed e621's limit. Each page is handed to `onPage` and then dropped - callers fold it
// into a streaming accumulator so memory stays bounded.

import { e621Api } from "../api/client";
import type { Post } from "../models/post";
import type { Site } from "../models/site";

export const FAV_PAGE_LIMIT = 320;

export interface FetchPostPagesOptions {
  site: Site;
  tags: string;
  /** Max posts to hand to `onPage` in total; "all" walks until a short page. */
  want: number | "all";
  /** Receives each page, already trimmed so the running total never exceeds `want`. */
  onPage: (posts: Post[]) => void;
  /** Checked before every request; true stops the walk (not an error). */
  shouldStop?: () => boolean;
  /** Called after every page's `onPage`, false = the caller went away; stop silently. */
  alive?: () => boolean;
  pageLimit?: number;
}

/** Walk `tags` newest-first with `b<id>` cursors. Resolves with the number of posts delivered.
 *  Rejects only on a request failure. */
export async function fetchPostPages(opts: FetchPostPagesOptions): Promise<number> {
  const limit = opts.pageLimit ?? FAV_PAGE_LIMIT;
  let total = 0;
  let cursor: string | undefined;
  while (!opts.shouldStop?.()) {
    const resp = await e621Api.getPosts(opts.site, opts.tags, limit, cursor);
    if (opts.alive && !opts.alive()) return total;
    const room = opts.want === "all" ? resp.posts.length : Math.max(0, opts.want - total);
    const slice = resp.posts.slice(0, room);
    total += slice.length;
    opts.onPage(slice);
    if (resp.posts.length < limit) break;
    if (opts.want !== "all" && total >= opts.want) break;
    cursor = `b${resp.posts[resp.posts.length - 1].id}`;
  }
  return total;
}

/** e621's numbered-page ceiling. */
const MAX_NUMBERED_PAGE = 750;

/** Walk a user's favourites in *favourite* order (newest favourite first) via favorites.json's
 *  numbered pages - unlike `fetchPostPages`, whose `fav:` search comes back in post-id order. Used
 *  by the year-in-review "faved this year" scope (lib/yearInReview.ts). Resolves with the number
 *  of posts delivered. */
export async function fetchFavoritesInFavOrder(opts: {
  site: Site;
  userId: number;
  onPage: (posts: Post[]) => void;
  shouldStop?: () => boolean;
  alive?: () => boolean;
  pageLimit?: number;
}): Promise<number> {
  const limit = opts.pageLimit ?? FAV_PAGE_LIMIT;
  let total = 0;
  for (let page = 1; page <= MAX_NUMBERED_PAGE && !opts.shouldStop?.(); page++) {
    const resp = await e621Api.getFavorites(opts.site, limit, String(page), opts.userId);
    if (opts.alive && !opts.alive()) return total;
    total += resp.posts.length;
    opts.onPage(resp.posts);
    if (resp.posts.length < limit) break;
  }
  return total;
}
