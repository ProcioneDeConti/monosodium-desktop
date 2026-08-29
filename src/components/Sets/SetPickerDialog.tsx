import { useEffect, useMemo, useState } from "react";
import { Check, Plus, SquareStack, X } from "lucide-react";
import type { Site } from "../../models/site";
import { deriveShortname, isValidShortname } from "../../models/postSet";
import { useUserProfileQuery } from "../../queries/useUserProfileQuery";
import { useMyPostSetsQuery, usePostSetMutations } from "../../queries/usePostSets";
import { errorMessage } from "../../lib/errors";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface SetPickerDialogProps {
  site: Site;
  postIds: number[];
  onClose: () => void;
}

/** Centered modal: add a batch of posts to one of your sets (one `add_posts` call - e621 takes
 *  the whole array), or make a new set for them. Used by the grid's multi-select bar. */
export function SetPickerDialog({ site, postIds, onClose }: SetPickerDialogProps) {
  const { data: me } = useUserProfileQuery(site, "me");
  const { data: sets, isLoading } = useMyPostSetsQuery(site, me?.id);
  const { addPosts, create } = usePostSetMutations(site);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [addedTo, setAddedTo] = useState<number | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const shortname = useMemo(() => deriveShortname(newName), [newName]);

  function addTo(setId: number) {
    addPosts.mutate({ setId, postIds }, { onSuccess: () => setAddedTo(setId) });
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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-sm animate-[scale-in_120ms_ease-out] flex-col
                   rounded-[var(--radius-md)] border border-black/10 dark:border-white/10
                   bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <SquareStack size={15} className="text-[rgb(var(--accent))]" />
          <h2 className="text-sm font-semibold">
            Add {postIds.length} {postIds.length === 1 ? "post" : "posts"} to set
          </h2>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={16} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm opacity-60">
              <Spinner size={12} />
              Loading sets…
            </div>
          ) : !sets || sets.length === 0 ? (
            <p className="px-2 py-3 text-sm opacity-60">No sets yet - create one below.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {sets.map((set) => (
                <li key={set.id}>
                  <button
                    type="button"
                    disabled={addPosts.isPending}
                    onClick={() => addTo(set.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-2
                               text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                  >
                    <span className="truncate">{set.name}</span>
                    {addedTo === set.id ? (
                      <Check size={14} className="shrink-0 text-green-500" />
                    ) : (
                      <Plus size={14} className="shrink-0 opacity-50" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {addPosts.isError && (
            <p className="px-2 py-1 text-xs text-red-500">
              {errorMessage(addPosts.error, "Failed to add.")}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-black/10 dark:border-white/10 p-2">
          {creating ? (
            <div className="flex flex-col gap-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitNew()}
                placeholder="New set name"
                className="w-full rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                           bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
              {newName.trim() && !isValidShortname(shortname) && (
                <span className="text-xs text-amber-500">Needs 3+ chars, at least one letter.</span>
              )}
              {create.isError && (
                <span className="text-xs text-red-500">
                  {errorMessage(create.error, "Failed to create set.")}
                </span>
              )}
              <div className="flex items-center justify-end gap-2 text-sm">
                <button type="button" onClick={() => setCreating(false)} className="rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitNew}
                  disabled={!newName.trim() || !isValidShortname(shortname) || create.isPending}
                  className="flex items-center gap-1 rounded bg-[rgb(var(--accent))]/20 px-2 py-1 font-semibold
                             text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/30 disabled:opacity-40"
                >
                  {create.isPending && <Spinner size={11} />}
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
              New set…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
