import { useRef, useState } from "react";
import { Send } from "lucide-react";
import type { Comment } from "../../models/comment";
import type { Site } from "../../models/site";
import { useCommentsQuery } from "../../queries/useCommentsQuery";
import { useCommentMutations } from "../../queries/useCommentMutations";
import { useUserProfileQuery } from "../../queries/useUserProfileQuery";
import { useAccountStore } from "../../state/accountStore";
import { Spinner } from "../ui/Spinner";
import { IconButton } from "../ui/IconButton";
import { CommentRow } from "./CommentRow";

interface CommentsPanelProps {
  site: Site;
  postId: number;
  onOpenProfile: (userId: number) => void;
}

/** A post's comment thread - view, post, edit, delete, reply (as a DText quote - e621 comments
 *  have no native threading), report, and vote. Reached via PostViewer's Tags/Comments tab
 *  switcher. Comment bodies render as DText (components/ui/DText.tsx) app-wide, same as a
 *  profile's about/artist-info text and a post's description. */
export function CommentsPanel({ site, postId, onOpenProfile }: CommentsPanelProps) {
  const isAuthenticated = useAccountStore((s) => s.isAuthenticated(site));
  const { data: comments, isLoading, isError } = useCommentsQuery(site, postId, true);
  const { data: me } = useUserProfileQuery(site, "me", isAuthenticated);
  const mutations = useCommentMutations(site, postId);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const body = draft.trim();
    if (!body || mutations.post.isPending) return;
    mutations.post.mutate(body, { onSuccess: () => setDraft("") });
  }

  /** e621 comments aren't threaded server-side - "reply" is a client-side convenience that
   *  quotes the target comment into the compose box via DText's [quote] tag, same convention
   *  the real e621 website uses. */
  function quoteReply(comment: Comment) {
    const who = comment.creator_name ?? "Anonymous";
    const quote = `[quote]\n${who} said:\n\n${comment.body}\n[/quote]\n\n`;
    setDraft((prev) => (prev ? `${prev}\n\n${quote}` : quote));
    textareaRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
          }}
          disabled={!isAuthenticated || mutations.post.isPending}
          placeholder={isAuthenticated ? "Add a comment… (Ctrl+Enter to post)" : "Sign in (Settings) to comment"}
          rows={4}
          className="w-full resize-none rounded-[var(--radius-sm)] border border-white/10 bg-white/5 px-2 py-1.5
                     text-xs text-white placeholder:text-white/40 outline-none focus:ring-2
                     focus:ring-[rgb(var(--accent))] disabled:opacity-50"
        />
        <div className="flex items-center justify-end gap-2">
          {mutations.post.isError && <span className="text-[11px] text-red-400">Failed to post comment.</span>}
          <IconButton
            tone="invert"
            onClick={submit}
            disabled={!isAuthenticated || mutations.post.isPending || !draft.trim()}
            title="Post comment"
            className="border border-white/10"
          >
            {mutations.post.isPending ? <Spinner size={14} /> : <Send size={14} />}
          </IconButton>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size={20} className="opacity-60" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-400">Failed to load comments.</p>
      ) : comments && comments.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              site={site}
              comment={c}
              isAuthenticated={isAuthenticated}
              isOwn={me != null && c.creator_id === me.id}
              onOpenProfile={onOpenProfile}
              onReply={quoteReply}
              mutations={mutations}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm opacity-60">No comments yet.</p>
      )}
    </div>
  );
}
