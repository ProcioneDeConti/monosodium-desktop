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
  /** e621ng's newer upload-standing fields. `level_string` is the human-readable privilege
   *  level ("Member", "Privileged", …); `upload_karma` drives the 0-10 "upload level" below. */
  level_string: string | null;
  base_upload_limit: number | null;
  upload_karma: number | null;
  upload_karma_free: boolean;
  post_upload_count: number | null;
  post_update_count: number | null;
  note_update_count: number | null;
  is_banned: boolean;
  can_approve_posts: boolean;
  can_upload_free: boolean;
  is_verified: boolean;
}

// --- Upload level (upload karma) ---
// e621ng derives a 0-10 "upload level" from `upload_karma` on a log scale between two config
// thresholds. These are e621ng's *defaults* (config/danbooru_default_config.rb:
// upload_karma_l1_threshold=100, upload_karma_l10_threshold=10_000, max level 10) - e621.net
// could override them, but the defaults check out against real top-uploader karma (~80-110k all
// land at level 10). Mirrors `User.level_from_karma` / `required_karma_for_level`.
const KARMA_L1 = 100;
const KARMA_L10 = 10_000;
const MAX_UPLOAD_LEVEL = 10;
const KARMA_SCALE = (MAX_UPLOAD_LEVEL - 1) / Math.log10(KARMA_L10 / KARMA_L1); // 4.5

export function uploadKarmaLevel(karma: number): number {
  if (karma < KARMA_L1) return 0;
  return Math.min(Math.floor(Math.log10(karma / KARMA_L1) * KARMA_SCALE) + 1, MAX_UPLOAD_LEVEL);
}

function karmaForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.ceil(KARMA_L1 * 10 ** ((level - 1) / KARMA_SCALE));
}

export interface UploadKarmaProgress {
  level: number;
  isMax: boolean;
  /** 0-100 toward the next level. */
  percent: number;
  /** Karma still needed for the next level (0 at max). */
  toNext: number;
  nextLevelAt: number;
}

export function uploadKarmaProgress(karma: number): UploadKarmaProgress {
  const level = uploadKarmaLevel(karma);
  if (level >= MAX_UPLOAD_LEVEL) {
    return { level, isMax: true, percent: 100, toNext: 0, nextLevelAt: karma };
  }
  const cur = karmaForLevel(level);
  const next = karmaForLevel(level + 1);
  const percent = next === cur ? 100 : ((karma - cur) / (next - cur)) * 100;
  return {
    level,
    isMax: false,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    toNext: Math.max(0, next - karma),
    nextLevelAt: next,
  };
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

/** Maps e621's numeric tag category to the app's TagCategory (defaulting to "general"). */
export function numericTagCategory(category: number): TagCategory {
  return TAG_SUGGESTION_CATEGORY_MAP[category] ?? "general";
}

export function tagSuggestionCategory(suggestion: TagSuggestion): TagCategory {
  return numericTagCategory(suggestion.category);
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
