import { useState } from "react";
import { Flag, Pencil, Reply, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import type { Comment } from "../../models/comment";
import type { Site } from "../../models/site";
import { useUserAvatarUrl } from "../../queries/useAvatarUrl";
import type { CommentMutations } from "../../queries/useCommentMutations";
import { Avatar } from "../ui/Avatar";
import { DText } from "../ui/DText";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface CommentRowProps {
  site: Site;
  comment: Comment;
  isAuthenticated: boolean;
  isOwn: boolean;
  onOpenProfile: (userId: number) => void;
  onReply: (comment: Comment) => void;
  mutations: CommentMutations;
}

type Mode = "view" | "editing" | "confirmDelete" | "reporting";

/** One comment: avatar/author/date header, DText-rendered body (or an inline edit textarea),
 *  and a vote/reply/edit/delete/report action row. Edit and delete only show for the signed-in
 *  account's own comments (`isOwn`, checked in CommentsPanel against `users/me.json`'s id) -
 *  moderator-level permissions aren't modeled, so a mod's ability to edit/delete anyone's comment
 *  on the real site isn't reflected here. */
export function CommentRow({
  site,
  comment,
  isAuthenticated,
  isOwn,
  onOpenProfile,
  onReply,
  mutations,
}: CommentRowProps) {
  const { data: avatarUrl } = useUserAvatarUrl(site, comment.creator_id);
  const [mode, setMode] = useState<Mode>("view");
  const [editDraft, setEditDraft] = useState(comment.body);
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);

  function saveEdit() {
    const body = editDraft.trim();
    if (!body || mutations.update.isPending) return;
    mutations.update.mutate({ commentId: comment.id, body }, { onSuccess: () => setMode("view") });
  }

  function submitReport() {
    const reason = reportReason.trim();
    if (!reason || mutations.report.isPending) return;
    mutations.report.mutate(
      { commentId: comment.id, reason },
      {
        onSuccess: () => {
          setReported(true);
          setMode("view");
        },
      },
    );
  }

  return (
    <li className="border-b border-white/5 pb-3 last:border-0">
      <div className="mb-1 flex items-center gap-2">
        <Avatar url={avatarUrl} name={comment.creator_name ?? "?"} size={22} />
        <div className="flex items-center gap-1.5 text-xs">
          {comment.creator_id != null ? (
            <button
              type="button"
              onClick={() => onOpenProfile(comment.creator_id!)}
              className="font-semibold text-[rgb(var(--accent))] hover:underline"
            >
              {comment.creator_name ?? `user #${comment.creator_id}`}
            </button>
          ) : (
            <span className="font-semibold opacity-60">Anonymous</span>
          )}
          {comment.created_at && (
            <span className="opacity-50">· {new Date(comment.created_at).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {mode === "editing" ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-[var(--radius-sm)] border border-white/10 bg-white/5 px-2 py-1.5
                       text-xs text-white outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />
          <div className="flex items-center justify-end gap-2 text-[11px]">
            {mutations.update.isError && <span className="text-red-400">Failed to save.</span>}
            <button
              type="button"
              onClick={() => {
                setMode("view");
                setEditDraft(comment.body);
              }}
              className="rounded px-2 py-1 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={mutations.update.isPending || !editDraft.trim()}
              className="flex items-center gap-1 rounded bg-[rgb(var(--accent))]/20 px-2 py-1 font-semibold
                         text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/30 disabled:opacity-40"
            >
              {mutations.update.isPending && <Spinner size={11} />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <DText text={comment.body} site={site} className="text-xs leading-relaxed opacity-90" />
      )}

      <div className="mt-1.5 flex items-center gap-1 text-white/60">
        <IconButton
          tone="invert"
          disabled={!isAuthenticated}
          title={isAuthenticated ? "Upvote" : "Sign in (Settings) to vote"}
          onClick={() => mutations.vote.mutate({ commentId: comment.id, direction: 1 })}
          className={`!p-1 ${comment.vote_by > 0 ? "!text-green-400" : ""}`}
        >
          <ThumbsUp size={12} className={comment.vote_by > 0 ? "fill-current" : ""} />
        </IconButton>
        <span className="min-w-4 text-center text-[11px] tabular-nums">{comment.score}</span>
        <IconButton
          tone="invert"
          disabled={!isAuthenticated}
          title={isAuthenticated ? "Downvote" : "Sign in (Settings) to vote"}
          onClick={() => mutations.vote.mutate({ commentId: comment.id, direction: -1 })}
          className={`!p-1 ${comment.vote_by < 0 ? "!text-red-400" : ""}`}
        >
          <ThumbsDown size={12} className={comment.vote_by < 0 ? "fill-current" : ""} />
        </IconButton>

        <IconButton
          tone="invert"
          disabled={!isAuthenticated}
          title={isAuthenticated ? "Reply (quotes this comment)" : "Sign in (Settings) to reply"}
          onClick={() => onReply(comment)}
          className="!p-1"
        >
          <Reply size={12} />
        </IconButton>

        {isOwn && mode !== "editing" && (
          <IconButton tone="invert" title="Edit" onClick={() => setMode("editing")} className="!p-1">
            <Pencil size={12} />
          </IconButton>
        )}

        {isOwn && (
          <IconButton
            tone="invert"
            title="Delete"
            onClick={() => setMode(mode === "confirmDelete" ? "view" : "confirmDelete")}
            className="!p-1"
          >
            <Trash2 size={12} />
          </IconButton>
        )}

        {!isOwn && (
          <IconButton
            tone="invert"
            disabled={!isAuthenticated || reported}
            title={!isAuthenticated ? "Sign in (Settings) to report" : reported ? "Reported" : "Report"}
            onClick={() => setMode(mode === "reporting" ? "view" : "reporting")}
            className={`!p-1 ${reported ? "!text-amber-400" : ""}`}
          >
            <Flag size={12} className={reported ? "fill-current" : ""} />
          </IconButton>
        )}
      </div>

      {mode === "confirmDelete" && (
        <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius-sm)] bg-red-500/10 px-2 py-1.5 text-[11px]">
          <span className="text-red-300">Delete this comment?</span>
          {mutations.remove.isError && <span className="text-red-400">Failed.</span>}
          <button type="button" onClick={() => setMode("view")} className="ml-auto rounded px-2 py-0.5 hover:bg-white/10">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutations.remove.mutate(comment.id)}
            disabled={mutations.remove.isPending}
            className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 font-semibold text-red-300
                       hover:bg-red-500/30 disabled:opacity-40"
          >
            {mutations.remove.isPending && <Spinner size={11} />}
            Delete
          </button>
        </div>
      )}

      {mode === "reporting" && (
        <div className="mt-1.5 flex flex-col gap-1 rounded-[var(--radius-sm)] bg-white/5 px-2 py-1.5">
          <textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Reason for reporting…"
            className="w-full resize-none rounded border border-white/10 bg-black/20 px-1.5 py-1 text-[11px]
                       text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />
          <div className="flex items-center justify-end gap-2 text-[11px]">
            {mutations.report.isError && <span className="text-red-400">Failed to report.</span>}
            <button type="button" onClick={() => setMode("view")} className="rounded px-2 py-1 hover:bg-white/10">
              Cancel
            </button>
            <button
              type="button"
              onClick={submitReport}
              disabled={mutations.report.isPending || !reportReason.trim()}
              className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 font-semibold text-red-300
                         hover:bg-red-500/30 disabled:opacity-40"
            >
              {mutations.report.isPending && <Spinner size={11} />}
              Send report
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
