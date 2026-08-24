/** Mirrors the reference Android app's data/model/SavedSearch.kt - e621 has no server-side saved
 *  search feature, so this is deliberately local-only (see state/savedSearchesStore.ts). */
export interface SavedSearch {
  id: string;
  label: string;
  query: string;
  createdAt: number;
}
