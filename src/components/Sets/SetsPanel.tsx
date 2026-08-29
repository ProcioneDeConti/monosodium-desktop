import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, FolderMinus, Globe, Lock, Plus, SquareStack, X } from "lucide-react";
import type { Site } from "../../models/site";
import type { PostSet } from "../../models/postSet";
import { deriveShortname, isValidShortname } from "../../models/postSet";
import { useUserProfileQuery } from "../../queries/useUserProfileQuery";
import {
  useMyPostSetsQuery,
  usePostSetMutations,
  usePostSetPostsQuery,
} from "../../queries/usePostSets";
import { useSettingsStore } from "../../state/settingsStore";
import { parseBlacklist, visiblePosts } from "../../lib/blacklist";
import { errorMessage } from "../../lib/errors";
import { PostGrid } from "../PostGrid/PostGrid";
import { PostViewer } from "../PostViewer/PostViewer";
import { PoolPanel } from "../Pool/PoolPanel";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface SetsPanelProps {
  site: Site;
  onClose: () => void;
  onSearch: (query: string) => void;
  onOpenProfile: (userId: number) => void;
  onOpenArtist: (tag: string) => void;
}

/** Full-screen overlay for the signed-in account's post sets - browse, create, view a set's
 *  posts, and add/remove (add is in PostViewer's toolbar via AddToSetButton; remove is a
 *  per-post toolbar action here). No reference-app equivalent. */
