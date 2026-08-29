export interface ArtistUrl {
  url: string;
  is_active: boolean;
}

export interface Artist {
  id: number;
  name: string;
  other_names: string[];
  group_name: string;
  is_active: boolean;
  is_locked: boolean;
  notes: string;
  created_at: string | null;
  linked_user_id: number | null;
  urls: ArtistUrl[];
}

export interface DnpEntry {
  id: number;
  details: string;
  is_active: boolean;
}

/** A short, recognisable label for an off-site link ("FurAffinity", "Twitter / X", …). */
export function urlSiteLabel(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
  const map: Record<string, string> = {
    "furaffinity.net": "FurAffinity",
    "twitter.com": "Twitter / X",
    "x.com": "Twitter / X",
    "patreon.com": "Patreon",
    "subscribestar.adult": "SubscribeStar",
    "deviantart.com": "DeviantArt",
    "artstation.com": "ArtStation",
    "pixiv.net": "Pixiv",
    "inkbunny.net": "Inkbunny",
    "newgrounds.com": "Newgrounds",
    "tumblr.com": "Tumblr",
    "instagram.com": "Instagram",
    "bsky.app": "Bluesky",
    "weasyl.com": "Weasyl",
    "sofurry.com": "SoFurry",
    "e621.net": "e621",
    "itaku.ee": "Itaku",
    "ko-fi.com": "Ko-fi",
    "gumroad.com": "Gumroad",
    "youtube.com": "YouTube",
    "picarto.tv": "Picarto",
    "hentai-foundry.com": "Hentai Foundry",
  };
  for (const [domain, label] of Object.entries(map)) {
    if (host === domain || host.endsWith(`.${domain}`)) return label;
  }
  return host;
}
