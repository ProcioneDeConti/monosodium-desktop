import { useEffect, useRef, useState } from "react";
import { Check, FolderHeart, Plus } from "lucide-react";
import type { Post } from "../../models/post";
import { useCollectionsStore } from "../../state/collectionsStore";
import { useAddToCollection } from "../../state/useAddToCollection";
import { IconButton } from "../ui/IconButton";

interface CollectionPickerProps {
  /** The posts to add. */
  posts: Post[];
}

/** Toolbar popover: add the given post(s) to a local collection, or make a new one. No account
 *  needed. The multi-select bar uses CollectionPickerDialog instead. */
export function CollectionPicker({ posts }: CollectionPickerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const collections = useCollectionsStore((s) => s.collections);
  const create = useCollectionsStore((s) => s.create);
  const addToCollection = useAddToCollection();

  const postIds = new Set(posts.map((p) => p.id));

  useEffect(() => {
    setAddedTo(new Set());
    setCreating(false);
    setNewTitle("");
  }, [posts.map((p) => p.id).join(",")]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function add(id: string) {
    await addToCollection(id, posts);
    setAddedTo((s) => new Set(s).add(id));
  }

  async function submitNew() {
    const t = newTitle.trim();
    if (!t) return;
    const c = await create(t, "");
    if (c) {
      setCreating(false);
      setNewTitle("");
      await add(c.id);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <IconButton tone="invert" title="Add to collection" onClick={() => setOpen((v) => !v)}>
        <FolderHeart size={16} />
      </IconButton>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 animate-[scale-in_100ms_ease-out] origin-top-right rounded-[var(--radius-md)] border border-white/10 bg-[rgb(28,28,28)] p-2 text-xs text-white shadow-xl shadow-black/20">
          <p className="px-1 py-1 font-semibold uppercase tracking-wide opacity-60">
            Add {posts.length > 1 ? `${posts.length} posts` : "post"} to collection
          </p>

          <div className="max-h-56 overflow-y-auto">
            {collections.length === 0 ? (
              <p className="px-1 py-2 opacity-60">No collections yet.</p>
            ) : (
              collections.map((c) => {
                const allIn = c.postIds.length > 0 && [...postIds].every((id) => c.postIds.includes(id));
                const done = addedTo.has(c.id) || allIn;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={done}
                    onClick={() => void add(c.id)}
                    className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1.5 text-left hover:bg-white/10 disabled:opacity-50"
                  >
                    <span className="truncate">{c.title}</span>
                    {done ? <Check size={13} className="shrink-0 text-green-400" /> : <Plus size={13} className="shrink-0 opacity-60" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-1 border-t border-white/10 pt-1">
            {creating ? (
              <div className="flex flex-col gap-1 p-1">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submitNew()}
                  placeholder="Collection name"
                  className="w-full rounded border border-white/10 bg-black/20 px-1.5 py-1 text-[11px] outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setCreating(false)} className="rounded px-2 py-1 hover:bg-white/10">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitNew()}
                    disabled={!newTitle.trim()}
                    className="rounded bg-[rgb(var(--accent))]/25 px-2 py-1 font-semibold text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/40 disabled:opacity-40"
                  >
                    Create &amp; add
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left hover:bg-white/10"
              >
                <Plus size={13} />
                New collection…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
