import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Download, DownloadCloud, ListChecks, RefreshCw, Trash2, X } from "lucide-react";
import {
  e621Api,
  type RecoverProgress,
  type RecoveredImage,
  type RecoveredSet,
  type RecoveryGrade,
} from "../../api/client";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import type { PostNote } from "../../models/note";
import { useSettingsStore } from "../../state/settingsStore";
import { searchedOn, useRecoveredStore } from "../../state/recoveredStore";
import { mascotReact } from "../../state/mascotStore";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { ZoomableImage } from "./ZoomableImage";
import { RecoveryReport } from "./RecoveryReport";
import { toRecoverFailure, type RecoverFailure } from "../../lib/recoveryReport";
import { VideoPlayer } from "./VideoPlayer";

const GRADE_TITLE: Record<RecoveryGrade, string> = {
  exact: "Exact match - identical to the original file",
  same_dimensions: "Same dimensions - re-encoded or edited copy",
  rescaled: "Different resolution - the same image, not the original file",
  mismatch: "Doesn't match the original's shape - may be a different image",
};

const GRADE_SHORT: Record<RecoveryGrade, string> = {
  exact: "Exact",
  same_dimensions: "Same size",
  rescaled: "Rescaled",
  mismatch: "Mismatch",
};

const GRADE_STYLE: Record<RecoveryGrade, string> = {
  exact: "font-medium text-green-300",
  same_dimensions: "font-medium text-lime-300",
  rescaled: "font-medium text-amber-300",
  mismatch: "font-medium text-red-300",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function extOf(item: RecoveredImage): string {
  return item.file.split(".").pop() ?? "bin";
}

function dimsLabel(item: RecoveredImage): string {
  return item.is_video ? extOf(item) : `${item.width}x${item.height}`;
}

const overlayButton =
  "pointer-events-auto flex h-7 items-center gap-1 rounded-[var(--radius-sm)] bg-black/60 px-2 text-xs text-white/85 hover:bg-black/80 disabled:opacity-50";

interface DeletedPostRecoveryProps {
  post: Post;
  site: Site;
  notes?: PostNote[];
}

/** Viewer body for a deleted post. e621 keeps a deleted post's `sources` but not its file, so a
 *  manual button asks the backend to try each source (site lookups, the page's image, then the
 *  Wayback Machine). Strictly opt-in: nothing touches third-party sites until the user clicks.
 *  Results are cached on disk by the backend (src-tauri/src/recovered.rs), so a post recovered
 *  before opens straight from the cache - no network - and shows in the grid as a thumbnail
 *  (state/recoveredStore.ts). When more than one usable file turned up, a strip along the bottom
 *  lists them (best match first) and the user's pick is remembered. State lives here, so it resets
 *  when the viewer's `key={post.id}` wrapper remounts on navigation; leaving mid-search cancels it. */
export function DeletedPostRecovery({ post, site, notes }: DeletedPostRecoveryProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The structured "nothing found" report behind `error`, when the search ran to the end.
  const [failure, setFailure] = useState<RecoverFailure | null>(null);
  // The report card over a recovered post: starts closed (the image is the point); the Report
  // button opens it, its × closes it.
  const [showReport, setShowReport] = useState(false);
  const [set, setSet] = useState<RecoveredSet | null>(null);
  const [displayFailed, setDisplayFailed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "done" | "err">("idle");
  // An earlier search that found nothing (unix seconds), so the panel can say so.
  const [notFoundAt, setNotFoundAt] = useState<number | null>(null);
  const runToken = useRef<number | null>(null);
  const setThumb = useRecoveredStore((s) => s.setThumb);
  const videoLoopEnabled = useSettingsStore((s) => s.videoLoopEnabled);
  const videoPlaybackSpeed = useSettingsStore((s) => s.videoPlaybackSpeed);
  const videoAutoplayEnabled = useSettingsStore((s) => s.videoAutoplayEnabled);
  const downloadDir = useSettingsStore((s) => s.downloadDir);

  const hasWebSource = post.sources.some((s) => /^https?:\/\//.test(s.trim()));
  // Even with no sources, the md5 e621 keeps can find an identical file on other boorus or an
  // archived copy of e621's own file.
  const hasMd5 = /^[0-9a-f]{32}$/i.test(post.file.md5?.trim() ?? "");
  const canSearch = hasWebSource || hasMd5;

  // A cached recovery opens immediately.
  useEffect(() => {
    let alive = true;
    e621Api
      .getRecovered(site, post.id)
      .then((cached) => {
        if (!alive || !cached) return;
        if (cached.items.length > 0) setSet(cached);
        else {
          setNotFoundAt(cached.not_found_at);
          // A cached miss shows its report again (no error banner - it's history, not news).
          if (cached.report) {
            setFailure({ message: "No copy found.", cancelled: false, no_sources: false, attempts: cached.report.attempts });
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [site, post.id]);

  // Leaving the post (or closing the viewer) mid-search stops it.
  useEffect(
    () => () => {
      if (runToken.current != null) void e621Api.cancelRecovery(runToken.current);
    },
    [],
  );

  useEffect(() => {
    if (saveState !== "done" && saveState !== "err") return;
    const t = setTimeout(() => setSaveState("idle"), 1600);
    return () => clearTimeout(t);
  }, [saveState]);

  function publishThumb(next: RecoveredSet | null) {
    const pick = next?.items.find((i) => i.file === next.selected) ?? next?.items[0];
    setThumb(site, post.id, pick ? { path: pick.path, is_video: pick.is_video, not_found_at: null } : null);
  }

  async function recover() {
    const token = Math.floor(Math.random() * 2 ** 31);
    runToken.current = token;
    setLoading(true);
    setError(null);
    setFailure(null);
    setStatus("Fetching post from source");
    setLog([]);
    mascotReact("recoverStart");
    const onProgress = (p: RecoverProgress) => {
      setStatus(p.message);
      // Only outcomes go in the history; transient "downloading"/"comparing" lines just replace the status.
      if (p.stage === "scored" || p.stage === "failed") setLog((l) => [...l, p.message]);
    };
    try {
      const found = await e621Api.recoverFromSources(site, post.id, post.sources, post.file, token, onProgress);
      setDisplayFailed(false);
      setSet(found);
      publishThumb(found);
      mascotReact(found.items[0]?.grade === "exact" ? "recoverExact" : "recoverFound");
    } catch (e) {
      const f = toRecoverFailure(e);
      if (!f.cancelled) {
        setError(f.message);
        setFailure(f.attempts.length > 0 || f.no_sources ? f : null);
        mascotReact("recoverFail");
        // The backend recorded the miss (unless older copies are cached, which stay shown).
        if (!set || set.items.length === 0) {
          const at = Math.floor(Date.now() / 1000);
          setNotFoundAt(at);
          setThumb(site, post.id, { path: null, is_video: false, not_found_at: at });
        }
      }
    } finally {
      runToken.current = null;
      setLoading(false);
      setStatus(null);
    }
  }

  function cancel() {
    if (runToken.current != null) void e621Api.cancelRecovery(runToken.current);
  }

  function select(file: string) {
    if (!set) return;
    const next = { ...set, selected: file };
    setSet(next);
    setDisplayFailed(false);
    publishThumb(next);
    void e621Api.selectRecovered(site, post.id, file).catch(() => {});
  }

  async function save(item: RecoveredImage) {
    setSaveState("saving");
    try {
      await e621Api.saveRecoveredFile(site, post.id, item.file, `e621_${post.id}_recovered.${extOf(item)}`, downloadDir);
      setSaveState("done");
    } catch {
      setSaveState("err");
    }
  }

  async function forget() {
    await e621Api.forgetRecovered(site, post.id).catch(() => {});
    setSet(null);
    setError(null);
    setFailure(null);
    publishThumb(null);
    setShowReport(false);
  }

  const candidates = set?.items ?? [];
  const recovered = candidates.find((c) => c.file === set?.selected) ?? candidates[0];

  const progressPanel = loading && (
    <div className="flex max-w-xl flex-col items-center gap-1 text-xs text-white/60">
      {status && <p aria-live="polite">{status}</p>}
      {log.slice(-5).map((line, i) => (
        <p key={i} className="break-all text-white/40">
          {line}
        </p>
      ))}
    </div>
  );

  if (recovered) {
    const host = hostOf(recovered.source_url);
    const src = convertFileSrc(recovered.path);
    return (
      <div className="relative h-full w-full">
        {recovered.is_video ? (
          <VideoPlayer
            key={recovered.file}
            src={src}
            loopDefault={videoLoopEnabled}
            speedDefault={videoPlaybackSpeed}
            autoplayEnabled={videoAutoplayEnabled}
          />
        ) : (
          <ZoomableImage
            key={recovered.file}
            src={src}
            alt={`Post ${post.id} (recovered)`}
            site={site}
            notes={notes}
            imageWidth={post.file.width}
            imageHeight={post.file.height}
            onError={() => setDisplayFailed(true)}
          />
        )}
        {displayFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center text-sm text-white/70">
            <p>Recovered the file, but the viewer couldn't display it.</p>
            <p className="max-w-xl break-all text-xs text-white/50">
              {recovered.mime} - {(recovered.size_bytes / 1024).toFixed(0)} KB - {recovered.image_url}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[60%] flex-col items-start gap-2">
        <div className="max-w-full rounded-[var(--radius-sm)] bg-black/60 px-2 py-1 text-xs text-white/80">
          <div className={GRADE_STYLE[recovered.grade]}>{GRADE_TITLE[recovered.grade]}</div>
          <div>
            Deleted post - recovered from {host}
            {recovered.via_archive ? " via the Wayback Machine" : ""}.
          </div>
          {recovered.notes.length > 0 && <div className="text-white/60">{recovered.notes.join("; ")}</div>}
          {candidates.length > 1 && (
            <div className="text-white/60">
              File {candidates.indexOf(recovered) + 1} of {candidates.length} found - pick another below.
            </div>
          )}
          {error && <div className="whitespace-pre-wrap break-all text-red-300/80">{error.split("\n")[0]}</div>}
        </div>
        {showReport && set && !loading && <RecoveryReport set={set} onClose={() => setShowReport(false)} />}
        </div>
        <div className="pointer-events-none absolute right-14 top-3 flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            {!loading && (
              <button
                type="button"
                onClick={() => setShowReport((v) => !v)}
                className={`${overlayButton} ${showReport ? "!bg-white/20" : ""}`}
                title={showReport ? "Hide the search report" : "Show where the search looked and what it found"}
              >
                <ListChecks size={12} /> Report
              </button>
            )}
            {loading ? (
              <button type="button" onClick={cancel} className={overlayButton} title="Stop searching">
                <Spinner size={12} /> Cancel
              </button>
            ) : (
              canSearch && (
                <button
                  type="button"
                  onClick={() => void recover()}
                  className={overlayButton}
                  title="Search the sources again (keeps what's already been found)"
                >
                  <RefreshCw size={12} /> Search again
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => void save(recovered)}
              disabled={saveState === "saving"}
              className={`${overlayButton} ${saveState === "done" ? "!text-green-300" : saveState === "err" ? "!text-red-300" : ""}`}
              title="Save this file to your download folder"
            >
              <Download size={12} /> {saveState === "done" ? "Saved" : saveState === "err" ? "Failed" : "Download"}
            </button>
            <button
              type="button"
              onClick={() => void forget()}
              disabled={loading}
              className={overlayButton}
              title="Delete the recovered files for this post from the cache"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
          {loading && <div className="rounded-[var(--radius-sm)] bg-black/70 p-2">{progressPanel}</div>}
        </div>
        {candidates.length > 1 && (
          <div className="absolute inset-x-0 bottom-0 flex gap-2 overflow-x-auto bg-black/70 p-2">
            {candidates.map((c) => (
              <button
                key={c.file}
                type="button"
                onClick={() => select(c.file)}
                title={`${GRADE_TITLE[c.grade]}
${dimsLabel(c)} ${c.mime.replace(/^(image|video)\//, "")} from ${hostOf(c.source_url)}${c.via_archive ? " (Wayback Machine)" : ""}${
                  c.notes.length > 0
                    ? `
${c.notes.join("; ")}`
                    : ""
                }`}
                className={`flex shrink-0 flex-col items-center gap-1 rounded-[var(--radius-sm)] p-1 text-[11px] ${
                  c === recovered ? "bg-white/15 ring-2 ring-[rgb(var(--accent))]" : "hover:bg-white/10"
                }`}
              >
                {c.is_video ? (
                  <video
                    src={convertFileSrc(c.path)}
                    muted
                    preload="metadata"
                    className="h-16 w-auto max-w-[8rem] object-contain"
                  />
                ) : (
                  <img src={convertFileSrc(c.path)} alt="" className="h-16 w-auto max-w-[8rem] object-contain" />
                )}
                <span className={GRADE_STYLE[c.grade]}>{GRADE_SHORT[c.grade]}</span>
                <span className="text-white/50">{dimsLabel(c)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/60">
      <p>This post has been deleted.</p>
      {notFoundAt != null && !loading && !error && !failure && (
        <p className="text-xs text-white/45">Searched {searchedOn(notFoundAt)} - no copy was found anywhere.</p>
      )}
      {canSearch ? (
        <div className="flex gap-2">
          <Button
            onClick={() => void recover()}
            disabled={loading}
            icon={loading ? <Spinner size={14} /> : <DownloadCloud size={14} />}
          >
            {loading
              ? "Recovering…"
              : notFoundAt != null
                ? "Search again"
                : hasWebSource
                  ? "Try to load from source"
                  : "Search for a copy"}
          </Button>
          {loading && (
            <Button onClick={cancel} icon={<X size={14} />}>
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs">It has no web sources and no file checksum to search with.</p>
      )}
      {canSearch && !hasWebSource && !loading && (
        <p className="max-w-md text-xs text-white/45">
          No sources are listed, so this looks for an identical file on other sites by its checksum,
          and for an archived copy of e621's own file.
        </p>
      )}
      {progressPanel}
      {failure ? (
        <RecoveryReport failure={failure} />
      ) : (
        error && <pre className="max-w-xl whitespace-pre-wrap break-all text-xs text-red-300/80">{error}</pre>
      )}
    </div>
  );
}
