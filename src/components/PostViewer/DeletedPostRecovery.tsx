import { useState } from "react";
import { DownloadCloud } from "lucide-react";
import { e621Api, type RecoverProgress, type RecoveredImage, type RecoveryGrade } from "../../api/client";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import type { PostNote } from "../../models/note";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { ZoomableImage } from "./ZoomableImage";

const GRADE_TITLE: Record<RecoveryGrade, string> = {
  exact: "Exact match - identical to the original file",
  same_dimensions: "Same dimensions - re-encoded or edited copy",
  rescaled: "Different resolution - the same image, not the original file",
  mismatch: "Doesn't match the original's shape - may be a different image",
};

const GRADE_STYLE: Record<RecoveryGrade, string> = {
  exact: "font-medium text-green-300",
  same_dimensions: "font-medium text-lime-300",
  rescaled: "font-medium text-amber-300",
  mismatch: "font-medium text-red-300",
};

interface DeletedPostRecoveryProps {
  post: Post;
  site: Site;
  notes?: PostNote[];
}

/** Viewer body for a deleted post. e621 keeps a deleted post's `sources` but not its file, so a
 *  manual button asks the backend to try each source (direct image, else the page's og:image).
 *  Strictly opt-in: nothing touches third-party sites until the user clicks. State lives here, so
 *  it resets when the viewer's `key={post.id}` wrapper remounts on navigation. */
export function DeletedPostRecovery({ post, site, notes }: DeletedPostRecoveryProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<RecoveredImage | null>(null);
  const [displayFailed, setDisplayFailed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const hasWebSource = post.sources.some((s) => /^https?:\/\//.test(s));

  async function recover() {
    setLoading(true);
    setError(null);
    setStatus("Fetching post from source");
    setLog([]);
    const onProgress = (p: RecoverProgress) => {
      setStatus(p.message);
      // Only outcomes go in the history; transient "downloading"/"comparing" lines just replace the status.
      if (p.stage === "scored" || p.stage === "failed") setLog((l) => [...l, p.message]);
    };
    try {
      setDisplayFailed(false);
      setRecovered(await e621Api.recoverFromSources(post.sources, post.file, onProgress));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }

  if (recovered) {
    let host = recovered.source_url;
    try {
      host = new URL(recovered.source_url).hostname;
    } catch {
      /* keep the raw string */
    }
    return (
      <div className="relative h-full w-full">
        <ZoomableImage
          src={recovered.data_url}
          alt={`Post ${post.id} (recovered)`}
          site={site}
          notes={notes}
          imageWidth={post.file.width}
          imageHeight={post.file.height}
          onError={() => setDisplayFailed(true)}
        />
        {displayFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center text-sm text-white/70">
            <p>Fetched the file, but the viewer couldn't display it.</p>
            <p className="max-w-xl break-all text-xs text-white/50">
              {recovered.mime} - {(recovered.size_bytes / 1024).toFixed(0)} KB - {recovered.image_url}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute left-3 top-3 rounded-[var(--radius-sm)] bg-black/60 px-2 py-1 text-xs text-white/80">
          <div className={GRADE_STYLE[recovered.grade]}>{GRADE_TITLE[recovered.grade]}</div>
          <div>
            Deleted post - recovered from {host}{recovered.via_archive ? " via the Wayback Machine" : ""}.
          </div>
          {recovered.notes.length > 0 && <div className="text-white/60">{recovered.notes.join("; ")}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/60">
      <p>This post has been deleted.</p>
      {hasWebSource ? (
        <Button
          onClick={() => void recover()}
          disabled={loading}
          icon={loading ? <Spinner size={14} /> : <DownloadCloud size={14} />}
        >
          {loading ? "Recovering…" : "Try to load from source"}
        </Button>
      ) : (
        <p className="text-xs">It has no web sources to recover from.</p>
      )}
      {loading && status && (
        <div className="flex max-w-xl flex-col items-center gap-1 text-xs text-white/60">
          <p aria-live="polite">{status}</p>
          {log.slice(-5).map((line, i) => (
            <p key={i} className="break-all text-white/40">{line}</p>
          ))}
        </div>
      )}
      {error && <pre className="max-w-xl whitespace-pre-wrap break-all text-xs text-red-300/80">{error}</pre>}
    </div>
  );
}
