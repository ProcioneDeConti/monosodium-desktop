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

function postTagSet(post: Post): Set<string> {
  const tags = new Set(allTags(post).map((t) => t.toLowerCase()));
  const ratingTag = RATING_TAG[post.rating as Rating];
  if (ratingTag) tags.add(ratingTag);
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
