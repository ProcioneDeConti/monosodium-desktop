import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, MessagesSquare, Search, Send, X } from "lucide-react";
import type { Site } from "../../models/site";
import type { ForumPost } from "../../models/forum";
import { errorMessage } from "../../lib/errors";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import {
  useForumPostsQuery,
  useForumReply,
  useForumSearchQuery,
  useForumTopicQuery,
  useForumTopicsQuery,
  useForumTopicTitles,
} from "../../queries/useForumQuery";
import { useAccountStore } from "../../state/accountStore";
import { useUserAvatarUrl } from "../../queries/useAvatarUrl";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";
import { ForumPostRow } from "./ForumPostRow";
import { ForumTopicRow } from "./ForumTopicRow";

/** Rough DText-tag strip for a plain-text search snippet. */
function snippet(body: string, len = 220): string {
  const plain = body
    .replace(/\[\/?[a-z][^\]]*\]/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > len ? `${plain.slice(0, len)}…` : plain;
}

interface ForumPanelProps {
  site: Site;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenProfile: (userId: number) => void;
}

type View = { type: "list" } | { type: "topic"; id: number; title: string };

/** Full-screen overlay, same shell pattern as MessagesPanel - a topics list and a topic detail
 *  view with a reply composer. Browsing is public (no e621 account needed), unlike Messages;
 *  only replying is gated on being signed in. There's no "new topic" feature here, matching the
 *  reference app: e621's API surface it was ported from only exposes reading topics and
 *  replying to existing ones (forum_posts.json), never creating a topic. */
export function ForumPanel({ site, onClose, onOpenSettings, onOpenProfile }: ForumPanelProps) {
  const [view, setView] = useState<View>({ type: "list" });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 350);

  // Stable identity (never recreated across renders) - TopicDetail depends on this in a
  // useEffect, and a fresh closure every render would otherwise re-fire that effect every time
  // ForumPanel re-renders, which calls this, which re-renders ForumPanel - an infinite loop.
  const updateTopicTitle = useCallback((title: string) => {
    setView((v) => (v.type === "topic" && v.title !== title ? { ...v, title } : v));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] justify-center bg-black/60">
      <div className="flex h-full w-full max-w-md animate-[scale-in_150ms_ease-out] flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          {view.type === "topic" && (
            <IconButton onClick={() => setView({ type: "list" })} title="Back">
              <ChevronLeft size={18} />
            </IconButton>
          )}
          <h1 className="truncate text-sm font-semibold">{view.type === "topic" ? view.title : "Forum"}</h1>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={18} />
          </IconButton>
        </div>

        {view.type === "list" && (
          <div className="shrink-0 border-b border-black/10 dark:border-white/10 px-3 py-2">
            <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-2 py-1">
              <Search size={14} className="shrink-0 opacity-50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search forum posts…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label="Clear" className="shrink-0 opacity-50 hover:opacity-100">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {view.type === "list" ? (
            debouncedSearch.length >= 2 ? (
              <ForumSearchResults
                site={site}
                query={debouncedSearch}
                onOpenTopic={(id, title) => setView({ type: "topic", id, title })}
                onOpenProfile={onOpenProfile}
              />
            ) : (
              <TopicsList site={site} onOpenTopic={(id, title) => setView({ type: "topic", id, title })} />
            )
          ) : (
            <TopicDetail
              site={site}
              topicId={view.id}
              onTitleChange={updateTopicTitle}
              onOpenSettings={onOpenSettings}
              onOpenProfile={onOpenProfile}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TopicsList({ site, onOpenTopic }: { site: Site; onOpenTopic: (id: number, title: string) => void }) {
  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useForumTopicsQuery(site);
  const topics = data?.pages.flatMap((p) => p.topics) ?? [];

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (hasNextPage && !isFetchingNextPage && el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      void fetchNextPage();
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
        <Spinner size={15} />
        Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
        <span className="max-w-xs text-center text-red-500">{errorMessage(error)}</span>
        <Button onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }
  if (topics.length === 0) {
    return <EmptyState className="!h-64" icon={<MessagesSquare />} title="No topics found" />;
  }
  return (
    <div className="h-full overflow-y-auto px-4" onScroll={onScroll}>
      <div className="flex flex-col">
        {topics.map((t) => (
          <ForumTopicRow key={t.id} topic={t} onClick={() => onOpenTopic(t.id, t.title)} />
        ))}
      </div>
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-3">
          <Spinner size={16} className="opacity-60" />
        </div>
      )}
    </div>
  );
}

