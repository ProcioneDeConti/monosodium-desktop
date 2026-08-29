import { Minus, Plus } from "lucide-react";
import type { Site } from "../../models/site";
import type { PostVersion } from "../../models/postVersion";
import { usePostVersionsQuery } from "../../queries/usePostVersionsQuery";
import { Spinner } from "../ui/Spinner";

interface HistoryPanelProps {
  site: Site;
  postId: number;
  onOpenProfile: (userId: number) => void;
}

/** The post viewer's third sidebar tab: `post_versions.json` tag/metadata edit history. */
export function HistoryPanel({ site, postId, onOpenProfile }: HistoryPanelProps) {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePostVersionsQuery(site, postId, true);
  const versions = data?.pages.flatMap((p) => p.versions) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm opacity-60">
        <Spinner size={13} /> Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-4 text-sm">
        <span className="text-red-400">Couldn't load history.</span>{" "}
        <button type="button" onClick={() => void refetch()} className="underline">
          Retry
        </button>
      </div>
    );
  }
  if (versions.length === 0) {
    return <p className="py-4 text-sm opacity-60">No history.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {versions.map((v) => (
        <VersionRow key={v.id} v={v} onOpenProfile={onOpenProfile} />
      ))}
      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="rounded-[var(--radius-sm)] border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading…" : "Older edits"}
        </button>
      )}
    </div>
  );
}

function VersionRow({ v, onOpenProfile }: { v: PostVersion; onOpenProfile: (id: number) => void }) {
  const flags = [
    v.rating_changed && `rating → ${v.rating.toUpperCase()}`,
    v.parent_changed && "parent changed",
    v.source_changed && "sources changed",
    v.description_changed && "description changed",
  ].filter(Boolean) as string[];

  return (
    <div className="border-b border-white/10 pb-3 text-xs last:border-0">
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-bold text-white/90">v{v.version}</span>
        {v.updater_id != null ? (
          <button
            type="button"
            onClick={() => onOpenProfile(v.updater_id!)}
            className="font-semibold text-[rgb(var(--accent))] hover:underline"
          >
            {v.updater_name || "?"}
          </button>
        ) : (
          <span className="opacity-70">{v.updater_name || "?"}</span>
        )}
        {v.updated_at && <span className="opacity-45">{new Date(v.updated_at).toLocaleString()}</span>}
      </div>

      {v.reason.trim() && <p className="mb-1 italic opacity-70">"{v.reason}"</p>}

      <div className="flex flex-wrap gap-1">
        {v.added_tags.map((t) => (
          <span key={`a-${t}`} className="inline-flex items-center gap-0.5 rounded bg-green-500/15 px-1.5 py-0.5 text-green-400">
            <Plus size={9} />
            {t.replace(/_/g, " ")}
          </span>
        ))}
        {v.removed_tags.map((t) => (
          <span key={`r-${t}`} className="inline-flex items-center gap-0.5 rounded bg-red-500/15 px-1.5 py-0.5 text-red-400 line-through">
            <Minus size={9} />
            {t.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {flags.length > 0 && <p className="mt-1 opacity-55">{flags.join(" · ")}</p>}
    </div>
  );
}
