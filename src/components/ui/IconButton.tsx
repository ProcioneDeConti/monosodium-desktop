import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "type"> {
  children: ReactNode;
  /** "default" adapts to light/dark theme; "invert" is for use on surfaces that are always dark
   *  (the post viewer toolbar, the tag chip menu) regardless of the OS theme. */
  tone?: "default" | "invert";
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<IconButtonProps["tone"]>, string> = {
  default: "text-current opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10",
  invert: "text-white/70 hover:text-white hover:bg-white/10",
};

/** Shared square icon-only button chrome - consistent hover/focus/disabled treatment for
 *  close/nav/vote/download/settings-style controls across the shell, viewer, and settings. */
export function IconButton({ children, tone = "default", className = "", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] p-1.5
                  transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]
                  ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
