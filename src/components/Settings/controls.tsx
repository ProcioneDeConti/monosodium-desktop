// Building blocks for the Settings panel: a card per topic, label/description rows with the
// control on the right, a switch, and the segmented picker. Kept local to Settings - the rest
// of the app has its own (denser) chrome.

import type { ReactNode } from "react";

/** One topic within a page - a rounded card with a title and optional blurb. `id` is the anchor
 *  the sidebar search jumps to. */
export function SettingCard({
  id,
  title,
  description,
  icon,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Right-aligned header slot (a status chip, a reset link). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-4 rounded-[var(--radius-md)] border border-black/10 bg-white/50 p-4 shadow-sm
                 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <header className="mb-3 flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">{title}</h3>
          {description && <p className="mt-0.5 text-xs opacity-60">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Label + hint on the left, control on the right. Rows inside a card are divided by hairlines. */
export function SettingRow({
  label,
  hint,
  children,
  disabled = false,
  stack = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  /** Put the control under the label (wide controls: swatches, sliders with labels). */
  stack?: boolean;
}) {
  return (
    <div
      className={`flex gap-x-4 gap-y-2 border-t border-black/[0.06] py-3 first:border-t-0 first:pt-0 last:pb-0 dark:border-white/[0.06]
                  ${stack ? "flex-col" : "items-center"} ${disabled ? "pointer-events-none opacity-40" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs opacity-60">{hint}</div>}
      </div>
      {children && <div className={stack ? "" : "shrink-0"}>{children}</div>}
    </div>
  );
}

/** An iOS-style switch. Renders a real checkbox (role="switch") for keyboard/a11y. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** aria-label when there's no visible label tied to it. */
  label?: string;
}) {
  return (
    <label className={`relative inline-flex shrink-0 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className="h-5 w-9 rounded-full bg-black/20 transition-colors duration-200 peer-checked:bg-[rgb(var(--accent))]
                   peer-focus-visible:ring-2 peer-focus-visible:ring-[rgb(var(--accent))] peer-focus-visible:ring-offset-2
                   peer-focus-visible:ring-offset-[rgb(var(--lt-surface))] dark:bg-white/20 dark:peer-focus-visible:ring-offset-[rgb(var(--dk-surface))]"
      />
      <span
        className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform
                   duration-200 ease-[var(--ease-out-expo)] peer-checked:translate-x-4"
      />
    </label>
  );
}

/** Row whose whole control is a Toggle - the most common shape. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow label={label} hint={hint} disabled={disabled}>
      <Toggle
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        label={typeof label === "string" ? label : undefined}
      />
    </SettingRow>
  );
}

/** A small segmented picker, optionally with an icon per option. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string; icon?: (p: { size?: number }) => ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-md)] bg-black/[0.06] p-0.5 dark:bg-white/[0.08]">
      {options.map((o) => {
        const active = value === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-3 py-1 text-xs font-medium transition-all duration-150 ${
              active
                ? "bg-white text-[rgb(var(--accent))] shadow-sm dark:bg-white/15 dark:text-white"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            {Icon && <Icon size={13} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
