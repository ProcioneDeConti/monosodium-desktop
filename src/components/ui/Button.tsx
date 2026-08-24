import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "type"> {
  children: ReactNode;
  icon?: ReactNode;
  /** "surface" - bordered translucent pill (shell buttons, panel actions).
   *  "menu" - full-width left-aligned row for a dark dropdown menu (TagChip's action menu). */
  variant?: "surface" | "menu";
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  surface:
    "rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 " +
    "px-2.5 py-1.5 text-xs font-semibold hover:bg-[rgb(var(--accent))]/15",
  menu: "w-full justify-start px-3 py-1.5 text-left text-xs text-white hover:bg-white/10",
};

/** Shared labeled-button chrome with consistent hover/focus/disabled treatment. */
export function Button({ children, icon, variant = "surface", className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center gap-1.5 transition-colors duration-150
                  disabled:opacity-40 disabled:pointer-events-none
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]
                  ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