function ForumSearchResults({
  site,
  query,
  onOpenTopic,
  onOpenProfile,
}: {
  site: Site;
  query: string;
  onOpenTopic: (id: number, title: string) => void;
  onOpenProfile: (userId: number) => void;
}) {
  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useForumSearchQuery(site, query);
  const posts = useMemo(() => data?.pages.flatMap((p) => p.posts) ?? [], [data]);
  const { data: titles } = useForumTopicTitles(
    site,
    useMemo(() => posts.map((p) => p.topic_id), [posts]),
  );

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (hasNextPage && !isFetchingNextPage && el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      void fetchNextPage();
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
        <Spinner size={15} />
        Searching…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
        <span className="max-w-xs text-center text-red-500">{errorMessage(error)}</span>
        <Button onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }
  if (posts.length === 0) {
    return (
      <EmptyState
        className="!h-64"
        icon={<Search />}
        title="No forum posts matched"
        hint="Try different words."
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto px-2" onScroll={onScroll}>
      <div className="flex flex-col">
        {posts.map((p) => (
          <ForumSearchResultRow
            key={p.id}
            site={site}
            post={p}
            topicTitle={titles?.[p.topic_id]}
            onOpen={() => onOpenTopic(p.topic_id, titles?.[p.topic_id] ?? `Topic #${p.topic_id}`)}
            onOpenProfile={onOpenProfile}
          />
        ))}
      </div>
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-3">
          <Spinner size={16} className="opacity-60" />
        </div>
      )}
    </div>
  );
}

function ForumSearchResultRow({
  site,
  post,
  topicTitle,
  onOpen,
  onOpenProfile,
}: {
  site: Site;
  post: ForumPost;
  topicTitle: string | undefined;
  onOpen: () => void;
  onOpenProfile: (userId: number) => void;
}) {
  const { data: avatarUrl } = useUserAvatarUrl(site, post.creator_id);
  const creatorId = post.creator_id;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full gap-2.5 rounded-[var(--radius-sm)] border-b border-black/5 px-2 py-3 text-left
                 transition-colors last:border-0 hover:bg-black/[0.03] dark:border-white/5 dark:hover:bg-white/[0.04]"
    >
      <Avatar url={avatarUrl} name={post.creator_name ?? "?"} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-[rgb(var(--accent))]">
          <MessagesSquare size={12} className="shrink-0" />
          <span className="truncate font-semibold">{topicTitle ?? `Topic #${post.topic_id}`}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] opacity-55">
          <span
            role={creatorId != null ? "link" : undefined}
            onClick={
              creatorId != null
                ? (e) => {
                    e.stopPropagation();
                    onOpenProfile(creatorId);
                  }
                : undefined
            }
            className={creatorId != null ? "font-medium hover:text-[rgb(var(--accent))] hover:underline" : ""}
          >
            {post.creator_name ?? "?"}
          </span>
          {post.created_at && <span>· {new Date(post.created_at).toLocaleDateString()}</span>}
        </div>
        <p className="mt-1 text-sm leading-relaxed opacity-80">{snippet(post.body)}</p>
      </div>
    </button>
  );
}

function TopicDetail({
  site,
  topicId,
  onTitleChange,
  onOpenSettings,
  onOpenProfile,
}: {
  site: Site;
  topicId: number;
  onTitleChange: (title: string) => void;
  onOpenSettings: () => void;
  onOpenProfile: (userId: number) => void;
}) {
  const isAuthenticated = useAccountStore((s) => s.isAuthenticated(site));
  const { data: topic } = useForumTopicQuery(site, topicId);
  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useForumPostsQuery(site, topicId);
  const reply = useForumReply(site, topicId);
  const [draft, setDraft] = useState("");

  const posts = data?.pages.flatMap((p) => p.posts) ?? [];
  const isLocked = topic?.is_locked ?? false;

  // Keeps the header title in sync once the full topic loads (the list only hands over the
  // title it already had when the row was clicked, matching the reference app's own
  // initialTitle-then-refresh approach).
  useEffect(() => {
    if (topic?.title) onTitleChange(topic.title);
  }, [topic?.title, onTitleChange]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (hasNextPage && !isFetchingNextPage && el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      void fetchNextPage();
    }
  }

  function submit() {
    const body = draft.trim();
    if (!body || reply.isPending) return;
    reply.mutate(body, { onSuccess: () => setDraft("") });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4" onScroll={onScroll}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
            <Spinner size={15} />
            Loading…
          </div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
            <span className="max-w-xs text-center text-red-500">{errorMessage(error)}</span>
            <Button onClick={() => void refetch()}>Retry</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col">
              {posts.map((p) => (
                <ForumPostRow key={p.id} site={site} post={p} onOpenProfile={onOpenProfile} />
              ))}
            </div>
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-3">
                <Spinner size={16} className="opacity-60" />
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-black/10 dark:border-white/10 px-4 py-3">
        {isLocked ? (
          <p className="text-sm opacity-60">This topic is locked.</p>
        ) : !isAuthenticated ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm opacity-80">Sign in to reply</span>
            <Button onClick={onOpenSettings}>Settings</Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
              }}
              disabled={reply.isPending}
              placeholder="Reply… (Ctrl+Enter to send)"
              rows={2}
              className="flex-1 resize-none rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                         bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2
                         focus:ring-[rgb(var(--accent))] disabled:opacity-50"
            />
            <IconButton
              onClick={submit}
              disabled={reply.isPending || !draft.trim()}
              title="Send reply"
              className="border border-black/10 dark:border-white/10"
            >
              {reply.isPending ? <Spinner size={14} /> : <Send size={14} />}
            </IconButton>
          </div>
        )}
        {reply.isError && <p className="mt-1 text-xs text-red-500">Failed to post reply.</p>}
      </div>
    </div>
  );
}
