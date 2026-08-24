import type { TagCategory } from "./post";

export interface UserProfile {
  id: number;
  name: string;
  level: number | null;
  created_at: string | null;
  blacklisted_tags: string | null;
  has_mail: boolean;
  unread_dmail_count: number;
  forum_notification_dot: boolean;
  avatar_id: number | null;
  favorite_count: number | null;
  wiki_page_version_count: number | null;
  artist_version_count: number | null;
  pool_version_count: number | null;
  forum_post_count: number | null;
  comment_count: number | null;
  flag_count: number | null;
  positive_feedback_count: number | null;
  neutral_feedback_count: number | null;
  negative_feedback_count: number | null;
  upload_slots: number | null;
  profile_about: string | null;
  profile_artinfo: string | null;
}

/** e621's `UserLevel::MAPPING` (app/logical/user_level.rb in the site's source) - unrecognized
 *  values fall back to the raw number. */
const USER_LEVEL_LABELS: Record<number, string> = {
  0: "Anonymous",
  10: "Blocked",
  20: "Member",
  30: "Privileged",
  40: "Former Staff",
  50: "Staff",
  60: "Janitor",
  70: "Moderator",
  80: "Admin",
};

export function userLevelLabel(level: number | null): string | null {
  if (level == null) return null;
  return USER_LEVEL_LABELS[level] ?? `Level ${level}`;
}

export interface TagSuggestion {
  name: string;
  post_count: number;
  category: number;
  antecedent_name: string | null;
}

const TAG_SUGGESTION_CATEGORY_MAP: Record<number, TagCategory> = {
  1: "artist",
  3: "copyright",
  4: "character",
  5: "species",
  7: "meta",
  8: "lore",
};

export function tagSuggestionCategory(suggestion: TagSuggestion): TagCategory {
  return TAG_SUGGESTION_CATEGORY_MAP[suggestion.category] ?? "general";
}

export interface VoteResponse {
  score: number;
  up: number;
  down: number;
  our_score: number;
}

export interface FavoriteResponse {
  post_id: number;
  favorite_count: number;
}
