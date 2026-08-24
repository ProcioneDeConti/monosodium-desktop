import { useState } from "react";

interface CopyableFieldProps {
  label: string;
  value: string;
}

export function CopyableField({ label, value }: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access denied - not worth surfacing an error for a convenience action.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center justify-between gap-2 rounded px-1 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
      title="Click to copy"
    >
      <span className="shrink-0 opacity-60">{label}</span>
      <span className="truncate font-medium">{copied ? "Copied!" : value}</span>
    </button>
  );
}
