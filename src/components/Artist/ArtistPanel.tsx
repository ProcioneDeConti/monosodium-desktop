import { useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertTriangle, ExternalLink, Images, Lock, Palette, UserRound, X } from "lucide-react";
import type { Site } from "../../models/site";
import { SITE_DISPLAY_NAME, SITE_WEB_BASE_URL } from "../../models/site";
import { urlSiteLabel } from "../../models/artist";
import { errorMessage } from "../../lib/errors";
import { useArtistQuery, useArtistDnpQuery } from "../../queries/useArtist";
import { Button } from "../ui/Button";
import { DText } from "../ui/DText";
import { IconButton } from "../ui/IconButton";
import { Overlay, type OverlayHandle } from "../ui/Overlay";
import { Section } from "../ui/Section";
import { Spinner } from "../ui/Spinner";

interface ArtistPanelProps {
  site: Site;
  name: string;
  onClose: () => void;
  onSearch: (query: string) => void;
  onOpenProfile: (userId: number) => void;
}

/** Full-screen overlay for an artist tag - canonical name, aliases, DNP warning, staff notes,
 *  and off-site links. No reference-app equivalent (it only showed a post's artist tags as plain
 *  chips). Opened from an `artist`-category tag chip's menu. */
export function ArtistPanel({ site, name, onClose, onSearch, onOpenProfile }: ArtistPanelProps) {
  const { data: artist, isLoading, isError, error } = useArtistQuery(site, name);
  const { data: dnp } = useArtistDnpQuery(site, artist?.id);
  const displayName = name.replace(/_/g, " ");
  const overlay = useRef<OverlayHandle>(null);

  const activeUrls = (artist?.urls ?? []).filter((u) => u.is_active);
  const inactiveUrls = (artist?.urls ?? []).filter((u) => !u.is_active);

  return (
    <Overlay ref={overlay} onClose={onClose} variant="sheet">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <Palette size={15} className="text-[rgb(var(--accent))]" />
          <h1 className="truncate text-sm font-semibold">{displayName}</h1>
          <IconButton onClick={() => overlay.current?.close()} title="Close (Esc)" className="ml-auto">
            <X size={18} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
              <Spinner size={15} />
              Loading…
            </div>
          ) : isError ? (
            <p className="py-6 text-center text-sm text-red-500">{errorMessage(error)}</p>
          ) : !artist ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <UserRound size={28} className="opacity-30" />
              <p className="text-sm opacity-60">
                <span className="font-semibold">{displayName}</span> isn't a registered artist tag.
              </p>
              <Button icon={<Images size={13} />} onClick={() => onSearch(name)}>
                View posts anyway
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {dnp && (
                <div className="flex gap-2.5 rounded-[var(--radius-md)] border border-red-500/40 bg-red-500/10 p-3 text-sm">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
                  <div>
                    <p className="font-bold text-red-500">Do not post</p>
                    <p className="opacity-80">
                      {dnp.details?.trim()
                        ? dnp.details
                        : "This artist has requested their work not be posted to e621."}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-lg font-bold">{displayName}</h2>
                  {artist.is_locked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] opacity-60 dark:bg-white/10">
                      <Lock size={10} /> Locked
                    </span>
                  )}
                  {!artist.is_active && (
                    <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] opacity-60 dark:bg-white/10">
                      Inactive
                    </span>
                  )}
                </div>
                {artist.group_name && (
                  <p className="mt-0.5 text-xs opacity-55">Group: {artist.group_name.replace(/_/g, " ")}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button icon={<Images size={13} />} onClick={() => onSearch(artist.name)}>
                  View posts
                </Button>
                <Button
                  onClick={() => void openUrl(`${SITE_WEB_BASE_URL[site]}/artists/${artist.id}`)}
                  icon={<ExternalLink size={12} />}
                >
                  Open on {SITE_DISPLAY_NAME[site]}
                </Button>
                {artist.linked_user_id != null && (
                  <Button icon={<UserRound size={13} />} onClick={() => onOpenProfile(artist.linked_user_id!)}>
                    Linked account
                  </Button>
                )}
              </div>

              {artist.other_names.length > 0 && (
                <Section title="Also known as">
                  <div className="flex flex-wrap gap-1.5">
                    {artist.other_names.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onSearch(n)}
                        className="rounded-full bg-black/[0.05] px-2 py-0.5 text-xs hover:bg-[rgb(var(--accent))]/15 dark:bg-white/[0.06]"
                      >
                        {n.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {(activeUrls.length > 0 || inactiveUrls.length > 0) && (
                <Section title="Links">
                  <ul className="flex flex-col gap-1">
                    {activeUrls.map((u) => (
                      <UrlRow key={u.url} url={u.url} />
                    ))}
                    {inactiveUrls.map((u) => (
                      <UrlRow key={u.url} url={u.url} inactive />
                    ))}
                  </ul>
                </Section>
              )}

              {artist.notes.trim() && (
                <Section title="Notes">
                  <DText text={artist.notes} site={site} className="text-sm" />
                </Section>
              )}
            </div>
          )}
        </div>
    </Overlay>
  );
}

function UrlRow({ url, inactive }: { url: string; inactive?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => void openUrl(url)}
        className={`flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm
                    hover:bg-black/5 dark:hover:bg-white/5 ${inactive ? "opacity-45" : ""}`}
      >
        <ExternalLink size={12} className="shrink-0 text-[rgb(var(--accent))]" />
        <span className="w-24 shrink-0 truncate text-xs font-semibold">{urlSiteLabel(url)}</span>
        <span className="min-w-0 flex-1 truncate text-xs opacity-60">{url.replace(/^https?:\/\//, "")}</span>
        {inactive && <span className="shrink-0 text-[10px] uppercase opacity-60">dead</span>}
      </button>
    </li>
  );
}
