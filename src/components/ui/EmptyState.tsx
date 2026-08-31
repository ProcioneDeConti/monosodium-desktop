import type { ReactNode } from "react";

interface EmptyStateProps {
  /** A lucide icon (or any node) - rendered large and dim above the text. */
  icon?: ReactNode;
  title: string;
  /** A short line of guidance under the title. */
  hint?: ReactNode;
  /** An optional button / link row below the text. */
  action?: ReactNode;
  className?: string;
}

/** The shared "there's nothing here (and here's what to do about it)" block - replaces the bare
 *  one-liners ("No posts found.", "Loading…") that were scattered across the grid and panels. */
export function EmptyState({ icon, title, hint, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-3 px-6 text-center ${className}`}
    >
      {icon != null && (
        <div className="opacity-25 [&>svg]:h-9 [&>svg]:w-9" aria-hidden>
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium opacity-80">{title}</p>
        {hint != null && <p className="mx-auto max-w-xs text-xs leading-relaxed opacity-55">{hint}</p>}
      </div>
      {action != null && <div className="pt-1">{action}</div>}
    </div>
  );
}
