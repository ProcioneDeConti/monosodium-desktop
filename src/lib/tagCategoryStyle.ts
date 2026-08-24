// Matches the reference Android app's TagChip exactly (ui/screens/detail/PostDetailScreen.kt):
// each category gets its own solid chip background with a text color chosen for contrast;
// general/lore/meta all share the same neutral translucent chip (the app doesn't visually
// distinguish them). Section header labels use the same color as their chips, except the
// neutral group which headers in plain white/foreground.
import type { TagCategory } from "../models/post";

export interface TagCategoryStyle {
  label: string;
  chipBg: string;
  chipFg: string;
  headerColor: string | null; // null = use the default foreground color
}

export const TAG_CATEGORY_STYLE: Record<TagCategory, TagCategoryStyle> = {
  artist: { label: "Artists", chipBg: "#D4AF37", chipFg: "#000000", headerColor: "#D4AF37" },
  copyright: { label: "Copyright", chipBg: "#8E44AD", chipFg: "#FFFFFF", headerColor: "#8E44AD" },
  character: { label: "Characters", chipBg: "#CDDC39", chipFg: "#000000", headerColor: "#CDDC39" },
  species: { label: "Species", chipBg: "#E04B4B", chipFg: "#FFFFFF", headerColor: "#E04B4B" },
  general: { label: "General", chipBg: "rgb(255 255 255 / 0.15)", chipFg: "#FFFFFF", headerColor: null },
  lore: { label: "Lore", chipBg: "rgb(255 255 255 / 0.15)", chipFg: "#FFFFFF", headerColor: null },
  meta: { label: "Meta", chipBg: "rgb(255 255 255 / 0.15)", chipFg: "#FFFFFF", headerColor: null },
};
