import { useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { CheckCircle2, Circle, FileUp, Film, Link2, TriangleAlert, Upload, X, XCircle } from "lucide-react";
import { Spinner } from "../ui/Spinner";
import type { Site } from "../../models/site";
import type { UploadResult } from "../../models/upload";
import { e621Api } from "../../api/client";
import { errorMessage } from "../../lib/errors";
import {
  artistTags,
  buildChecklist,
  canSubmit,
  implicationClosure,
  resolveTags,
  type CheckItem,
  type CheckStatus,
} from "../../lib/uploadChecks";
import {
  toAsync,
  useDnpCheck,
  useIqdb,
  useMd5Duplicate,
  useUploadFile,
  useUploadPreviewImage,
  useUploadTags,
  type UploadSource,
} from "../../queries/useUploadChecks";
import { useUserProfileQuery } from "../../queries/useUserProfileQuery";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Overlay, type OverlayHandle } from "../ui/Overlay";
import { UploadTagInput } from "./UploadTagInput";

interface UploadPanelProps {
  site: Site;
  /** A file dropped onto the window while the panel is open (App.tsx's drag-drop listener). */
  droppedPath: string | null;
  onClose: () => void;
  onOpenPost: (id: number) => void;
}

const RATINGS = [
  { value: "s", label: "Safe", color: "#3e9e49" },
  { value: "q", label: "Questionable", color: "#d6b100" },
  { value: "e", label: "Explicit", color: "#e45f5f" },
] as const;

interface Draft {
  mode: "file" | "url";
  source: UploadSource;
  urlDraft: string;
  tags: string[];
  rating: "s" | "q" | "e" | null;
  sources: string;
  description: string;
  parentId: string;
  asPending: boolean;
}
const EMPTY_DRAFT: Draft = {
  mode: "file",
  source: null,
  urlDraft: "",
  tags: [],
  rating: null,
  sources: "",
  description: "",
  parentId: "",
  asPending: false,
};
/** Survives the panel unmounting for the rest of the session; cleared after a successful upload. */
let draft: Draft = EMPTY_DRAFT;

const UPLOAD_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "webm", "mp4"];

/** Full-screen e621 uploader. Left: file/URL, tags, rating, sources, details. Right: the
 *  compliance checklist (lib/uploadChecks.ts) - every line has to go green (or amber, for the
 *  advisory ones) before Submit unlocks. e621 only; App.tsx only offers it there, signed in. */
