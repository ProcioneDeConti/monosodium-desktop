import type { Dmail } from "../../models/dmail";
import type { Site } from "../../models/site";
import { useUserAvatarUrl } from "../../queries/useAvatarUrl";
import { Avatar } from "../ui/Avatar";

interface DmailRowProps {
  site: Site;
  dmail: Dmail;
  onClick: () => void;
  onOpenProfile: (userId: number) => void;
}

/** One inbox row: sender avatar/name (clickable to their profile), subject (bold while unread),
 *  and a relative date - matches the reference Android app's `DmailRow` layout. */
export function DmailRow({ site, dmail, onClick, onOpenProfile }: DmailRowProps) {
  const { data: avatarUrl } = useUserAvatarUrl(site, dmail.from_id);
  const fromId = dmail.from_id;

  return (
    <div className="flex items-center gap-3 border-b border-black/5 dark:border-white/5 last:border-0">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 px-1 py-2.5 text-left">
        <Avatar url={avatarUrl} name={dmail.from_name ?? dmail.to_name ?? "?"} size={36} />
        <div className="min-w-0 flex-1">
          {fromId != null ? (
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
