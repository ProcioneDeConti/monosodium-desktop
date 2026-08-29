import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconButton } from "./IconButton";

const MenuCloseContext = createContext<() => void>(() => {});

interface MenuProps {
  icon: ReactNode;
  title: string;
  /** Count pill on the trigger (shows "9+" past 9). Falsy = nothing. */
  badgeCount?: number;
  /** Small accent dot on the trigger (used when `badgeCount` is 0). */
  badgeDot?: boolean;
  align?: "start" | "end";
  width?: string;
  disabled?: boolean;
  /** Render the trigger with the avatar-ish accent treatment (or any custom node). */
  trigger?: ReactNode;
  children: ReactNode;
}

/** A shared dropdown - trigger button + a panel that closes on outside-click / Escape / item
 *  selection (via MenuCloseContext, which MenuItem consumes). Replaces the hand-rolled popover
 *  that AppShell's slideshow menu, TagChip, ReportPostButton, etc. each copied. */
export function Menu({
  icon,
  title,
  badgeCount = 0,
  badgeDot = false,
  align = "end",
  width = "w-60",
  disabled,
  trigger,
  children,
}: MenuProps) {
  const [open, setOpen] = useState(false);
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

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="relative" ref={ref}>
      {trigger ? (
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          title={title}
          aria-label={title}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]"
        >
          {trigger}
        </button>
      ) : (
        <IconButton
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          title={title}
          className={open ? "!text-[rgb(var(--accent))]" : ""}
        >
          {icon}
        </IconButton>
      )}

      {badgeCount > 0 ? (
        <span
          className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center
                     rounded-full bg-[rgb(var(--accent))] px-1 text-[10px] font-bold leading-none text-white"
        >
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      ) : badgeDot ? (
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[rgb(var(--accent))]" />
      ) : null}

      {open && (
        <div
          className={`absolute top-full z-30 mt-1 ${align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left"}
                      ${width} animate-[scale-in_100ms_ease-out] rounded-[var(--radius-md)]
                      border border-black/10 dark:border-white/10 bg-[rgb(250,250,250)] dark:bg-[rgb(28,28,28)]
                      p-1 text-sm shadow-xl shadow-black/20`}
        >
          <MenuCloseContext.Provider value={close}>{children}</MenuCloseContext.Provider>
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
  danger?: boolean;
  /** Leave the menu open after clicking (toggles). Default: close. */
  keepOpen?: boolean;
}

export function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  trailing,
  danger,
  keepOpen,
}: MenuItemProps) {
  const close = useContext(MenuCloseContext);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onClick?.();
        if (!keepOpen) close();
      }}
      className={`flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left
                  transition-colors hover:bg-black/5 dark:hover:bg-white/10
                  disabled:opacity-40 disabled:pointer-events-none ${danger ? "text-red-500" : ""}`}
    >
      {icon != null && <span className="shrink-0 opacity-70">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing != null && <span className="shrink-0 text-xs opacity-55">{trailing}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-black/10 dark:bg-white/10" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-50">
      {children}
    </div>
  );
}

/** A plain padded row for non-item content (sliders, selects, status lines). */
export function MenuRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">{children}</div>;
}
