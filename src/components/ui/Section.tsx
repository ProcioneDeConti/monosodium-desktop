import type { ReactNode } from "react";

/** Shared card-surface section wrapper used by SettingsPanel and ProfilePanel. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-[var(--radius-md)] border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-3.5">
      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide opacity-60">{title}</h2>
      {children}
    </section>
  );
}
