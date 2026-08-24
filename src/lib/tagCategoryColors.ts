// e621 tag category colors, matching the reference Android app's ui/theme/Color.kt where it
// defines them (artist/copyright/character/species/general) and e621's own site convention for
// the two it doesn't (lore/meta).
import type { TagCategory } from "../models/post";

export const TAG_CATEGORY_COLOR: Record<TagCategory, string> = {
  artist: "#D4AF37",
  copyright: "#8E44AD",
  character: "#CDDC39",
  species: "#E04B4B",
  general: "#9AA0A6",
  lore: "#2E8B57",
  meta: "#78909C",
};
