import { useEffect, useState } from "react";
import { Check, Library, Plus, X } from "lucide-react";
import type { Post } from "../../models/post";
import { useCollectionsStore } from "../../state/collectionsStore";
import { useAddToCollection } from "../../state/useAddToCollection";
import { IconButton } from "../ui/IconButton";

interface CollectionPickerDialogProps {
  posts: Post[];
  onClose: () => void;
}

/** Centered modal: add a batch of posts to a local collection, or make a new one for them. Used
 *  by the grid's multi-select bar. Popover sibling for the single-post viewer case is
 *  CollectionPicker.tsx. */
export function CollectionPickerDialog({ posts, onClose }: CollectionPickerDialogProps) {
  const collections = useCollectionsStore((s) => s.collections);
  const create = useCollectionsStore((s) => s.create);
  const addToCollection = useAddToCollection();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  async function addTo(id: string) {
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
      await addTo(c.id);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-sm animate-[scale-in_120ms_ease-out] flex-col
                   rounded-[var(--radius-md)] border border-black/10 dark:border-white/10
                   bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <Library size={15} className="text-[rgb(var(--accent))]" />
          <h2 className="text-sm font-semibold">
            Add {posts.length} {posts.length === 1 ? "post" : "posts"} to collection
          </h2>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={16} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {collections.length === 0 ? (
            <p className="px-2 py-3 text-sm opacity-60">No collections yet - create one below.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {collections.map((c) => {
                const done =
                  addedTo.has(c.id) ||
                  (c.postIds.length > 0 && posts.every((p) => c.postIds.includes(p.id)));
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={done}
                      onClick={() => void addTo(c.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-2
                                 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                    >
                      <span className="truncate">
                        {c.title}
                        {c.category ? <span className="opacity-50"> · {c.category}</span> : ""}
                      </span>
                      {done ? (
                        <Check size={14} className="shrink-0 text-green-500" />
                      ) : (
                        <Plus size={14} className="shrink-0 opacity-50" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-black/10 dark:border-white/10 p-2">
          {creating ? (
            <div className="flex flex-col gap-1.5">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitNew()}
                placeholder="New collection title"
                className="w-full rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                           bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
              <div className="flex items-center justify-end gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitNew()}
                  disabled={!newTitle.trim()}
                  className="rounded bg-[rgb(var(--accent))]/20 px-2 py-1 font-semibold
                             text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/30 disabled:opacity-40"
                >
                  Create &amp; add
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm
                         hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Plus size={14} />
              New collection…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
