import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import { SITE_WEB_BASE_URL } from "../models/site";
import { PostViewer } from "./PostViewer/PostViewer";
import { Spinner } from "./ui/Spinner";
import { loadSettings, useSettingsStore } from "../state/settingsStore";
import { loadAllAccounts } from "../state/accountStore";
import { parseBlacklist } from "../lib/blacklist";
import { hexToRgbTriplet } from "../lib/color";

interface PostWindowProps {
  postId: number;
  site: Site;
}

/** A post popped out into its own OS window (PostViewer's "Open in new window" button) - desktop-
 *  native, no counterpart in the reference Android app. A separate window is a separate webview
 *  context, so this does its own minimal boot (settings/credentials) rather than sharing App.tsx's
 *  - and, since it's a different QueryClient instance entirely, a vote/favorite made here won't
 *  live-update the main window's grid/viewer the way two panels in the *same* window already do
 *  (see postCache.ts) until that window's own query happens to revalidate. Tag actions that would
 *  normally start a new search in the main grid instead open that search on the real e621 website,
 *  since there's no grid here to run it in and no reliable way to know whether a main window is
 *  even still open. */
export function PostWindow({ postId, site }: PostWindowProps) {
  const [booted, setBooted] = useState(false);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const blacklist = useSettingsStore((s) => s.blacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);

  useEffect(() => {
    Promise.all([loadSettings(), loadAllAccounts()]).finally(() => setBooted(true));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", hexToRgbTriplet(accentColor));
  }, [accentColor]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["standalonePost", site, postId],
    queryFn: async () => (await e621Api.getPosts(site, `id:${postId}`, 1)).posts[0] ?? null,
    enabled: booted,
  });

  function openTagSearch(tag: string) {
    void openUrl(`${SITE_WEB_BASE_URL[site]}/posts?tags=${encodeURIComponent(tag)}`);
  }

  if (!booted || isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-sm text-white/60">
        <Spinner size={18} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-sm text-white/60">
        Post not found.
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <PostViewer
        site={site}
        posts={[data]}
        index={0}
        hasNextPage={false}
        blacklistEntries={parseBlacklist(blacklist)}
        blacklistDisabled={blacklistDisabled}
        onIndexChange={() => {}}
        onLoadMore={() => {}}
        onClose={() => void getCurrentWindow().close()}
        onSearchTag={openTagSearch}
        onAddTagToSearch={openTagSearch}
        onExcludeTag={(tag) => openTagSearch(`-${tag}`)}
        onBlacklistTag={(tag) =>
          useSettingsStore
            .getState()
            .setBlacklist(blacklist.trim() === "" ? tag : `${blacklist}\n${tag}`)
        }
        onOpenProfile={(id) => void openUrl(`${SITE_WEB_BASE_URL[site]}/users/${id}`)}
        onOpenPool={(id) => void openUrl(`${SITE_WEB_BASE_URL[site]}/pools/${id}`)}
        onOpenArtist={(tag) => void openUrl(`${SITE_WEB_BASE_URL[site]}/artists/show_or_new?name=${encodeURIComponent(tag)}`)}
        slideshowActive={false}
        onToggleSlideshow={() => {}}
      />
    </div>
  );
}