export function UploadPanel({ site, droppedPath, onClose, onOpenPost }: UploadPanelProps) {
  const overlay = useRef<OverlayHandle>(null);
  const [mode, setMode] = useState<"file" | "url">(draft.mode);
  const [source, setSource] = useState<UploadSource>(draft.source);
  const [urlDraft, setUrlDraft] = useState(draft.urlDraft);
  const [tags, setTags] = useState<string[]>(draft.tags);
  const [rating, setRating] = useState<"s" | "q" | "e" | null>(draft.rating);
  const [sources, setSources] = useState(draft.sources);
  const [description, setDescription] = useState(draft.description);
  const [parentId, setParentId] = useState(draft.parentId);
  const [asPending, setAsPending] = useState(draft.asPending);
  // Keep the form across close/reopen (e.g. checking a duplicate post from the checklist).
  useEffect(() => {
    draft = { mode, source, urlDraft, tags, rating, sources, description, parentId, asPending };
  }, [mode, source, urlDraft, tags, rating, sources, description, parentId, asPending]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (droppedPath) {
      setMode("file");
      setSource({ kind: "file", path: droppedPath });
    }
  }, [droppedPath]);

  // --- checks ---
  const fileQ = useUploadFile(source);
  const file = fileQ.data;
  const previewQ = useUploadPreviewImage(file?.ext && !["webm", "mp4"].includes(file.ext) ? file.path : undefined);
  const md5Q = useMd5Duplicate(site, file?.md5);
  const md5Clear = md5Q.status === "success" && md5Q.data === null;
  const iqdbQ = useIqdb(site, file?.path, md5Clear);
  const { query: tagsQ, settled } = useUploadTags(site, tags);
  const resolved = useMemo(() => resolveTags(tags, tagsQ.data?.preview), [tags, tagsQ.data]);
  const edges = useMemo(() => tagsQ.data?.edges ?? new Map<string, string[]>(), [tagsQ.data]);
  const artists = useMemo(() => (settled && tagsQ.isSuccess ? artistTags(resolved) : []), [resolved, settled, tagsQ.isSuccess]);
  const dnpQ = useDnpCheck(site, artists);
  const { data: me } = useUserProfileQuery(site, "me");

  const implied = useMemo(() => {
    const out = new Set<string>();
    for (const r of resolved)
      for (const t of implicationClosure(r.canonical, edges)) if (t !== r.canonical) out.add(t);
    return out;
  }, [resolved, edges]);

  const sourceLines = sources.split("\n").map((s) => s.trim()).filter(Boolean);
  const checklist = buildChecklist({
    file: toAsync(fileQ, source !== null),
    md5Match: toAsync(md5Q, !!file),
    iqdb: toAsync(iqdbQ, md5Clear),
    tags: resolved,
    previewState: !settled && tags.length ? { state: "loading" } : toAsync(tagsQ, tags.length > 0),
    edges,
    dnp: toAsync(dnpQ, artists.length > 0),
    rating,
    sources: sourceLines,
    uploadSlots: me?.upload_slots ?? null,
  });
  const ready = canSubmit(checklist) && !submitting;

  async function pickFile() {
    const picked = await openDialog({ multiple: false, filters: [{ name: "Media", extensions: UPLOAD_EXTS }] });
    if (typeof picked === "string") setSource({ kind: "file", path: picked });
  }

  async function submit() {
    if (!ready || !rating || !source) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const pid = parseInt(parentId.replace(/\D/g, ""), 10);
      const res = await e621Api.uploadSubmit(site, {
        file_path: source.kind === "file" ? source.path : null,
        direct_url: source.kind === "url" ? source.url : null,
        tag_string: resolved.map((r) => r.input).join(" "),
        rating,
        source: sourceLines.join("\n"),
        description,
        parent_id: Number.isFinite(pid) ? pid : null,
        as_pending: asPending,
      });
      setResult(res);
      if (res.kind === "ok") draft = EMPTY_DRAFT;
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setSource(null);
    setUrlDraft("");
    setTags([]);
    setRating(null);
    setSources("");
    setDescription("");
    setParentId("");
    setAsPending(false);
    setResult(null);
  }

  const isVideo = file && ["webm", "mp4"].includes(file.ext);
  const md5Dup = md5Q.data;

  return (
    <Overlay ref={overlay} onClose={onClose} variant="sheet" className="relative">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <Upload size={16} className="opacity-70" />
        <h1 className="text-sm font-semibold">Upload to e621</h1>
        <IconButton onClick={() => overlay.current?.close()} title="Close (Esc)" className="ml-auto">
          <X size={18} />
        </IconButton>
      </div>

      {result?.kind === "ok" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <CheckCircle2 size={48} className="text-green-500" />
          <div className="text-lg font-semibold">Uploaded as post #{result.post_id}</div>
          <div className="flex gap-2">
            <Button onClick={() => onOpenPost(result.post_id)}>Open post</Button>
            <Button onClick={reset}>Upload another</Button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
          {/* --- form --- */}
          <div className="min-h-0 space-y-5 overflow-y-auto p-5">
            <Field label="File">
              <div className="mb-2 flex gap-1">
                <ModeTab active={mode === "file"} onClick={() => setMode("file")} icon={<FileUp size={13} />}>
                  Local file
                </ModeTab>
                <ModeTab active={mode === "url"} onClick={() => setMode("url")} icon={<Link2 size={13} />}>
                  Direct URL
                </ModeTab>
              </div>
              {mode === "file" ? (
                <button
                  type="button"
                  onClick={pickFile}
                  className="flex w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border-2 border-dashed
                             border-black/15 px-4 py-6 text-sm opacity-80 hover:border-[rgb(var(--accent))] hover:opacity-100 dark:border-white/15"
                >
                  <FileUp size={22} className="opacity-60" />
                  {source?.kind === "file" ? (
                    <span className="max-w-full truncate font-medium">{source.path.split(/[\\/]/).pop()}</span>
                  ) : (
                    <span>Click to choose, or drop a file anywhere on this window</span>
                  )}
                  <span className="text-xs opacity-60">jpg · png · gif · webp · webm · mp4 — up to 100 MB</span>
                </button>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (urlDraft.trim()) setSource({ kind: "url", url: urlDraft.trim() });
                  }}
                >
                  <input
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="https://… (direct link to the image or video file)"
                    className={INPUT}
                  />
                  <Button disabled={!urlDraft.trim()} onClick={() => urlDraft.trim() && setSource({ kind: "url", url: urlDraft.trim() })}>
                    Fetch
                  </Button>
                </form>
              )}
              {source && (
                <div className="mt-3 flex items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-black/5 dark:bg-white/5">
                  {fileQ.isLoading ? (
                    <Spinner size={24} className="my-10" />
                  ) : previewQ.data ? (
                    <img src={previewQ.data} alt="" className="max-h-72 object-contain" />
                  ) : isVideo ? (
                    <div className="my-8 flex flex-col items-center gap-1 text-xs opacity-60">
                      <Film size={28} />
                      Video ({file?.ext})
                    </div>
                  ) : (
                    <div className="my-8 text-xs opacity-60">No preview</div>
                  )}
                </div>
              )}
            </Field>

            <Field
              label="Tags"
              hint="Needs an artist tag and at least 10 General tags that aren't implied by another tag. Faded chips are implied; dashed ones don't exist yet."
            >
              <UploadTagInput site={site} tags={tags} onChange={setTags} resolved={resolved} implied={implied} />
            </Field>

            <Field label="Rating" hint="Required - no default.">
              <div className="flex gap-2">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRating(r.value)}
                    className={`flex-1 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-semibold transition-colors ${
                      rating === r.value ? "text-white" : "border-black/10 opacity-70 hover:opacity-100 dark:border-white/10"
                    }`}
                    style={rating === r.value ? { backgroundColor: r.color, borderColor: r.color } : undefined}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Sources" hint="One URL per line - link the artist's original post.">
              <textarea value={sources} onChange={(e) => setSources(e.target.value)} rows={3} className={INPUT} />
            </Field>

            <Field label="Description" hint="Optional. DText is supported.">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={INPUT} />
            </Field>

            <div className="flex flex-wrap items-end gap-6">
              <Field label="Parent post ID">
                <input value={parentId} onChange={(e) => setParentId(e.target.value)} placeholder="optional" className={`${INPUT} w-36`} />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={asPending} onChange={(e) => setAsPending(e.target.checked)} />
                Upload as pending (for unlimited uploaders)
              </label>
            </div>
          </div>

          {/* --- checklist --- */}
          <aside className="flex min-h-0 flex-col border-l border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]">
            <div className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide opacity-50">Checklist</div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
              {checklist.map((item) => (
                <ChecklistRow key={item.id} item={item}>
                  {item.id === "md5" && md5Dup && (
                    <button type="button" className="text-xs text-[rgb(var(--accent))] hover:underline" onClick={() => onOpenPost(md5Dup.id)}>
                      View post #{md5Dup.id}
                    </button>
                  )}
                  {item.id === "iqdb" && iqdbQ.data && iqdbQ.data.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {iqdbQ.data.slice(0, 6).map((m) => (
                        <div key={m.post_id} className="w-16 text-center text-[10px]">
                          <button type="button" onClick={() => onOpenPost(m.post_id)} title={`Post #${m.post_id} (${Math.round(m.score)}%)`}>
                            {m.preview_url ? (
                              <img src={m.preview_url} alt="" className="h-16 w-16 rounded object-cover" />
                            ) : (
                              <div className="h-16 w-16 rounded bg-black/10 dark:bg-white/10" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="text-[rgb(var(--accent))] hover:underline"
                            onClick={() => setParentId(String(m.post_id))}
                          >
                            Set parent
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </ChecklistRow>
              ))}
            </ul>
            <div className="space-y-2 border-t border-black/10 p-4 dark:border-white/10">
              {result?.kind === "duplicate" && (
                <p className="text-xs text-red-500">
                  e621 says this is a duplicate
                  {result.post_id && (
                    <>
                      {" "}of{" "}
                      <button type="button" className="underline" onClick={() => onOpenPost(result.post_id!)}>
                        #{result.post_id}
                      </button>
                    </>
                  )}
                  .
                </p>
              )}
              {result?.kind === "invalid" && <p className="whitespace-pre-wrap text-xs text-red-500">{result.message}</p>}
              {submitError && <p className="text-xs text-red-500">{submitError}</p>}
              <button
                type="button"
                disabled={!ready}
                onClick={submit}
                className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[rgb(var(--accent))] px-4 py-2.5
                           text-sm font-semibold text-white transition-opacity disabled:opacity-35"
              >
                {submitting ? <Spinner size={16} /> : <Upload size={16} />}
                {submitting ? "Uploading…" : "Upload"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </Overlay>
  );
}

const INPUT =
  "w-full rounded-[var(--radius-sm)] border border-black/10 bg-white/70 px-2.5 py-1.5 text-sm outline-none " +
  "focus:ring-2 focus:ring-[rgb(var(--accent))] dark:border-white/10 dark:bg-black/30";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide opacity-60">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs opacity-50">{hint}</div>}
    </div>
  );
}

function ModeTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        active ? "bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]" : "opacity-60 hover:opacity-100"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

const STATUS_ICON: Record<CheckStatus, React.ReactNode> = {
  pass: <CheckCircle2 size={16} className="text-green-500" />,
  fail: <XCircle size={16} className="text-red-500" />,
  warn: <TriangleAlert size={16} className="text-amber-500" />,
  pending: <Circle size={16} className="opacity-30" />,
  running: <Spinner size={16} />,
};

function ChecklistRow({ item, children }: { item: CheckItem; children?: React.ReactNode }) {
  const tone =
    item.status === "pass"
      ? "bg-green-500/10"
      : item.status === "fail"
        ? "bg-red-500/10"
        : item.status === "warn"
          ? "bg-amber-500/10"
          : "";
  return (
    <li className={`flex gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 transition-colors duration-300 ${tone}`}>
      <span className="mt-0.5 shrink-0">{STATUS_ICON[item.status]}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {item.label}
          {!item.blocking && <span className="ml-1.5 text-[10px] font-normal uppercase opacity-40">advisory</span>}
        </div>
        {item.detail && <div className="whitespace-pre-wrap break-words text-xs opacity-70">{item.detail}</div>}
        {children}
      </div>
    </li>
  );
}
