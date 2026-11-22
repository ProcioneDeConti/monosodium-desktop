/**
 * e621 and the AI-art boorus floofgens (floofgens.net) and blep (blep.art) all run the e621ng
 * software and expose the same relative JSON API paths - only the host and each site's separate
 * account/login differ. (They replaced e6AI, which shut down permanently in Nov 2026.) Must match
 * `Site` in src-tauri/src/site.rs (serde snake_case).
 */
export type Site = "e621" | "floofgens" | "blep";

/** Every site, in menu/display order. */
export const SITES: readonly Site[] = ["e621", "floofgens", "blep"];

/** The AI-art sites (everything but e621) - what used to be "e6AI" in mascot lines, stats, etc. */
export const AI_SITES: readonly Site[] = ["floofgens", "blep"];

export const SITE_DISPLAY_NAME: Record<Site, string> = {
  e621: "e621",
  floofgens: "floofgens",
  blep: "blep",
};

export const SITE_WEB_BASE_URL: Record<Site, string> = {
  e621: "https://e621.net",
  floofgens: "https://floofgens.net",
  blep: "https://blep.art",
};

/** Narrow an untrusted string (persisted settings, URL params, backups) to a live site. Anything
 *  else - notably `"e6ai"` saved before that site shut down - falls back to e621. */
export function toSite(value: unknown): Site {
  return SITES.includes(value as Site) ? (value as Site) : "e621";
}

export function isAiSite(site: Site): boolean {
  return AI_SITES.includes(site);
}
