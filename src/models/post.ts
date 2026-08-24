// Mirrors src-tauri/src/models.rs / the reference Android app's data/model/Post.kt - same e621
// JSON API, transcribed field-for-field. Derived helpers that were Kotlin data class members
// there are plain functions here (see bottom of file).

export interface PostFile {
  width: number;
  height: number;
  ext: string;
  size: number;
  md5: string | null;
  url: string | null;
}

export interface PostPreview {
  width: number;
  height: number;
  url: string | null;
}

export interface PostSample {
  has: boolean;
  width: number;
  height: number;
  url: string | null;
}

export interface PostScore {
  up: number;
  down: number;
  total: number;
}

export interface PostTags {
  general: string[];
  species: string[];
  character: string[];
  copyright: string[];
  artist: string[];
  invalid: string[];
  lore: string[];
  meta: string[];
}

export interface PostFlags {
  pending: boolean;
  flagged: boolean;
  note_locked: boolean;
  status_locked: boolean;
  rating_locked: boolean;
  deleted: boolean;
}

export interface Post {
  id: number;
  created_at: string | null;
  updated_at: string | null;
  file: PostFile;
  preview: PostPreview;
  sample: PostSample;
  score: PostScore;
  tags: PostTags;
  locked_tags: string[];
  rating: string;
  fav_count: number;
  sources: string[];
  pools: number[];
  description: string;
  comment_count: number;
  is_favorited: boolean;
  has_notes: boolean;
  duration: number | null;
  flags: PostFlags;
  /** The authenticated user's own vote: 1 up, -1 down, 0 none. Always 0 when not signed in. */
  vote_by: number;
  uploader_id: number | null;
  approver_id: number | null;
}

export interface PostsResponse {
  posts: Post[];
}

export type Rating = "s" | "q" | "e";

export const RATING_TAG: Record<Rating, string> = {
  s: "rating:safe",
  q: "rating:questionable",
  e: "rating:explicit",
};

export type TagCategory =
  | "artist"
  | "copyright"
  | "character"
  | "species"
  | "general"
  | "lore"
  | "meta";

export interface CategorizedTag {
  name: string;
  category: TagCategory;
}

const VIDEO_EXTENSIONS = new Set(["webm", "mp4"]);
const ANIMATED_IMAGE_EXTENSIONS = new Set(["gif", "apng"]);

export function extensionOf(post: Post): string {
  return post.file.ext.toLowerCase();
}

export function isVideo(post: Post): boolean {
  return VIDEO_EXTENSIONS.has(extensionOf(post));
}

export function isAnimated(post: Post): boolean {
  return ANIMATED_IMAGE_EXTENSIONS.has(extensionOf(post)) || isVideo(post);
}

export function isDeleted(post: Post): boolean {
  return post.flags.deleted;
}

/** Best URL for full playback/viewing; falls back to the sample when the original is null (deleted posts). */
export function playableUrl(post: Post): string | null {
  return post.file.url ?? post.sample.url;
}

/** Tags paired with their e621 category, for category-colored tag chips. */
export function categorizedTags(post: Post): CategorizedTag[] {
  const { tags } = post;
  return [
    ...tags.artist.map((name) => ({ name, category: "artist" as const })),
    ...tags.copyright.map((name) => ({ name, category: "copyright" as const })),
    ...tags.character.map((name) => ({ name, category: "character" as const })),
    ...tags.species.map((name) => ({ name, category: "species" as const })),
    ...tags.general.map((name) => ({ name, category: "general" as const })),
    ...tags.lore.map((name) => ({ name, category: "lore" as const })),
    ...tags.meta.map((name) => ({ name, category: "meta" as const })),
  ];
}

export function allTags(post: Post): string[] {
  return categorizedTags(post).map((t) => t.name);
}

export function downloadFileName(post: Post): string {
  return `e621_${post.id}.${extensionOf(post)}`;
}

export function mimeType(post: Post): string {
  switch (extensionOf(post)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
    case "apng":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webm":
      return "video/webm";
    case "mp4":
      return "video/mp4";
    default:
      return isVideo(post) ? "video/*" : "image/*";
  }
}
