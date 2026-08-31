import { useEffect } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Check, Clock, Download, FolderOpen, RotateCw, Trash2, X } from "lucide-react";
import { useDownloadsStore, type DownloadJob } from "../../state/downloadsStore";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface DownloadsPanelProps {
  onClose: () => void;
}

/** The download queue (state/downloadsStore.ts) - bulk "download selected" and the single-post
 *  download buttons all land here. Session-only; closing the panel doesn't stop anything. */
export function DownloadsPanel({ onClose }: DownloadsPanelProps) {
  const jobs = useDownloadsStore((s) => s.jobs);
  const retry = useDownloadsStore((s) => s.retry);
  const remove = useDownloadsStore((s) => s.remove);
  const clearFinished = useDownloadsStore((s) => s.clearFinished);
  const clearAll = useDownloadsStore((s) => s.clearAll);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const active = jobs.filter((j) => j.status === "queued" || j.status === "active").length;
  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "error").length;
  const hasFinished = jobs.some((j) => j.status === "done" || j.status === "error");

  return (
    <div className="fixed inset-0 z-[55] flex justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="mt-8 flex h-fit max-h-[80vh] w-full max-w-md animate-[scale-in_120ms_ease-out] flex-col
                   rounded-[var(--radius-md)] border border-black/10 dark:border-white/10
                   bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <Download size={15} className="text-[rgb(var(--accent))]" />
          <h1 className="text-sm font-semibold">Downloads</h1>
          <span className="text-xs opacity-60">
            {[active && `${active} pending`, done && `${done} done`, failed && `${failed} failed`]
              .filter(Boolean)
              .join(" · ") || "idle"}
          </span>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={17} />
          </IconButton>
        </div>

        {jobs.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-3 py-1.5 text-xs">
            <button
              type="button"
              onClick={clearFinished}
              disabled={!hasFinished}
              className="rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
            >
              Clear finished
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {jobs.length === 0 ? (
            <EmptyState
              className="!h-auto py-10"
              icon={<Download />}
              title="No downloads yet"
              hint="Use the download button in the viewer, on a thumbnail hover, or the multi-select bar."
            />
          ) : (
            <ul className="flex flex-col gap-0.5">
              {[...jobs].reverse().map((job) => (
                <DownloadRow
                  key={job.id}
                  job={job}
                  onRetry={() => retry(job.id)}
                  onRemove={() => remove(job.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function DownloadRow({
  job,
  onRetry,
  onRemove,
}: {
  job: DownloadJob;
  onRetry: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5">
      <span className="shrink-0">
        {job.status === "active" ? (
          <Spinner size={13} />
        ) : job.status === "queued" ? (
          <Clock size={13} className="opacity-50" />
        ) : job.status === "done" ? (
          <Check size={13} className="text-green-500" />
        ) : (
          <X size={13} className="text-red-500" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs">{job.fileName}</div>
        {job.status === "error" && (
          <div className="truncate text-[11px] text-red-500">{job.error}</div>
        )}
        {job.status === "queued" && <div className="text-[11px] opacity-50">Queued</div>}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {job.status === "done" && job.savedPath && (
          <IconButton
            title="Show in folder"
            className="!p-1"
            onClick={() => void revealItemInDir(job.savedPath!)}
          >
            <FolderOpen size={13} />
          </IconButton>
        )}
        {job.status === "error" && (
          <IconButton title="Retry" className="!p-1" onClick={onRetry}>
            <RotateCw size={13} />
          </IconButton>
        )}
        {job.status !== "active" && (
          <IconButton title="Remove" className="!p-1 opacity-0 group-hover:opacity-100" onClick={onRemove}>
            <Trash2 size={13} />
          </IconButton>
        )}
      </div>
    </li>
  );
}
