/**
 * e621 and its sister site e6AI (e6ai.net, AI-generated content) run the same e621ng software
 * fork and expose the same relative JSON API paths - only the host and each site's separate
 * account/login differ. Must match `Site` in src-tauri/src/site.rs (serde snake_case).
 */
export type Site = "e621" | "e6ai";

export const SITE_DISPLAY_NAME: Record<Site, string> = {
  e621: "e621",
  e6ai: "e6AI",
};

export const SITE_WEB_BASE_URL: Record<Site, string> = {
  e621: "https://e621.net",
  e6ai: "https://e6ai.net",
};
