import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronLeft,
  FolderDown,
  FolderMinus,
  Library,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Site } from "../../models/site";
import type { Collection } from "../../models/collection";
import { useCollectionsStore } from "../../state/collectionsStore";
import { useCollectionPostsQuery } from "../../queries/useCollectionPosts";
import { useSettingsStore } from "../../state/settingsStore";
import { parseBlacklist, visiblePosts } from "../../lib/blacklist";
import { PostGrid } from "../PostGrid/PostGrid";
import { PostViewer } from "../PostViewer/PostViewer";
import { PoolPanel } from "../Pool/PoolPanel";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface CollectionsPanelProps {
  site: Site;
  onClose: () => void;
  onSearch: (query: string) => void;
  onOpenProfile: (userId: number) => void;
  onOpenArtist: (tag: string) => void;
  onOpenWiki: (tag: string) => void;
}

/** Full-screen overlay for purely-local post collections (state/collectionsStore.ts). Grouped by
 *  a freeform `category` label; each has an optional auto-download folder that newly-added posts
 *  get queued to. No e621 account needed. */
export function CollectionsPanel({
  site,
  onClose,
  onSearch,
  onOpenProfile,
  onOpenArtist,
  onOpenWiki,
}: CollectionsPanelProps) {
  const collections = useCollectionsStore((s) => s.collections);
  const create = useCollectionsStore((s) => s.create);
  const remove = useCollectionsStore((s) => s.remove);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const selected = collections.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedId === null) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selectedId]);

  // Group by category, "" last as "Uncategorized". Categories sorted alphabetically.
  const groups = useMemo(() => {
    const byCat = new Map<string, Collection[]>();
    for (const c of collections) {
      const key = c.category.trim();
      const list = byCat.get(key);
      if (list) list.push(c);
      else byCat.set(key, [c]);
    }
    return [...byCat.entries()]
      .sort(([a], [b]) => {
        if (a === "") return 1;
        if (b === "") return -1;
        return a.localeCompare(b);
      })
      .map(([cat, list]) => ({
        cat: cat || "Uncategorized",
        list: [...list].sort((x, y) => x.title.localeCompare(y.title)),
      }));
  }, [collections]);

  async function submitNew() {
    const t = newTitle.trim();
    if (!t) return;
    const c = await create(t, newCategory);
    if (c) {
      setCreating(false);
      setNewTitle("");
      setNewCategory("");
    }
  }

  if (selected) {
    return (
      <CollectionGridView
        site={site}
        collection={selected}
        onBack={() => setSelectedId(null)}
        onSearch={onSearch}
        onOpenProfile={onOpenProfile}
        onOpenArtist={onOpenArtist}
        onOpenWiki={onOpenWiki}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <Library size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">Collections</h1>
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
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitNew()}
                placeholder="Collection title"
                className="w-full rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                           bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitNew()}
                placeholder="Category (optional)"
                list="collection-categories"
                className="w-full rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                           bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
              <datalist id="collection-categories">
                {[...new Set(collections.map((c) => c.category).filter(Boolean))].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <div className="flex items-center justify-end gap-2">
                <Button onClick={() => setCreating(false)}>Cancel</Button>
                <Button onClick={() => void submitNew()} disabled={!newTitle.trim()} icon={<Plus size={13} />}>
                  Create
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setCreating(true)} icon={<Plus size={13} />} className="self-start">
              New collection
            </Button>
          )}

          {collections.length === 0 ? (
            <EmptyState
              className="!h-auto py-12"
              icon={<Library />}
              title="No collections yet"
              hint="Collections are local groups of posts. Create one, then add posts from the viewer or the multi-select bar."
            />
          ) : (
            groups.map((g) => (
              <div key={g.cat} className="flex flex-col gap-1.5">
                <h2 className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-50">{g.cat}</h2>
                {g.list.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-[var(--radius-md)] border border-black/10
                               dark:border-white/10 px-3 py-2.5 transition-colors hover:border-[rgb(var(--accent))]/50
                               hover:bg-[rgb(var(--accent))]/5"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="flex-1 truncate text-sm font-medium">{c.title}</span>
                      {c.autoDownloadFolder && (
                        <FolderDown size={12} className="shrink-0 opacity-50" />
                      )}
                      <span className="shrink-0 text-xs opacity-60 tabular-nums">{c.postIds.length}</span>
                    </button>
                    {confirmDelete === c.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          void remove(c.id);
                          setConfirmDelete(null);
                        }}
                        className="shrink-0 rounded px-1.5 py-1 text-xs font-semibold text-red-500 hover:bg-red-500/10"
                      >
                        Delete?
                      </button>
                    ) : (
                      <IconButton
                        onClick={() => setConfirmDelete(c.id)}
                        title="Delete collection"
                        className="shrink-0 !p-1"
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CollectionGridView({
  site,
  collection,
  onBack,
  onSearch,
  onOpenProfile,
  onOpenArtist,
  onOpenWiki,
}: {
  site: Site;
  collection: Collection;
  onBack: () => void;
  onSearch: (query: string) => void;
  onOpenProfile: (userId: number) => void;
  onOpenArtist: (tag: string) => void;
  onOpenWiki: (tag: string) => void;
}) {
  const { data: posts, isLoading, isError } = useCollectionPostsQuery(site, collection.postIds);
  const update = useCollectionsStore((s) => s.update);
  const removePost = useCollectionsStore((s) => s.removePost);
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

  async function pickAutoFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      void update(collection.id, { autoDownloadFolder: selected });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <IconButton onClick={onBack} title="Back to collections">
          <ChevronLeft size={18} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{collection.title}</h1>
          <p className="text-xs opacity-60">
            {collection.postIds.length} {collection.postIds.length === 1 ? "post" : "posts"}
            {collection.category ? ` · ${collection.category}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void pickAutoFolder()}
          title="Newly-added posts are auto-queued for download to this folder"
          className="flex max-w-[280px] items-center gap-1.5 rounded-[var(--radius-sm)] border border-black/10
                     dark:border-white/10 px-2 py-1 text-xs hover:border-[rgb(var(--accent))]/50"
        >
          <FolderDown size={13} className="shrink-0" />
          <span className="truncate">
            {collection.autoDownloadFolder
              ? collection.autoDownloadFolder
              : "Set auto-download folder"}
          </span>
        </button>
        {collection.autoDownloadFolder && (
          <IconButton
            onClick={() => void update(collection.id, { autoDownloadFolder: null })}
            title="Clear auto-download folder"
            className="!p-1"
          >
            <X size={14} />
          </IconButton>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
            <Spinner size={15} />
            Loading…
          </div>
        ) : isError || !posts ? (
          <div className="flex h-full items-center justify-center text-sm text-red-500">
            Failed to load collection.
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<Library />}
            title="This collection is empty"
            hint="Add posts to it from the viewer's collection button or the multi-select bar."
          />
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
          onOpenWiki={onOpenWiki}
          onOpenPool={setNestedPoolId}
          slideshowActive={false}
          onToggleSlideshow={() => {}}
          extraToolbarActions={(post) => (
            <IconButton
              tone="invert"
              title="Remove from this collection"
              onClick={() => void removePost(collection.id, post.id)}
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
          onOpenWiki={onOpenWiki}
        />
      )}
    </div>
  );
}
