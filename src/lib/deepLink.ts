// `monosodium://` deep links - how the browser extension (browser-extension/) hands e621/e6AI
// pages to the app. The link wraps the original page URL: `monosodium://open?url=<encoded URL>`,
// so the extension never has to know the app's routes; this module maps the e621 URL to an
// in-app destination. Anything unrecognised comes back as `null` (the caller opens it in the
// browser instead, so a click is never lost).

import type { Site } from "../models/site";

export type DeepLinkTarget =
  | { kind: "post"; site: Site; id: number }
  | { kind: "search"; site: Site; query: string }
  | { kind: "pool"; site: Site; id: number }
  | { kind: "user"; site: Site; id: number }
  | { kind: "wiki"; site: Site; tag: string }
  | { kind: "artist"; site: Site; tag: string }
  | { kind: "popular"; site: Site };

const SITE_BY_HOST: Record<string, Site> = {
  "e621.net": "e621",
  "e926.net": "e621",
  "e6ai.net": "e6ai",
};

/** The wrapped e621 URL out of a `monosodium://` link (also accepts a bare e621 URL). */
export function unwrapDeepLink(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol === "monosodium:") return u.searchParams.get("url");
    if (u.protocol === "https:" || u.protocol === "http:") return raw;
  } catch {
    /* not a URL */
  }
  return null;
}

/** Map an e621/e6AI page URL to an in-app destination, or null if it isn't one we handle. */
export function parseSiteUrl(raw: string): DeepLinkTarget | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const site = SITE_BY_HOST[u.hostname.replace(/^www\./, "")];
  if (!site) return null;
  let parts: string[];
  try {
    parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null; // malformed %-escape
  }
  const [section, arg] = parts;
  const num = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : null);

  switch (section) {
    case undefined:
      return { kind: "search", site, query: "" };
    case "posts": {
      const id = num(arg);
      if (id !== null) return { kind: "post", site, id };
      if (!arg) return { kind: "search", site, query: (u.searchParams.get("tags") ?? "").trim() };
      return null;
    }
    case "explore":
      return arg === "posts" && parts[2] === "popular" ? { kind: "popular", site } : null;
    case "pools": {
      const id = num(arg);
      return id !== null ? { kind: "pool", site, id } : null;
    }
    case "users": {
      const id = num(arg);
      return id !== null ? { kind: "user", site, id } : null;
    }
    case "favorites": {
      const name = u.searchParams.get("user_name");
      return name ? { kind: "search", site, query: `fav:${name}` } : null;
    }
    case "wiki_pages": {
      const tag = arg === "show_or_new" ? u.searchParams.get("title") : arg;
      return tag && num(tag) === null ? { kind: "wiki", site, tag } : null;
    }
    case "artists": {
      const tag = arg === "show_or_new" ? u.searchParams.get("name") : arg;
      return tag && num(tag) === null ? { kind: "artist", site, tag } : null;
    }
    default:
      return null;
  }
}
