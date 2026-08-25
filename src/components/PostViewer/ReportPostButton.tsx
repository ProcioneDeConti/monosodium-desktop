import { useEffect, useRef, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface ReportPostButtonProps {
  postId: number;
  isAuthenticated: boolean;
  report: UseMutationResult<void, unknown, { postId: number; reason: string }>;
}

/** Popover report form, same outside-click/Escape-to-close convention as AppShell's slideshow
 *  menu. Posts had no report action anywhere in this app until now - comments already had one
 *  (CommentRow.tsx), reusing the same tickets.json endpoint this mirrors. */
export function ReportPostButton({ postId, isAuthenticated, report }: ReportPostButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reported, setReported] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function submit() {
    const trimmed = reason.trim();
    if (!trimmed || report.isPending) return;
    report.mutate(
      { postId, reason: trimmed },
      {
        onSuccess: () => {
          setReported(true);
          setOpen(false);
        },
      },
    );
  }

  return (
    <div className="relative" ref={ref}>
      <IconButton
        tone="invert"
        disabled={!isAuthenticated || reported}
        title={!isAuthenticated ? "Sign in (Settings) to report" : reported ? "Reported" : "Report this post"}
        onClick={() => setOpen((v) => !v)}
        className={reported ? "!text-amber-400" : ""}
      >
        <Flag size={16} className={reported ? "fill-current" : ""} />
      </IconButton>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-64 animate-[scale-in_100ms_ease-out] origin-top-right
                     rounded-[var(--radius-md)] border border-white/10 bg-[rgb(28,28,28)] p-3 text-xs text-white shadow-xl shadow-black/20"
        >
          <p className="mb-2 font-semibold uppercase tracking-wide opacity-60">Report post</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Reason for reporting…"
            className="w-full resize-none rounded border border-white/10 bg-black/20 px-1.5 py-1 text-[11px]
                       text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            {report.isError && <span className="text-red-400">Failed to report.</span>}
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 hover:bg-white/10">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={report.isPending || !reason.trim()}
              className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 font-semibold text-red-300
                         hover:bg-red-500/30 disabled:opacity-40"
            >
              {report.isPending && <Spinner size={11} />}
              Send report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
