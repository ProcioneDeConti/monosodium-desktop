import type { ForumPost } from "../../models/forum";
import type { Site } from "../../models/site";
import { useUserAvatarUrl } from "../../queries/useAvatarUrl";
import { Avatar } from "../ui/Avatar";
import { DText } from "../ui/DText";

interface ForumPostRowProps {
  site: Site;
  post: ForumPost;
  onOpenProfile: (userId: number) => void;
}

export function ForumPostRow({ site, post, onOpenProfile }: ForumPostRowProps) {
  const { data: avatarUrl } = useUserAvatarUrl(site, post.creator_id);
  const creatorId = post.creator_id;

  return (
    <div className="flex gap-2.5 border-b border-black/5 dark:border-white/5 last:border-0 px-1 py-3">
      <Avatar url={avatarUrl} name={post.creator_name ?? "?"} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {creatorId != null ? (
            <button
              type="button"
              onClick={() => onOpenProfile(creatorId)}
              className="truncate text-sm font-bold text-[rgb(var(--accent))] hover:underline"
            >
              {post.creator_name ?? "?"}
            </button>
          ) : (
            <span className="truncate text-sm font-bold opacity-60">{post.creator_name ?? "?"}</span>
          )}
          {post.created_at && <span className="text-xs opacity-50">{new Date(post.created_at).toLocaleDateString()}</span>}
        </div>
        <DText text={post.body} site={site} className="mt-1 text-sm leading-relaxed" />
      </div>
    </div>
  );
}
