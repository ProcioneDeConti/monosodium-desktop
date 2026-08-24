// A committed search tag (SearchBar's chips) is just a string - unlike an autocomplete
// suggestion or a post's own tags, it doesn't carry its e621 category along with it. This is a
// best-effort, session-only cache of tag name -> category, populated opportunistically from data
// the app already fetches (autocomplete suggestions, loaded posts' own tags) so search chips can
// be colored the same way TagChip/the autocomplete dropdown already are, without firing extra
// lookups just to color a chip. A tag this session has never seen simply falls back to neutral
// styling - see SearchBar.tsx.
import type { TagCategory } from "../models/post";

const cache = new Map<string, TagCategory>();

export function cacheTagCategory(name: string, category: TagCategory): void {
  cache.set(name.toLowerCase(), category);
}

export function getCachedTagCategory(name: string): TagCategory | null {
  return cache.get(name.toLowerCase()) ?? null;
}
