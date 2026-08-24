// Thin typed wrappers around `invoke("...")` calls into the Rust backend (src-tauri/src/api.rs,
// credentials.rs). The frontend never calls the e621 API directly - see that module's doc
// comment for why (custom User-Agent + rate limiting + not leaking the API key to CDN hosts).

import { invoke } from "@tauri-apps/api/core";
import type { Site } from "../models/site";
import type { PostsResponse } from "../models/post";
import type { TagSuggestion, UserProfile, VoteResponse, FavoriteResponse } from "../models/user";

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
