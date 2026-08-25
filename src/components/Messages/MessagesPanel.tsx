import { useEffect, useState } from "react";
import { ChevronLeft, Pencil, Reply, Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Dmail } from "../../models/dmail";
import type { Site } from "../../models/site";
import { markDmailReadInCache, useDmailsQuery, useDmailQuery } from "../../queries/useDmailsQuery";
import { useSendDmail } from "../../queries/useDmailMutations";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { DText } from "../ui/DText";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";
import { useUserAvatarUrl } from "../../queries/useAvatarUrl";
import { DmailRow } from "./DmailRow";

interface MessagesPanelProps {
  site: Site;
  onClose: () => void;
  onOpenProfile: (userId: number) => void;
}

type View =
  | { type: "list" }
  | { type: "detail"; id: number }
  | { type: "compose"; toName: string; toEditable: boolean; subject: string; respondToId?: number };

/** Full-screen overlay, same shell pattern as SavedSearchesPanel/ProfilePanel. Private messages
 *  (dmails) - inbox list, a detail view (marks read server-side on open), and compose (new or, from
 *  a detail view, a reply that prefills/locks the recipient - e621 dmails aren't server-threaded,
 *  same as comments, so "reply" is just a prefilled compose, matching the reference Android app's
 *  MessageComposeScreen/E621NavGraph reply wiring exactly). Only reachable when signed in, same
 *  gating convention as Favorites/Profile in AppShell. */
