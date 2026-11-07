import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy, Lock, MinusCircle, SearchX, X } from "lucide-react";
import type { RecoveredSet } from "../../api/client";
import { searchedOn } from "../../state/recoveredStore";
import {
  describeReason,
  foundAttempts,
  gradeText,
  groupAttempts,
  reportText,
  shortPath,
  type ReasonTone,
  type RecoverFailure,
  type RecoveryAttempt,
} from "../../lib/recoveryReport";

const TONE_ICON: Record<ReasonTone, typeof SearchX> = {
  found: CheckCircle2,
  skip: MinusCircle,
  gone: SearchX,
  none: CircleDashed,
  blocked: Lock,
  error: AlertTriangle,
};

const TONE_TEXT: Record<ReasonTone, string> = {
  found: "text-green-300",
  skip: "text-white/35",
  gone: "text-white/60",
  none: "text-white/50",
  blocked: "text-amber-300/90",
  error: "text-red-300/85",
};

type RecoveryReportProps =
  /** A search that found nothing. */
  | { failure: RecoverFailure; set?: never; onClose?: () => void }
  /** What a search found (`set.items`) plus where it came up empty (`set.report`). */
  | { set: RecoveredSet; failure?: never; onClose?: () => void };

/** The report card for a deleted-post search: one row per place it looked, grouped by stage -
 *  files it found (with their grade) and, for each miss, a few plain words on why (raw reason on
 *  hover). Used for "nothing found" and, closeable, over a successfully recovered post. */
export function RecoveryReport({ failure, set, onClose }: RecoveryReportProps) {
  const [copied, setCopied] = useState(false);

  let attempts: RecoveryAttempt[];
  let title: string;
  let subtitle: string;
  let success = false;
  if (set) {
    success = true;
    attempts = [...foundAttempts(set.items), ...(set.report?.attempts ?? [])];
    const best = set.items[0];
    const n = set.items.length;
    title = `Recovered ${n} file${n === 1 ? "" : "s"}`;
    const from = best ? foundAttempts([best])[0].label : "";
    subtitle = best
      ? `Best: ${gradeText(best.grade).toLowerCase()} from ${from}${best.grade === "exact" ? " - the search stopped there" : ""}`
      : "";
    if (set.report) subtitle += `${subtitle ? " · " : ""}searched ${searchedOn(set.report.searched_at)}`;
  } else {
    attempts = failure.attempts;
    title = "No copy found";
    const looked = attempts.filter((a) => a.stage !== "skipped" && a.stage !== "limit").length;
    subtitle = failure.no_sources
      ? "The post lists no sources, and no other site has a file with its checksum."
      : looked > 0
        ? `Looked in ${looked} place${looked === 1 ? "" : "s"} - nothing usable turned up.`
        : failure.message;
  }
  const sections = groupAttempts(attempts);
  const HeaderIcon = success ? CheckCircle2 : SearchX;

  async function copy() {
    await navigator.clipboard.writeText(reportText(title, attempts)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-[var(--radius-md)] bg-black/70 text-left ring-1 ring-white/10 backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <HeaderIcon size={20} strokeWidth={1.75} className={`shrink-0 ${success ? "text-green-300" : "text-white/50"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white/85">{title}</p>
          {subtitle && <p className="text-xs text-white/45">{subtitle}</p>}
        </div>
        {attempts.length > 0 && (
          <button
            type="button"
            onClick={() => void copy()}
            title="Copy the full details (for a bug report)"
            className="flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy details"}
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close the report"
            aria-label="Close the report"
            className="-mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-white/50 hover:bg-white/10 hover:text-white/90"
          >
            <X size={15} />
          </button>
        )}
      </div>
      {sections.length > 0 && (
        <div className="max-h-[45vh] overflow-y-auto px-4 py-2">
          {sections.map((section) => (
            <section key={section.title} className="py-1.5">
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">{section.title}</h4>
              <ul className="flex flex-col">
                {section.rows.map((a, i) => {
                  const reason = describeReason(a);
                  const Icon = TONE_ICON[reason.tone];
                  const path = shortPath(a.url);
                  return (
                    <li key={i} className={`py-1 ${reason.tone === "skip" ? "opacity-70" : ""}`}>
                      <div className="flex items-center gap-2 text-xs">
                        <Icon size={13} strokeWidth={2} className={`shrink-0 ${TONE_TEXT[reason.tone]}`} />
                        <span className="shrink-0 font-medium text-white/80">{a.label}</span>
                        {path && a.url ? (
                          <button
                            type="button"
                            onClick={() => void openUrl(a.url!)}
                            title={`Open ${a.url}`}
                            className="min-w-0 truncate text-white/35 hover:text-white/70 hover:underline"
                          >
                            {path}
                          </button>
                        ) : (
                          <span className="min-w-0 flex-1" />
                        )}
                        <span className={`ml-auto shrink-0 pl-2 ${TONE_TEXT[reason.tone]}`} title={a.reason}>
                          {reason.text}
                        </span>
                      </div>
                      {reason.hint && <p className="ml-[21px] mt-0.5 text-[11px] text-amber-200/60">{reason.hint}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
