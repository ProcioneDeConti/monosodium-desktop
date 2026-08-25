import { X } from "lucide-react";
import { EULA_TEXT } from "../../lib/eula";
import { IconButton } from "../ui/IconButton";

interface EulaReadOnlyDialogProps {
  onClose: () => void;
}

/** Read-only re-display from Settings > Legal - no agree/disagree, just a close button. A
 *  compact centered dialog rather than a full-height side panel (unlike Settings/Profile/
 *  Messages), matching the reference app's own centered `Dialog` treatment for this - it's a
 *  short re-read, not a screen with its own state to manage. */
export function EulaReadOnlyDialog({ onClose }: EulaReadOnlyDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex animate-[fade-in_150ms_ease-out] items-center justify-center bg-black/60 backdrop-blur-sm p-6">
      <div className="flex max-h-[80vh] w-full max-w-lg animate-[scale-in_150ms_ease-out] flex-col rounded-[var(--radius-md)] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <h1 className="text-sm font-semibold">End User License Agreement</h1>
          <IconButton onClick={onClose} title="Close" className="ml-auto">
            <X size={18} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed">
          {EULA_TEXT}
        </div>
      </div>
    </div>
  );
}
