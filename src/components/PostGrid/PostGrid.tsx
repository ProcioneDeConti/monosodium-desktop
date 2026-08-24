import { forwardRef, useMemo } from "react";
import { VirtuosoGrid, type GridComponents } from "react-virtuoso";
import type { Post } from "../../models/post";
import { PostThumbnail } from "./PostThumbnail";
import { isBlacklisted, type BlacklistEntries } from "../../lib/blacklist";

interface PostGridProps {
  posts: Post[];
  blacklistEntries: BlacklistEntries;
  blacklistDisabled: boolean;
  thumbnailSizePx: number;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  onPostClick: (index: number) => void;
}

function useGridComponents(thumbnailSizePx: number): GridComponents {
  return useMemo(() => {
    const List = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
      ({ style, children, ...props }, ref) => (
        <div
          ref={ref}
          {...props}
          style={{
            ...style,
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSizePx}px, 1fr))`,
            gap: 8,
            padding: 12,
          }}
        >
          {children}
        </div>
      ),
    );
    List.displayName = "PostGridList";

    const Item = (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />;

    return { List, Item };
  }, [thumbnailSizePx]);
}

export function PostGrid({
  posts,
  blacklistEntries,
  blacklistDisabled,
  thumbnailSizePx,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  onPostClick,
}: PostGridProps) {
  const components = useGridComponents(thumbnailSizePx);

  const visible = useMemo(() => {
    if (blacklistDisabled || blacklistEntries.length === 0) return posts;
    return posts.filter((p) => !isBlacklisted(blacklistEntries, p));
  }, [posts, blacklistEntries, blacklistDisabled]);

  if (visible.length === 0 && !isFetchingNextPage) {
    return (
      <div className="flex h-full items-center justify-center text-sm opacity-60">
        No posts found.
      </div>
    );
  }

  return (
    <VirtuosoGrid
      style={{ height: "100%" }}
      totalCount={visible.length}
      components={components}
      itemContent={(index) => {
        const post = visible[index];
        const blacklisted = blacklistDisabled && isBlacklisted(blacklistEntries, post);
        return (
          <PostThumbnail post={post} blacklisted={blacklisted} onClick={() => onPostClick(index)} />
        );
      }}
      endReached={() => {
        if (hasNextPage && !isFetchingNextPage) onLoadMore();
      }}
      overscan={800}
    />
  );
}
