// Thin typed wrappers around `invoke("...")` calls into the Rust backend (src-tauri/src/api.rs,
// credentials.rs). The frontend never calls the e621 API directly - see that module's doc
// comment for why (custom User-Agent + rate limiting + not leaking the API key to CDN hosts).

import { invoke } from "@tauri-apps/api/core";
import type { Site } from "../models/site";
import type { PostsResponse } from "../models/post";
import type { TagSuggestion, UserProfile, VoteResponse, FavoriteResponse } from "../models/user";
import type { Comment } from "../models/comment";
import type { Dmail } from "../models/dmail";
import type { CacheInfo } from "../models/cache";
import type { UpdateCheckResult } from "../models/update";
import type { ForumPost, ForumTopic } from "../models/forum";
import type { Pool } from "../models/pool";
import type { PostSet } from "../models/postSet";
import type { PostNote } from "../models/note";
import type { WikiPage } from "../models/wiki";
import type { SauceResult } from "../models/saucenao";

export interface SiteCredentials {
  username: string;
  api_key: string;
}

export interface VaultStatus {
  password_protected: boolean;
  locked: boolean;
}

export const e621Api = {
  getPosts(site: Site, tags: string, limit: number, page?: string): Promise<PostsResponse> {
    return invoke("get_posts", { site, tags: tags || null, limit, page: page ?? null });
  },

  autocompleteTags(site: Site, name: string): Promise<TagSuggestion[]> {
    return invoke("autocomplete_tags", { site, name });
  },

  getCurrentUser(site: Site): Promise<UserProfile> {
    return invoke("get_current_user", { site });
  },

  getUser(site: Site, id: number): Promise<UserProfile> {
    return invoke("get_user", { site, id });
  },

  updateBlacklist(site: Site, userId: number, blacklistedTags: string): Promise<void> {
    return invoke("update_blacklist", { site, userId, blacklistedTags });
  },

  vote(site: Site, postId: number, direction: 1 | -1): Promise<VoteResponse> {
    return invoke("vote", { site, postId, direction });
  },

  favorite(site: Site, postId: number): Promise<FavoriteResponse> {
    return invoke("favorite", { site, postId });
  },

  unfavorite(site: Site, postId: number): Promise<FavoriteResponse> {
    return invoke("unfavorite", { site, postId });
  },

  reportPost(site: Site, postId: number, reason: string): Promise<void> {
    return invoke("report_post", { site, postId, reason });
  },

  getComments(site: Site, postId: number): Promise<Comment[]> {
    return invoke("get_comments", { site, postId });
  },

  createComment(site: Site, postId: number, body: string): Promise<Comment> {
    return invoke("create_comment", { site, postId, body });
  },

  updateComment(site: Site, commentId: number, body: string): Promise<Comment> {
    return invoke("update_comment", { site, commentId, body });
  },

  deleteComment(site: Site, commentId: number): Promise<void> {
    return invoke("delete_comment", { site, commentId });
  },

  reportComment(site: Site, commentId: number, reason: string): Promise<void> {
    return invoke("report_comment", { site, commentId, reason });
  },

  voteComment(site: Site, commentId: number, direction: 1 | -1): Promise<VoteResponse> {
    return invoke("vote_comment", { site, commentId, direction });
  },

  getDmails(site: Site, page?: string): Promise<Dmail[]> {
    return invoke("get_dmails", { site, page: page ?? null });
  },

  getDmail(site: Site, id: number): Promise<Dmail> {
    return invoke("get_dmail", { site, id });
  },

  createDmail(
    site: Site,
    toName: string,
    title: string,
    body: string,
    respondToId?: number | null,
  ): Promise<Dmail> {
    return invoke("create_dmail", { site, toName, title, body, respondToId: respondToId ?? null });
  },

  getCacheInfo(): Promise<CacheInfo> {
    return invoke("get_cache_info");
  },

  /** Doesn't take effect until the next launch - see src-tauri/src/cache.rs's doc comment. */
  setCacheLimitMb(limitMb: number | null): Promise<void> {
    return invoke("set_cache_limit_mb", { limitMb });
  },

  /** Doesn't clear immediately - marks the cache for deletion at the next launch. */
  requestCacheClear(): Promise<void> {
    return invoke("request_cache_clear");
  },

  /** Writes an AES-256-GCM-encrypted (or, with a null/blank password, plain) backup envelope to
   *  `path` - see src-tauri/src/backup.rs's doc comment. `plaintext` is a JSON string assembled
   *  by lib/backup.ts's buildBackup(). */
  exportBackup(path: string, plaintext: string, password: string | null): Promise<void> {
    return invoke("export_backup", { path, plaintext, password });
  },

  isBackupEncrypted(path: string): Promise<boolean> {
    return invoke("is_backup_encrypted", { path });
  },

  /** Returns the decrypted backup's plaintext JSON string - parse it and pass through
   *  lib/backup.ts's isSettingsBackup/applyBackup. */
  importBackup(path: string, password: string | null): Promise<string> {
    return invoke("import_backup", { path, password });
  },

  getPool(site: Site, id: number): Promise<Pool> {
    return invoke("get_pool", { site, id });
  },

  /** e621's day/week/month "popular" ranking - `date` is any YYYY-MM-DD within the period. */
  getPopularPosts(
    site: Site,
    date: string,
    scale: "day" | "week" | "month",
  ): Promise<PostsResponse> {
    return invoke("get_popular_posts", { site, date, scale });
  },

  getPostNotes(site: Site, postId: number): Promise<PostNote[]> {
    return invoke("get_post_notes", { site, postId });
  },

  /** Pass `creatorId` (the signed-in account's own id) to list just your sets. */
  getPostSets(site: Site, creatorId?: number | null, name?: string | null): Promise<PostSet[]> {
    return invoke("get_post_sets", { site, creatorId: creatorId ?? null, name: name ?? null });
  },

  getPostSet(site: Site, id: number): Promise<PostSet> {
    return invoke("get_post_set", { site, id });
  },

  createPostSet(
    site: Site,
    name: string,
    shortname: string,
    description: string,
    isPublic: boolean,
  ): Promise<PostSet> {
    return invoke("create_post_set", { site, name, shortname, description, isPublic });
  },

  addPostsToSet(site: Site, setId: number, postIds: number[]): Promise<void> {
    return invoke("add_posts_to_set", { site, setId, postIds });
  },

  removePostsFromSet(site: Site, setId: number, postIds: number[]): Promise<void> {
    return invoke("remove_posts_from_set", { site, setId, postIds });
  },

  getWikiPage(site: Site, title: string): Promise<WikiPage | null> {
    return invoke("get_wiki_page", { site, title });
  },

  getForumTopics(site: Site, page?: string): Promise<ForumTopic[]> {
    return invoke("get_forum_topics", { site, page: page ?? null });
  },

  /** Used to check is_locked/is_sticky before allowing a reply. */
  getForumTopic(site: Site, id: number): Promise<ForumTopic> {
    return invoke("get_forum_topic", { site, id });
  },

  getForumPosts(site: Site, topicId: number, page?: string): Promise<ForumPost[]> {
    return invoke("get_forum_posts", { site, topicId, page: page ?? null });
  },

  createForumPost(site: Site, topicId: number, body: string): Promise<ForumPost> {
    return invoke("create_forum_post", { site, topicId, body });
  },

  /** Manual-only (Settings > Updates) - checks this app's own GitHub repo, wholly separate from
   *  the rate-limited e621 client (see src-tauri/src/update_check.rs's doc comment). */
  checkForUpdate(): Promise<UpdateCheckResult> {
    return invoke("check_for_update");
  },

  healthCheck(site: Site): Promise<void> {
    return invoke("health_check", { site });
  },

  /** Downloads a post's media to disk; resolves to the saved file's full path. */
  downloadPostFile(
    url: string,
    fileName: string,
    targetDir: string | null,
    isVideo: boolean,
  ): Promise<string> {
    return invoke("download_post_file", { url, fileName, targetDir, isVideo });
  },

  saveCredentials(site: Site, username: string, apiKey: string): Promise<void> {
    return invoke("save_credentials", { site, username, apiKey });
  },

  loadCredentials(site: Site): Promise<SiteCredentials | null> {
    return invoke("load_credentials", { site });
  },

  deleteCredentials(site: Site): Promise<void> {
    return invoke("delete_credentials", { site });
  },

  saveSaucenaoKey(apiKey: string): Promise<void> {
    return invoke("save_saucenao_key", { apiKey });
  },

  loadSaucenaoKey(): Promise<string | null> {
    return invoke("load_saucenao_key");
  },

  deleteSaucenaoKey(): Promise<void> {
    return invoke("delete_saucenao_key");
  },

  reverseImageSearch(apiKey: string | null, filePath: string): Promise<SauceResult[]> {
    return invoke("reverse_image_search", { apiKey, filePath });
  },

  /** Absolute path to the "data" folder next to the exe - see src-tauri/src/paths.rs. Used by
   *  settingsStore.ts/savedSearchesStore.ts to place their JSON files there instead of
   *  tauri-plugin-store's default AppData location. */
  getDataDir(): Promise<string> {
    return invoke("get_data_dir");
  },

  /** Settings > Encryption - see src-tauri/src/vault.rs. `locked` is only ever true right after
   *  launch, while password protection is on and `unlockVault` hasn't succeeded yet this
   *  session. */
  getVaultStatus(): Promise<VaultStatus> {
    return invoke("vault_status");
  },

  unlockVault(password: string): Promise<void> {
    return invoke("unlock_vault", { password });
  },

  enablePasswordEncryption(password: string): Promise<void> {
    return invoke("enable_password_encryption", { password });
  },

  disablePasswordEncryption(): Promise<void> {
    return invoke("disable_password_encryption");
  },

  /** The "forgot password" path - deletes settings/saved-searches/credentials and starts fresh,
   *  same as a first launch. There's no password recovery, so this is the only way forward. */
  resetVault(): Promise<void> {
    return invoke("reset_vault");
  },
};
