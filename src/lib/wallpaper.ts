// Pure logic for desktop wallpaper mode: which posts can become a wallpaper, the search a rotation
// runs, and how the next one is picked. The Windows side is src-tauri/src/wallpaper.rs; the timer
// and fetching live in lib/wallpaperRotation.ts, the persisted choices in state/wallpaperStore.ts.

import { extensionOf, isDeleted, type Post, type Rating } from "../models/post";
import type { Site } from "../models/site";
import { isBlacklisted, type BlacklistEntries } from "./blacklist";

/** Windows' "Choose a fit" options (serde names in wallpaper.rs). */
export type WallpaperFit = "fill" | "fit" | "stretch" | "center" | "tile" | "span";

export const WALLPAPER_FITS: { value: WallpaperFit; label: string }[] = [
  { value: "fill", label: "Fill" },
  { value: "fit", label: "Fit" },
  { value: "stretch", label: "Stretch" },
  { value: "center", label: "Center" },
  { value: "tile", label: "Tile" },
  { value: "span", label: "Span (multi-monitor)" },
];

/** Where a rotation draws from. Saved-search and collection sources keep a label snapshot so the
 *  Settings select can still name them after the original is renamed or deleted. */
export type WallpaperSource =
  | { kind: "favorites"; site: Site; username: string }
  | { kind: "search"; site: Site; query: string; label: string }
  | { kind: "collection"; site: Site; collectionId: string; label: string };

export const ROTATION_INTERVALS_MIN: { value: number; label: string }[] = [
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 180, label: "Every 3 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once a day" },
];
export const DEFAULT_ROTATION_INTERVAL_MIN = 60;

/** How long to wait before retrying after a failed rotation (capped by the interval itself). */
export const ROTATION_RETRY_MIN = 10;

/** How many recently-used post ids a rotation avoids repeating. */
export const RECENT_LIMIT = 50;

const STILL_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

/** Images only (an animated GIF/WebP becomes its first frame); videos, Flash, and deleted posts
 *  without a file can't be wallpapers. */
export function isWallpaperable(post: Post): boolean {
  return !isDeleted(post) && !!post.file.url && STILL_EXTENSIONS.has(extensionOf(post));
}

/** The ratings a rotation may show: Safe only when asked for (the desktop is visible to anyone
 *  walking past) or when adult mode is off, otherwise the user's own enabled ratings. */
export function allowedRatings(
  safeOnly: boolean,
  adultModeEnabled: boolean,
  enabledRatings: Rating[],
): Rating[] {
  if (safeOnly || !adultModeEnabled) return ["s"];
  return enabledRatings.length > 0 ? enabledRatings : ["s", "q", "e"];
}

const RATING_TAGS: Record<Rating, string> = {
  s: "rating:safe",
  q: "rating:questionable",
  e: "rating:explicit",
};

/** Same OR-group convention as settingsStore.ratingTagFilter. */
export function ratingFilterFor(ratings: Rating[]): string | null {
  if (ratings.length === 0 || ratings.length >= 3) return null;
  if (ratings.length === 1) return RATING_TAGS[ratings[0]];
  return ratings.map((r) => `~${RATING_TAGS[r]}`).join(" ");
}

/** A search for wallpaper candidates: the source's own tags, minus any `order:` (replaced with
 *  random so each fetch is a fresh handful), minus video/Flash, plus the rating filter. */
export function rotationQuery(baseTags: string, ratingFilter: string | null): string {
  const tags = baseTags
    .split(/\s+/)
    .filter((t) => t && !/^order:/i.test(t));
  tags.push("-type:webm", "-type:mp4", "-type:swf", "order:random");
  if (ratingFilter) tags.push(ratingFilter);
  return tags.join(" ");
}

/** Base tags for a search/favourites source (collections fetch by id instead). */
export function sourceTags(source: WallpaperSource): string | null {
  if (source.kind === "favorites") return `fav:${source.username}`;
  if (source.kind === "search") return source.query;
  return null;
}

/** Up to `n` ids from a collection, preferring ones not recently used, in random order. */
export function collectionSample(
  postIds: number[],
  recentIds: number[],
  n = 100,
  rand: () => number = Math.random,
): number[] {
  const recent = new Set(recentIds);
  const fresh = shuffle(postIds.filter((id) => !recent.has(id)), rand);
  if (fresh.length >= n) return fresh.slice(0, n);
  const stale = shuffle(postIds.filter((id) => recent.has(id)), rand);
  return [...fresh, ...stale].slice(0, n);
}

export interface PickOptions {
  blacklist: BlacklistEntries;
  ratings: Rating[];
  recentIds: number[];
  currentId: number | null;
  rand?: () => number;
}

/** A random wallpaper-able, allowed, non-blacklisted post - one not shown recently if there is
 *  one, else anything but the current wallpaper, else (a one-image source) the current one. */
export function pickWallpaper(posts: Post[], opts: PickOptions): Post | null {
  const rand = opts.rand ?? Math.random;
  const ok = posts.filter(
    (p) =>
      isWallpaperable(p) &&
      opts.ratings.includes(p.rating as Rating) &&
      !isBlacklisted(opts.blacklist, p),
  );
  if (ok.length === 0) return null;
  const recent = new Set(opts.recentIds);
  const fresh = ok.filter((p) => !recent.has(p.id));
  const notCurrent = ok.filter((p) => p.id !== opts.currentId);
  const pool = fresh.length > 0 ? fresh : notCurrent.length > 0 ? notCurrent : ok;
  return pool[Math.floor(rand() * pool.length)];
}

export function pushRecent(recentIds: number[], id: number, limit = RECENT_LIMIT): number[] {
  return [id, ...recentIds.filter((r) => r !== id)].slice(0, limit);
}

/** Whether the next rotation is due. `retryAt` (after a failure) wins when it's earlier. */
export function isRotationDue(
  lastChangedAt: number,
  intervalMin: number,
  now: number,
  retryAt: number | null = null,
): boolean {
  if (retryAt != null && now >= retryAt) return true;
  if (retryAt != null) return false;
  return now - lastChangedAt >= intervalMin * 60_000;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
