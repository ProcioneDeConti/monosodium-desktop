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
