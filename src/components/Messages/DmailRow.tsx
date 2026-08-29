import { Check } from "lucide-react";
import type { Dmail } from "../../models/dmail";
import type { Site } from "../../models/site";
import { useUserAvatarUrl } from "../../queries/useAvatarUrl";
import { Avatar } from "../ui/Avatar";

interface DmailRowProps {
  site: Site;
  dmail: Dmail;
  onClick: () => void;
  onOpenProfile: (userId: number) => void;
  /** Selection mode: the row toggles selection instead of opening, and shows a checkbox. */
  selecting?: boolean;
  selected?: boolean;
}

/** One inbox row: sender avatar/name (clickable to their profile), subject (bold while unread),
 *  and a relative date - matches the reference Android app's `DmailRow` layout. */
export function DmailRow({ site, dmail, onClick, onOpenProfile, selecting, selected }: DmailRowProps) {
  const { data: avatarUrl } = useUserAvatarUrl(site, dmail.from_id);
  const fromId = dmail.from_id;

  return (
    <div
      className={`flex items-center gap-2 border-b border-black/5 dark:border-white/5 last:border-0 ${
        selected ? "bg-[rgb(var(--accent))]/10" : ""
      }`}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 px-1 py-2.5 text-left">
        {selecting && (
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
              selected
                ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-white"
                : "border-black/25 dark:border-white/30"
            }`}
          >
            {selected && <Check size={12} strokeWidth={3} />}
          </span>
        )}
        <Avatar url={avatarUrl} name={dmail.from_name ?? dmail.to_name ?? "?"} size={36} />
        <div className="min-w-0 flex-1">
          {fromId != null && !selecting ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(fromId);
              }}
              className="block max-w-full truncate text-xs font-bold text-[rgb(var(--accent))] hover:underline"
            >
              {dmail.from_name ?? "?"}
            </button>
          ) : (
            <p className="truncate text-xs font-bold opacity-60">{dmail.from_name ?? dmail.to_name ?? "?"}</p>
          )}
          <p className={`truncate text-sm ${!dmail.is_read ? "font-bold" : ""}`}>{dmail.title || "(no subject)"}</p>
          {dmail.created_at && (
            <p className="text-[11px] opacity-50">{new Date(dmail.created_at).toLocaleString()}</p>
          )}
        </div>
      </button>
    </div>
  );
}
