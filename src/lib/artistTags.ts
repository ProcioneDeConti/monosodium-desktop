// e621 files a handful of non-artist tags under its "artist" category (category 1): DNP flags,
// content warnings, and edit/attribution markers. They show up in `post.tags.artist` alongside
// real artist names, so anything that wants to *name the artist* has to strip them first.

const NON_ARTIST_ARTIST_TAGS = new Set([
  "avoid_posting",
  "conditional_dnp",
  "sound_warning",
  "epilepsy_warning",
  "unknown_artist",
  "unknown_artist_signature",
  "anonymous_artist",
  "third-party_edit",
  "sound_edit",
]);

export function isRealArtistTag(tag: string): boolean {
  return !NON_ARTIST_ARTIST_TAGS.has(tag.toLowerCase());
}

/** The post's real artist tag names (its `artist` category minus e621's non-artist entries). */
export function artistNames(post: { tags: { artist: string[] } }): string[] {
  return post.tags.artist.filter(isRealArtistTag);
}

/** Display string for a post's artist(s): underscores to spaces, comma-joined. `null` when the
 *  post has no real artist tag (e.g. only `unknown_artist`). */
export function formatArtists(post: { tags: { artist: string[] } }): string | null {
  const names = artistNames(post).map((t) => t.replace(/_/g, " "));
  return names.length > 0 ? names.join(", ") : null;
}