export function MessagesPanel({ site, onClose, onOpenProfile }: MessagesPanelProps) {
  const [view, setView] = useState<View>({ type: "list" });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (view.type !== "list") setView({ type: "list" });
      else onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view.type, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md animate-[scale-in_150ms_ease-out] flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          {view.type !== "list" ? (
            <IconButton onClick={() => setView({ type: "list" })} title="Back">
              <ChevronLeft size={18} />
            </IconButton>
          ) : null}
          <h1 className="truncate text-sm font-semibold">
            {view.type === "list" ? "Messages" : view.type === "compose" ? "New Message" : "Message"}
          </h1>
          {view.type === "list" && (
            <IconButton
              onClick={() => setView({ type: "compose", toName: "", toEditable: true, subject: "" })}
              title="New message"
              className="ml-auto"
            >
              <Pencil size={16} />
            </IconButton>
          )}
          <IconButton onClick={onClose} title="Close (Esc)" className={view.type === "list" ? "" : "ml-auto"}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view.type === "list" && (
            <MessagesList
              site={site}
              onOpenDmail={(id) => setView({ type: "detail", id })}
              onOpenProfile={onOpenProfile}
            />
          )}
          {view.type === "detail" && (
            <MessageDetail
              site={site}
              id={view.id}
              onOpenProfile={onOpenProfile}
              onReply={(d) =>
                setView({
                  type: "compose",
                  toName: d.from_name ?? "",
                  toEditable: false,
                  subject: d.title.startsWith("Re: ") ? d.title : `Re: ${d.title}`,
                  respondToId: d.id,
                })
              }
            />
          )}
          {view.type === "compose" && (
            <MessageCompose
              site={site}
              toName={view.toName}
              toEditable={view.toEditable}
              subject={view.subject}
              respondToId={view.respondToId}
              onSent={() => setView({ type: "list" })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MessagesList({
  site,
  onOpenDmail,
  onOpenProfile,
}: {
  site: Site;
  onOpenDmail: (id: number) => void;
  onOpenProfile: (userId: number) => void;
}) {
  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useDmailsQuery(site, true);
  const dmails = data?.pages.flatMap((p) => p.dmails) ?? [];

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
        <span className="max-w-xs text-center text-red-500">{(error as Error)?.message ?? "Something went wrong."}</span>
        <Button onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }
  if (dmails.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm opacity-60">No messages yet.</div>;
  }
  return (
    <div className="h-full overflow-y-auto px-4" onScroll={onScroll}>
      <div className="flex flex-col">
        {dmails.map((d) => (
          <DmailRow key={d.id} site={site} dmail={d} onClick={() => onOpenDmail(d.id)} onOpenProfile={onOpenProfile} />
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

function MessageDetail({
  site,
  id,
  onOpenProfile,
  onReply,
}: {
  site: Site;
  id: number;
  onOpenProfile: (userId: number) => void;
  onReply: (dmail: Dmail) => void;
}) {
  const { data: dmail, isLoading, isError, error, refetch } = useDmailQuery(site, id);
  const { data: avatarUrl } = useUserAvatarUrl(site, dmail?.from_id ?? null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // e621 marks a dmail read server-side as a side effect of fetching it - patch the cached
    // inbox row and refresh the signed-in account's unread count so both catch up instantly
    // instead of waiting for a refetch/the next 60s poll.
    if (!dmail) return;
    markDmailReadInCache(queryClient, site, dmail.id);
    void queryClient.invalidateQueries({ queryKey: ["profile", site, "me"] });
  }, [dmail, site, queryClient]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
        <Spinner size={15} />
        Loading…
      </div>
    );
  }
  if (isError || !dmail) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
        <span className="max-w-xs text-center text-red-500">{(error as Error)?.message ?? "Something went wrong."}</span>
        <Button onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }

  const fromId = dmail.from_id;

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-2.5">
        <Avatar url={avatarUrl} name={dmail.from_name ?? "?"} size={40} />
        <div className="min-w-0">
          {fromId != null ? (
            <button
              type="button"
              onClick={() => onOpenProfile(fromId)}
              className="block max-w-full truncate text-sm font-bold text-[rgb(var(--accent))] hover:underline"
            >
              {dmail.from_name ?? "?"}
            </button>
          ) : (
            <p className="truncate text-sm font-bold opacity-60">{dmail.from_name ?? "?"}</p>
          )}
          {dmail.created_at && <p className="text-xs opacity-50">{new Date(dmail.created_at).toLocaleString()}</p>}
        </div>
      </div>

      <h2 className="text-base font-bold">{dmail.title || "(no subject)"}</h2>

      <DText text={dmail.body} site={site} className="text-sm leading-relaxed" />

      <Button icon={<Reply size={13} strokeWidth={2.5} />} onClick={() => onReply(dmail)} className="self-start">
        Reply
      </Button>
    </div>
  );
}

function MessageCompose({
  site,
  toName: initialToName,
  toEditable,
  subject: initialSubject,
  respondToId,
  onSent,
}: {
  site: Site;
  toName: string;
  toEditable: boolean;
  subject: string;
  respondToId?: number;
  onSent: () => void;
}) {
  const [toName, setToName] = useState(initialToName);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const send = useSendDmail(site);

  const canSend = toName.trim() !== "" && subject.trim() !== "" && body.trim() !== "" && !send.isPending;

  function submit() {
    if (!canSend) return;
    send.mutate(
      { toName: toName.trim(), title: subject.trim(), body: body.trim(), respondToId: respondToId ?? null },
      { onSuccess: onSent },
    );
  }

  return (
    <div className="flex h-full flex-col gap-2.5 px-4 py-4">
      <input
        value={toName}
        onChange={(e) => setToName(e.target.value)}
        disabled={!toEditable}
        placeholder="To (username)"
        className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30
                   px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:opacity-60"
      />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30
                   px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Message"
        className="min-h-32 flex-1 resize-none rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10
                   bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
      />
      <div className="flex items-center justify-end gap-2">
        {send.isError && (
          <span className="text-xs text-red-500">{(send.error as Error)?.message ?? "Failed to send."}</span>
        )}
        <Button icon={send.isPending ? <Spinner size={13} /> : <Send size={13} strokeWidth={2.5} />} onClick={submit} disabled={!canSend}>
          Send
        </Button>
      </div>
    </div>
  );
}
