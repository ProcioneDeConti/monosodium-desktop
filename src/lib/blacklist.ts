// Ports UserSettings.isBlacklisted / matchingBlacklistTags from the reference Android app
// (data/settings/UserSettings.kt): one blacklist entry per line, space-separated tags AND'd
// within a line, lines OR'd together, `rating:*` treated as a pseudo-tag alongside the post's
// real tags so a line like "rating:explicit" matches purely on rating.

import { allTags, RATING_TAG, type Post, type Rating } from "../models/post";

export type BlacklistEntries = string[][];

export function parseBlacklist(blacklist: string): BlacklistEntries {
  return blacklist
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/));
}

// A post's lowercased tag set is rebuilt for every blacklist check, and `visiblePosts` /
// `matchingBlacklistTags` run that check across the whole (potentially several-hundred-post)
// list on every grid render and every viewer navigation. Post objects are referentially stable
// while they're in the React Query cache, so memoising per-post here turns those passes from
// "re-tokenise every post every time" into a cheap set lookup. WeakMap => an entry is collected
// with its post, no manual eviction.
const tagSetCache = new WeakMap<Post, Set<string>>();

function postTagSet(post: Post): Set<string> {
  const cached = tagSetCache.get(post);
  if (cached) return cached;
  const tags = new Set<string>();
  for (const t of allTags(post)) tags.add(t.toLowerCase());
  const ratingTag = RATING_TAG[post.rating as Rating];
  if (ratingTag) tags.add(ratingTag);
  tagSetCache.set(post, tags);
  return tags;
}

function matchingEntries(entries: BlacklistEntries, post: Post): BlacklistEntries {
  if (entries.length === 0) return [];
  const postTags = postTagSet(post);
  return entries.filter((entry) => entry.every((tag) => postTags.has(tag)));
}

export function isBlacklisted(entries: BlacklistEntries, post: Post): boolean {
  return matchingEntries(entries, post).length > 0;
}

/** Lowercased tags responsible for `post` matching the blacklist - empty if it doesn't match. */
export function matchingBlacklistTags(entries: BlacklistEntries, post: Post): Set<string> {
  return new Set(matchingEntries(entries, post).flat());
}

export interface BlacklistLineTest {
  /** The line's tags, space-joined, as written. */
  line: string;
  tags: string[];
  matched: boolean;
  /** Tags on this line the post does NOT have - why the line didn't match (empty when it did). */
  missingTags: string[];
}

/** Per-line breakdown of how `post` fares against each blacklist line - powers Settings'
 *  blacklist tester. A post is hidden iff any line has `matched: true`. */
export function testBlacklist(entries: BlacklistEntries, post: Post): BlacklistLineTest[] {
  const postTags = postTagSet(post);
  return entries.map((tags) => {
    const missingTags = tags.filter((t) => !postTags.has(t));
    return { line: tags.join(" "), tags, matched: missingTags.length === 0, missingTags };
  });
}

/** The post list as actually displayed: unfiltered while the blacklist is disabled (posts get a
 *  caution-stripe instead), otherwise blacklisted posts removed entirely. Shared between PostGrid
 *  and the post viewer so both index into the exact same array. */
export function visiblePosts(posts: Post[], entries: BlacklistEntries, disabled: boolean): Post[] {
  if (disabled || entries.length === 0) return posts;
  return posts.filter((p) => !isBlacklisted(entries, p));
}
