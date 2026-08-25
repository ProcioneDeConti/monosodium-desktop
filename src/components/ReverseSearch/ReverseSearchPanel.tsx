import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useReverseImageSearch } from "../../queries/useReverseImageSearch";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface ReverseSearchPanelProps {
  filePath: string;
  apiKey: string | null;
  onClose: () => void;
}

/** Drag-and-drop a local image file onto the window (see App.tsx's onDragDropEvent listener) to
 *  search it against SauceNAO - desktop-native, no counterpart in the reference Android app
 *  (drag-and-drop isn't a mobile interaction at all). */
export function ReverseSearchPanel({ filePath, apiKey, onClose }: ReverseSearchPanelProps) {
  const search = useReverseImageSearch();

  useEffect(() => {
    search.mutate({ apiKey, filePath });
    // Only ever runs once per panel instance (a fresh drop mounts a fresh panel) -
    // intentionally not re-running on prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const results = search.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md animate-[scale-in_150ms_ease-out] flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <h1 className="text-sm font-semibold">Reverse Image Search</h1>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={18} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {search.isPending ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
              <Spinner size={15} />
              Searching SauceNAO…
            </div>
          ) : search.isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
              <span className="max-w-xs text-center text-red-500">
                {(search.error as Error)?.message ?? "Search failed."}
              </span>
              <Button onClick={() => search.mutate({ apiKey, filePath })}>Retry</Button>
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm opacity-60">No matches found.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {results.map((r, i) => (
                <div key={i} className="flex gap-3 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 p-2">
                  {r.thumbnail && (
                    <img src={r.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tabular-nums text-[rgb(var(--accent))]">
                      {r.similarity.toFixed(1)}% match
                    </p>
                    {r.title && <p className="truncate text-sm">{r.title}</p>}
                    <div className="mt-1 flex flex-col gap-0.5">
                      {r.ext_urls.map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => void openUrl(url)}
                          className="flex items-center gap-1 truncate text-left text-xs text-[rgb(var(--accent))] hover:underline"
                        >
                          <ExternalLink size={10} className="shrink-0" />
                          <span className="truncate">{url}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
