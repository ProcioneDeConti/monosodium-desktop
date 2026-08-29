import { Check, Download, Heart, Library, SquareStack, X } from "lucide-react";
import { Spinner } from "../ui/Spinner";

interface SelectionBarProps {
  count: number;
  total: number;
  canInteract: boolean;
  favoriteProgress: { done: number; total: number } | null;
  onSelectAll: () => void;
  onClear: () => void;
  onFavorite: () => void;
  onAddToSet: () => void;
  onAddToCollection: () => void;
  onDownload: () => void;
  onExit: () => void;
}

/** Floating bar shown while grid multi-select is active. */
export function SelectionBar({
  count,
  total,
  canInteract,
  favoriteProgress,
  onSelectAll,
  onClear,
  onFavorite,
  onAddToSet,
  onAddToCollection,
  onDownload,
  onExit,
}: SelectionBarProps) {
  const busy = favoriteProgress !== null;
  const disabled = count === 0 || busy;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3">
      <div
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-black/10 dark:border-white/10
                   bg-[rgb(250,250,250)]/95 dark:bg-[rgb(28,28,28)]/95 px-2 py-1.5 text-sm shadow-xl shadow-black/20 backdrop-blur"
      >
        <span className="px-2 font-semibold tabular-nums">
          {favoriteProgress
            ? `Favoriting ${favoriteProgress.done}/${favoriteProgress.total}…`
            : `${count} selected`}
        </span>

        <button
          type="button"
          onClick={onSelectAll}
          disabled={busy || count === total}
          className="rounded-full px-2.5 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
        >
          Select all ({total})
        </button>

        <div className="mx-0.5 h-5 w-px bg-black/10 dark:bg-white/15" />

        <BarButton
          icon={busy ? <Spinner size={13} /> : <Heart size={14} />}
          label="Favorite"
          onClick={onFavorite}
          disabled={disabled || !canInteract}
          title={canInteract ? undefined : "Sign in (Settings) to favorite"}
        />
        <BarButton
          icon={<SquareStack size={14} />}
          label="Add to set"
          onClick={onAddToSet}
          disabled={disabled || !canInteract}
          title={canInteract ? undefined : "Sign in (Settings) to use sets"}
        />
        <BarButton
          icon={<Library size={14} />}
          label="Collection"
          onClick={onAddToCollection}
          disabled={disabled}
        />
        <BarButton icon={<Download size={14} />} label="Download" onClick={onDownload} disabled={disabled} />

        <div className="mx-0.5 h-5 w-px bg-black/10 dark:bg-white/15" />

        <BarButton icon={<Check size={14} />} label="Clear" onClick={onClear} disabled={busy || count === 0} />
        <button
          type="button"
          onClick={onExit}
          title="Exit selection"
          className="rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function BarButton({
  icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10
                 disabled:opacity-40 disabled:pointer-events-none"
    >
      {icon}
      {label}
    </button>
  );
}
