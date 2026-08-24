interface TopProgressBarProps {
  active: boolean;
}

/** A slim indeterminate bar (browser/GitHub-style), placed directly in normal flow right under
 *  the shell header while posts are loading/refetching/paginating, so there's always a visible
 *  "something is happening" signal beyond the per-thumbnail skeletons and the refresh button's
 *  own spin. Renders nothing (not just hidden) while inactive. */
export function TopProgressBar({ active }: TopProgressBarProps) {
  if (!active) return null;
  return (
    <div className="h-0.5 w-full shrink-0 overflow-hidden">
      <div className="h-full w-1/3 animate-[progress-sweep_1.1s_ease-in-out_infinite] bg-[rgb(var(--accent))]" />
    </div>
  );
}
