// Mirrors src-tauri/src/update_check.rs's UpdateCheckResult.

export interface UpdateCheckResult {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_url: string;
  /** Repo exists but has no published release yet - version/url fields are empty. */
  no_releases: boolean;
  rate_limit_remaining: number | null;
  rate_limit_limit: number | null;
}
