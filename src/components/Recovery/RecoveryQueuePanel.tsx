import { CheckCircle2, CircleSlash, RotateCcw, SearchX, Trash2, TriangleAlert, X } from "lucide-react";
import type { RecoveryGrade } from "../../api/client";
import { useRecoveryQueueStore, type RecoveryJob } from "../../state/recoveryQueueStore";
import { Spinner } from "../ui/Spinner";

const GRADE_TEXT: Record<RecoveryGrade, string> = {
  exact: "exact match",
  same_dimensions: "same size",
  rescaled: "different resolution",
  mismatch: "doesn't match",
};

function JobRow({ job, message }: { job: RecoveryJob; message: string | null }) {
  let icon;
  let text: string;
  let tone = "text-white/55";
  switch (job.status) {
    case "queued":
      icon = <span className="h-1.5 w-1.5 rounded-full bg-white/30" />;
      text = "Waiting";
      tone = "text-white/35";
      break;
    case "running":
      icon = <Spinner size={12} />;
      text = message ?? "Searching";
      tone = "text-white/70";
      break;
    case "found":
      icon = <CheckCircle2 size={13} className="text-green-300" />;
      text = `${job.grade ? GRADE_TEXT[job.grade] : "found"}${job.detail ? ` · ${job.detail}` : ""}`;
      tone = job.grade === "mismatch" ? "text-white/55" : "text-green-300";
      break;
    case "not_found":
      icon = <SearchX size={13} className="text-white/45" />;
      text = `Not found${job.detail ? ` · ${job.detail}` : ""}`;
      break;
    case "failed":
      icon = <TriangleAlert size={13} className="text-red-300/85" />;
      text = job.detail ?? "Failed";
      tone = "text-red-300/85";
      break;
    case "cancelled":
      icon = <CircleSlash size={13} className="text-white/35" />;
      text = "Cancelled";
      tone = "text-white/35";
      break;
  }
  return (
    <li className="flex items-center gap-2 py-1 text-xs">
      <span className="flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="shrink-0 font-medium tabular-nums text-white/80">#{job.postId}</span>
      <span className={`min-w-0 truncate ${tone}`} title={text}>
        {text}
      </span>
    </li>
  );
}

/** Floating progress card for a bulk un-delete (state/recoveryQueueStore.ts). Shown while the
 *  queue has anything in it; dismissable once the batch is done. */
export function RecoveryQueuePanel() {
  const jobs = useRecoveryQueueStore((s) => s.jobs);
  const message = useRecoveryQueueStore((s) => s.currentMessage);
  const cancelAll = useRecoveryQueueStore((s) => s.cancelAll);
  const retryUnfinished = useRecoveryQueueStore((s) => s.retryUnfinished);
  const dismiss = useRecoveryQueueStore((s) => s.dismiss);
  if (jobs.length === 0) return null;

  const active = jobs.some((j) => j.status === "queued" || j.status === "running");
  const found = jobs.filter((j) => j.status === "found").length;
  const finished = jobs.filter((j) => j.status !== "queued" && j.status !== "running").length;
  const unfinished = jobs.filter((j) => j.status === "not_found" || j.status === "failed" || j.status === "cancelled").length;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 overflow-hidden rounded-[var(--radius-md)] bg-black/80 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Trash2 size={15} className="shrink-0 text-white/60" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{active ? "Recovering deleted posts" : "Recovery finished"}</p>
          <p className="text-xs text-white/50">
            {active
              ? `${finished} of ${jobs.length} done · ${found} recovered`
              : `Recovered ${found} of ${jobs.length}`}
          </p>
        </div>
        {active ? (
          <button
            type="button"
            onClick={cancelAll}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
          >
            Cancel all
          </button>
        ) : (
          <>
            {unfinished > 0 && (
              <button
                type="button"
                onClick={retryUnfinished}
                title="Search again for the posts that weren't recovered"
                className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
              >
                <RotateCcw size={12} /> Retry {unfinished}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              title="Close"
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X size={15} />
            </button>
          </>
        )}
      </div>
      <ul className="max-h-72 overflow-y-auto px-3 py-1.5">
        {jobs.map((job) => (
          <JobRow key={job.key} job={job} message={job.status === "running" ? message : null} />
        ))}
      </ul>
    </div>
  );
}
