import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, GitBranch, UserRound } from "lucide-react";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import { formatBytes } from "../../lib/formatBytes";
import { DText } from "../ui/DText";
import { CopyableField } from "./CopyableField";

interface InfoPanelProps {
  site: Site;
  post: Post;
  onOpenProfile: (userId: number) => void;
  onOpenPool: (poolId: number) => void;
  /** Runs a new search (closes the viewer) - used by the Relationships row. */
  onSearch: (query: string) => void;
}

const RATING_LABEL: Record<string, string> = {
  s: "Safe",
  q: "Questionable",
  e: "Explicit",
};

/** The little accent pill used for the Relationships / Pools rows. */
function InfoChip({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[rgb(var(--accent))] hover:bg-white/20"
    >
      {children}
    </button>
  );
}

export function InfoPanel({ site, post, onOpenProfile, onOpenPool, onSearch }: InfoPanelProps) {
  const rel = post.relationships;
  const hasRelationships = rel.parent_id != null || rel.has_children;
  const status = post.flags.deleted
    ? "Deleted"
    : post.flags.pending
      ? "Pending"
      : post.flags.flagged
        ? "Flagged"
        : "Active";

  return (
    <div className="flex flex-col gap-0.5">
      <CopyableField label="ID" value={String(post.id)} />
      {post.uploader_id != null && (
        <button
          type="button"
          onClick={() => onOpenProfile(post.uploader_id!)}
          className="flex items-center justify-between gap-2 rounded px-1 py-1 text-left text-sm hover:bg-white/5"
          title="View uploader's profile"
        >
          <span className="shrink-0 opacity-60">Uploader</span>
          <span className="flex items-center gap-1 truncate font-medium text-[rgb(var(--accent))]">
            <UserRound size={12} />
            {post.uploader_id}
          </span>
        </button>
      )}
      <CopyableField label="Score" value={`${post.score.total} (+${post.score.up}/-${post.score.down})`} />
      <CopyableField label="Favorites" value={String(post.fav_count)} />
      <CopyableField label="Rating" value={RATING_LABEL[post.rating] ?? post.rating} />
      <CopyableField label="Dimensions" value={`${post.file.width} × ${post.file.height}`} />
      <CopyableField label="File size" value={formatBytes(post.file.size)} />
      <CopyableField label="Type" value={post.file.ext.toUpperCase()} />
      {post.file.md5 && <CopyableField label="MD5" value={post.file.md5} />}
      <CopyableField label="Status" value={status} />
      {post.created_at && <CopyableField label="Uploaded" value={new Date(post.created_at).toLocaleString()} />}

      {post.description && (
        <div className="mt-2">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">Description</h3>
          <DText text={post.description} site={site} className="text-xs" />
        </div>
      )}

      {hasRelationships && (
        <div className="mt-2">
          <h3 className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">
            <GitBranch size={11} />
            Relationships
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {rel.parent_id != null && (
              <InfoChip
                onClick={() => onSearch(`~id:${rel.parent_id} ~parent:${rel.parent_id}`)}
                title="Show the parent post and all its children"
              >
                Parent #{rel.parent_id}
              </InfoChip>
            )}
            {rel.has_children && (
              <InfoChip
                onClick={() => onSearch(`parent:${post.id}`)}
                title="Show this post's children"
              >
                {rel.children.length > 0
                  ? `${rel.children.length} ${rel.children.length === 1 ? "child" : "children"}`
                  : "Children"}
              </InfoChip>
            )}
          </div>
        </div>
      )}

      {post.pools.length > 0 && (
        <div className="mt-2">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">Pools</h3>
          <div className="flex flex-wrap gap-1.5">
            {post.pools.map((id) => (
              <InfoChip key={id} onClick={() => onOpenPool(id)}>
                #{id}
              </InfoChip>
            ))}
          </div>
        </div>
      )}

      {post.sources.length > 0 && (
        <div className="mt-2">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">Sources</h3>
          <ul className="flex flex-col gap-1">
            {post.sources.map((src) => (
              <li key={src} className="truncate text-xs">
                {/^https?:\/\//.test(src) ? (
                  <button
                    type="button"
                    onClick={() => void openUrl(src)}
                    className="flex items-center gap-1 text-left text-[rgb(var(--accent))] hover:underline"
                  >
                    <ExternalLink size={11} className="shrink-0" />
                    <span className="truncate">{src}</span>
                  </button>
                ) : (
                  src
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