export function SetsPanel({ site, onClose, onSearch, onOpenProfile, onOpenArtist }: SetsPanelProps) {
  const { data: me } = useUserProfileQuery(site, "me");
  const { data: sets, isLoading, isError } = useMyPostSetsQuery(site, me?.id);
  const { create } = usePostSetMutations(site);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedId === null) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selectedId]);

  const selectedSet = sets?.find((s) => s.id === selectedId) ?? null;
  const shortname = useMemo(() => deriveShortname(newName), [newName]);

  function submitNew() {
    const name = newName.trim();
    if (!name || !isValidShortname(shortname) || create.isPending) return;
    create.mutate(
      { name, shortname, description: "", isPublic: false },
      {
        onSuccess: () => {
          setCreating(false);
          setNewName("");
        },
      },
    );
  }

  if (selectedSet) {
    return (
      <SetGridView
        site={site}
        set={selectedSet}
        onBack={() => setSelectedId(null)}
        onSearch={onSearch}
        onOpenProfile={onOpenProfile}
        onOpenArtist={onOpenArtist}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <SquareStack size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">My sets</h1>
        <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
          <X size={18} />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-lg flex-col gap-3">
          {creating ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-black/10 dark:border-white/10 p-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitNew()}
                placeholder="Set name"
                className="w-full rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                           bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
              <div className="flex items-center justify-between text-xs opacity-60">
                <span>Shortname: {shortname || "—"}</span>
                {newName.trim() && !isValidShortname(shortname) && (
                  <span className="text-amber-500">Needs 3+ letters/numbers</span>
                )}
              </div>
              {create.isError && (
                <span className="text-xs text-red-500">
                  {errorMessage(create.error, "Failed to create set.")}
                </span>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button onClick={() => setCreating(false)}>Cancel</Button>
                <Button
                  onClick={submitNew}
                  disabled={!newName.trim() || !isValidShortname(shortname) || create.isPending}
                  icon={create.isPending ? <Spinner size={12} /> : <Plus size={13} />}
                >
                  Create
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setCreating(true)} icon={<Plus size={13} />} className="self-start">
              New set
            </Button>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm opacity-60">
              <Spinner size={14} />
              Loading sets…
            </div>
          ) : isError ? (
            <p className="py-6 text-sm text-red-500">Failed to load sets.</p>
          ) : !sets || sets.length === 0 ? (
            <p className="py-6 text-sm opacity-60">You don't have any sets yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sets.map((set) => (
                <li key={set.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(set.id)}
                    className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-black/10
                               dark:border-white/10 px-3 py-2.5 text-left transition-colors hover:border-[rgb(var(--accent))]/50
                               hover:bg-[rgb(var(--accent))]/5"
                  >
                    <span className="flex-1 truncate text-sm font-medium">{set.name}</span>
                    {set.is_public ? (
                      <Globe size={12} className="shrink-0 opacity-50" />
                    ) : (
                      <Lock size={12} className="shrink-0 opacity-50" />
                    )}
                    <span className="shrink-0 text-xs opacity-60 tabular-nums">{set.post_count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SetGridView({
  site,
  set,
  onBack,
  onSearch,
  onOpenProfile,
  onOpenArtist,
}: {
  site: Site;
  set: PostSet;
  onBack: () => void;
  onSearch: (query: string) => void;
  onOpenProfile: (userId: number) => void;
  onOpenArtist: (tag: string) => void;
}) {
  const { data: posts, isLoading, isError } = usePostSetPostsQuery(site, set);
  const { removePosts } = usePostSetMutations(site);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [nestedPoolId, setNestedPoolId] = useState<number | null>(null);

  const blacklist = useSettingsStore((s) => s.blacklist);
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const blacklistDisabled = useSettingsStore((s) => s.blacklistDisabled);
  const thumbnailSizePx = useSettingsStore((s) => s.gridThumbnailSizePx);
  const blacklistEntries = useMemo(() => parseBlacklist(blacklist), [blacklist]);
  const shownPosts = useMemo(
    () => visiblePosts(posts ?? [], blacklistEntries, blacklistDisabled),
    [posts, blacklistEntries, blacklistDisabled],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && viewerIndex === null) onBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack, viewerIndex]);

  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= shownPosts.length) {
      setViewerIndex(shownPosts.length > 0 ? shownPosts.length - 1 : null);
    }
  }, [viewerIndex, shownPosts.length]);

  function addTagToBlacklist(tag: string) {
    setBlacklist(blacklist.trim() === "" ? tag : `${blacklist}\n${tag}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <IconButton onClick={onBack} title="Back to sets">
          <ChevronLeft size={18} />
        </IconButton>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{set.name}</h1>
          <p className="text-xs opacity-60">
            {set.post_count} {set.post_count === 1 ? "post" : "posts"}
            {set.is_public ? " · Public" : " · Private"}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
            <Spinner size={15} />
            Loading…
          </div>
        ) : isError || !posts ? (
          <div className="flex h-full items-center justify-center text-sm text-red-500">
            Failed to load set.
          </div>
        ) : posts.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm opacity-60">
            This set has no posts.
          </div>
        ) : (
          <PostGrid
            site={site}
            posts={posts}
            blacklistEntries={blacklistEntries}
            blacklistDisabled={blacklistDisabled}
            thumbnailSizePx={thumbnailSizePx}
            isFetchingNextPage={false}
            hasNextPage={false}
            onLoadMore={() => {}}
            onPostClick={setViewerIndex}
          />
        )}
      </div>

      {viewerIndex !== null && (
        <PostViewer
          site={site}
          posts={shownPosts}
          index={viewerIndex}
          hasNextPage={false}
          blacklistEntries={blacklistEntries}
          blacklistDisabled={blacklistDisabled}
          onIndexChange={setViewerIndex}
          onLoadMore={() => {}}
          onClose={() => setViewerIndex(null)}
          onSearchTag={(tag) => {
            onBack();
            onSearch(tag);
          }}
          onAddTagToSearch={(tag) => {
            onBack();
            onSearch(tag);
          }}
          onExcludeTag={(tag) => {
            onBack();
            onSearch(`-${tag}`);
          }}
          onBlacklistTag={addTagToBlacklist}
          onOpenProfile={onOpenProfile}
          onOpenArtist={onOpenArtist}
          onOpenPool={setNestedPoolId}
          slideshowActive={false}
          onToggleSlideshow={() => {}}
          extraToolbarActions={(post) => (
            <IconButton
              tone="invert"
              title="Remove from this set"
              disabled={removePosts.isPending}
              onClick={() => removePosts.mutate({ setId: set.id, postIds: [post.id] })}
            >
              <FolderMinus size={16} />
            </IconButton>
          )}
        />
      )}

      {nestedPoolId !== null && (
        <PoolPanel
          site={site}
          poolId={nestedPoolId}
          onClose={() => setNestedPoolId(null)}
          onSearch={onSearch}
          onOpenProfile={onOpenProfile}
          onOpenArtist={onOpenArtist}
        />
      )}
    </div>
  );
}
