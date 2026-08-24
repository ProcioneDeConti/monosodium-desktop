import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, UserRound } from "lucide-react";
import type { Post } from "../../models/post";
import { CopyableField } from "./CopyableField";

interface InfoPanelProps {
  post: Post;
  onOpenProfile: (userId: number) => void;
}

const RATING_LABEL: Record<string, string> = {
  s: "Safe",
  q: "Questionable",
  e: "Explicit",
};

export function InfoPanel({ post, onOpenProfile }: InfoPanelProps) {
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
