import { Lock, Pin } from "lucide-react";
import type { ForumTopic } from "../../models/forum";

interface ForumTopicRowProps {
  topic: ForumTopic;
  onClick: () => void;
}

/** One topic row: sticky/lock icons, title (bold while sticky), and a "N replies · creator ·
 *  updated" meta line - matches the reference Android app's TopicRow layout and wording. */
export function ForumTopicRow({ topic, onClick }: ForumTopicRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-0.5 border-b border-black/5 dark:border-white/5 last:border-0
                 px-1 py-2.5 text-left"
    >
      <div className="flex items-center gap-1.5">
        {topic.is_sticky && <Pin size={14} className="shrink-0 text-[rgb(var(--accent))]" />}
        {topic.is_locked && <Lock size={13} className="shrink-0 opacity-60" />}
        <span className={`truncate text-sm ${topic.is_sticky ? "font-bold" : ""}`}>{topic.title || "(untitled)"}</span>
      </div>
      <p className="truncate text-xs opacity-60">
        {topic.response_count} {topic.response_count === 1 ? "reply" : "replies"} · {topic.creator_name ?? "?"}
        {topic.updated_at && ` · ${new Date(topic.updated_at).toLocaleDateString()}`}
      </p>
    </button>
  );
}
