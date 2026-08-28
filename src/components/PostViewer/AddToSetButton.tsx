import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FolderPlus, Plus } from "lucide-react";
import type { Site } from "../../models/site";
import { deriveShortname, isValidShortname } from "../../models/postSet";
import { useUserProfileQuery } from "../../queries/useUserProfileQuery";
import { useMyPostSetsQuery, usePostSetMutations } from "../../queries/usePostSets";
import { errorMessage } from "../../lib/errors";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface AddToSetButtonProps {
  site: Site;
  postId: number;
  isAuthenticated: boolean;
}

/** Toolbar popover: add the current post to one of your post sets, or make a new set for it.
 *  Same outside-click/Escape convention as ReportPostButton. */
export function AddToSetButton({ site, postId, isAuthenticated }: AddToSetButtonProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [added, setAdded] = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const { data: me } = useUserProfileQuery(site, "me", isAuthenticated && open);
  const { data: sets, isLoading } = useMyPostSetsQuery(site, open ? me?.id : undefined);
  const { addPosts, create } = usePostSetMutations(site);

  // Reset the per-post "added" markers when navigating to a different post.
  useEffect(() => {
    setAdded(new Set());
    setCreating(false);
    setNewName("");
  }, [postId]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const shortname = useMemo(() => deriveShortname(newName), [newName]);

  function addTo(setId: number) {
    addPosts.mutate(
      { setId, postIds: [postId] },
      { onSuccess: () => setAdded((s) => new Set(s).add(setId)) },
    );
  }

  function submitNew() {
    const name = newName.trim();
    if (!name || !isValidShortname(shortname) || create.isPending) return;
    create.mutate(
      { name, shortname, description: "", isPublic: false },
      {
        onSuccess: (set) => {
          setCreating(false);
          setNewName("");
          addTo(set.id);
        },
      },
    );
  }

  return (
    <div className="relative" ref={ref}>
      <IconButton
        tone="invert"
        disabled={!isAuthenticated}
        title={isAuthenticated ? "Add to set" : "Sign in (Settings) to use sets"}
        onClick={() => setOpen((v) => !v)}
      >
        <FolderPlus size={16} />
      </IconButton>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-64 animate-[scale-in_100ms_ease-out] origin-top-right
                     rounded-[var(--radius-md)] border border-white/10 bg-[rgb(28,28,28)] p-2 text-xs text-white shadow-xl shadow-black/20"
        >
          <p className="px-1 py-1 font-semibold uppercase tracking-wide opacity-60">Add to set</p>

          <div className="max-h-56 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 px-1 py-2 opacity-60">
                <Spinner size={11} />
                Loading sets…
              </div>
            ) : !sets || sets.length === 0 ? (
              <p className="px-1 py-2 opacity-60">No sets yet.</p>
            ) : (
              sets.map((set) => {
                const has = added.has(set.id) || set.post_ids.includes(postId);
                return (
                  <button
                    key={set.id}
                    type="button"
                    disabled={has || addPosts.isPending}
                    onClick={() => addTo(set.id)}
                    className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1.5 text-left
                               hover:bg-white/10 disabled:opacity-50"
                  >
                    <span className="truncate">{set.name}</span>
                    {has ? (
                      <Check size={13} className="shrink-0 text-green-400" />
                    ) : (
                      <Plus size={13} className="shrink-0 opacity-60" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {addPosts.isError && (
            <p className="px-1 py-1 text-red-400">{errorMessage(addPosts.error, "Failed to add.")}</p>
          )}

          <div className="mt-1 border-t border-white/10 pt-1">
            {creating ? (
              <div className="flex flex-col gap-1 p-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitNew()}
                  placeholder="New set name"
                  className="w-full rounded border border-white/10 bg-black/20 px-1.5 py-1 text-[11px]
                             outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
                {newName.trim() && !isValidShortname(shortname) && (
                  <span className="text-[10px] text-amber-400">
                    Name needs at least 3 letters/numbers.
                  </span>
                )}
                {create.isError && (
                  <span className="text-[10px] text-red-400">
                    {errorMessage(create.error, "Failed to create set.")}
                  </span>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setCreating(false)} className="rounded px-2 py-1 hover:bg-white/10">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitNew}
                    disabled={!newName.trim() || !isValidShortname(shortname) || create.isPending}
                    className="flex items-center gap-1 rounded bg-[rgb(var(--accent))]/25 px-2 py-1 font-semibold
                               text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/40 disabled:opacity-40"
                  >
                    {create.isPending && <Spinner size={10} />}
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
                New set…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
