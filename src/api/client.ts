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

export interface SiteCredentials {
  username: string;
  api_key: string;
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
};
