import { categorizedTags, type Post, type TagCategory } from "../../models/post";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { TagChip } from "./TagChip";

interface TagsPanelProps {
  post: Post;
  highlightedTags: Set<string>;
  onSearchTag: (tag: string) => void;
  onAddTagToSearch: (tag: string) => void;
  onExcludeTag: (tag: string) => void;
  onBlacklistTag: (tag: string) => void;
  onFindRelated: (tag: string) => void;
  onOpenArtist: (tag: string) => void;
  onOpenWiki: (tag: string) => void;
}

const CATEGORY_ORDER: TagCategory[] = [
  "artist",
  "copyright",
  "character",
  "species",
  "general",
  "lore",
  "meta",
];

export function TagsPanel({
  post,
  highlightedTags,
  onSearchTag,
  onAddTagToSearch,
  onExcludeTag,
  onBlacklistTag,
  onFindRelated,
  onOpenArtist,
  onOpenWiki,
}: TagsPanelProps) {
  const grouped = categorizedTags(post);
  if (grouped.length === 0) {
    return <p className="text-sm opacity-60">No tags.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {CATEGORY_ORDER.map((category) => {
        const tags = grouped.filter((t) => t.category === category);
        if (tags.length === 0) return null;
        const style = TAG_CATEGORY_STYLE[category];
        return (
          <div key={category}>
            <h3
              className="mb-1.5 text-xs font-bold"
              style={{ color: style.headerColor ?? undefined }}
            >
              {style.label} · {tags.length}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(({ name }) => (
                <TagChip
                  key={name}
                  name={name}
                  category={category}
                  isBlacklistMatch={highlightedTags.has(name.toLowerCase())}
                  onSearch={onSearchTag}
                  onAddToSearch={onAddTagToSearch}
                  onExcludeFromSearch={onExcludeTag}
                  onAddToBlacklist={onBlacklistTag}
                  onFindRelated={onFindRelated}
                  onOpenArtist={onOpenArtist}
                  onOpenWiki={onOpenWiki}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
