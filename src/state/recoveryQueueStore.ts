// Bulk un-delete: a session-only queue of deleted posts to run "Try to load from source" on, one
// post at a time. Each post goes through the same `recover_from_sources` command as the viewer's
// button, so caching, the grid's trash-can / "Not found" tiles, and the per-post report all work
// the same; the backend's shared per-host limiter (source_fetch.rs) keeps a batch polite.
//
// One at a time on purpose: a single recovery already searches three sites in parallel, and 15
// Fur Affinity favourites run side by side would be 15 parallel requests to FA. Batches are capped
// at MAX_RECOVERY_BATCH queued/running posts. Posts that already have a recovered copy are skipped;
// ones previously searched without result are tried again (the user picked them).

import { create } from "zustand";
import { e621Api, type RecoveryGrade } from "../api/client";
import { isDeleted, type Post } from "../models/post";
import type { Site } from "../models/site";
import { notify } from "../lib/notifications";
import { toRecoverFailure } from "../lib/recoveryReport";
import { useRecoveredStore } from "./recoveredStore";
import { mascotReact } from "./mascotStore";

export const MAX_RECOVERY_BATCH = 15;

export type RecoveryJobStatus = "queued" | "running" | "found" | "not_found" | "failed" | "cancelled";

export interface RecoveryJob {
  key: string;
  site: Site;
  postId: number;
  status: RecoveryJobStatus;
  /** Best grade found (status "found"). */
  grade?: RecoveryGrade;
  /** Short outcome text ("2 files", "searched 9 places", an error). */
  detail?: string;
}

interface RecoveryQueueState {
  jobs: RecoveryJob[];
  /** Latest status line of the post being searched. */
  currentMessage: string | null;
  /** Adds the deleted, not-yet-recovered posts among `posts`, refusing the lot if the queue would
   *  go over MAX_RECOVERY_BATCH. */
  enqueue: (site: Site, posts: Post[]) => { added: number; tooMany: boolean };
  /** Stops the batch: queued posts are dropped, the running one is cancelled. */
  cancelAll: () => void;
  /** Re-queues every post that ended without a copy (or was cancelled). */
  retryUnfinished: () => void;
  /** Hides the panel; only when nothing is queued or running. */
  dismiss: () => void;
}

const keyOf = (site: Site, id: number) => `${site}:${id}`;

/** The posts' data (sources, file metadata) the backend needs, by job key. */
const postsByKey = new Map<string, Post>();
let pumping = false;
let currentToken: number | null = null;

function hasRecoveredCopy(site: Site, id: number): boolean {
  return !!useRecoveredStore.getState().bySite[site]?.[id]?.src;
}

/** Which of `posts` a bulk recovery would actually take: deleted, with something to search with
 *  (a source or the md5), and no recovered copy yet. */
export function recoverablePosts(site: Site, posts: Post[]): Post[] {
  return posts.filter(
    (p) => isDeleted(p) && !hasRecoveredCopy(site, p.id) && (p.sources.some((s) => /^https?:\/\//.test(s.trim())) || !!p.file.md5),
  );
}

export const useRecoveryQueueStore = create<RecoveryQueueState>((set, get) => {
  const update = (key: string, patch: Partial<RecoveryJob>) =>
    set((s) => ({ jobs: s.jobs.map((j) => (j.key === key ? { ...j, ...patch } : j)) }));

  async function pump() {
    if (pumping) return;
    pumping = true;
    let found = 0;
    let total = 0;
    try {
      for (;;) {
        const job = get().jobs.find((j) => j.status === "queued");
        if (!job) break;
        const post = postsByKey.get(job.key);
        if (!post) {
          update(job.key, { status: "failed", detail: "post data missing" });
          continue;
        }
        total++;
        const token = Math.floor(Math.random() * 2 ** 31);
        currentToken = token;
        update(job.key, { status: "running" });
        set({ currentMessage: "Starting" });
        try {
          const result = await e621Api.recoverFromSources(job.site, job.postId, post.sources, post.file, token, (p) =>
            set({ currentMessage: p.message }),
          );
          found++;
          const best = result.items[0];
          const pick = result.items.find((i) => i.file === result.selected) ?? best;
          update(job.key, {
            status: "found",
            grade: best?.grade,
            detail: `${result.items.length} file${result.items.length === 1 ? "" : "s"}`,
          });
          if (pick) {
            useRecoveredStore.getState().setThumb(job.site, job.postId, { path: pick.path, is_video: pick.is_video, not_found_at: null });
          }
        } catch (e) {
          const f = toRecoverFailure(e);
          if (f.cancelled) {
            update(job.key, { status: "cancelled" });
          } else if (f.attempts.length > 0 || f.no_sources) {
            const looked = f.attempts.filter((a) => a.stage !== "skipped" && a.stage !== "limit").length;
            update(job.key, { status: "not_found", detail: `searched ${looked} place${looked === 1 ? "" : "s"}` });
            const at = Math.floor(Date.now() / 1000);
            useRecoveredStore.getState().setThumb(job.site, job.postId, { path: null, is_video: false, not_found_at: at });
          } else {
            update(job.key, { status: "failed", detail: f.message.split("\n")[0] });
          }
        }
      }
    } finally {
      pumping = false;
      currentToken = null;
      set({ currentMessage: null });
    }
    if (total > 0) {
      void notify(
        "Deleted posts",
        found === 0 ? `No copies found for ${total} post${total === 1 ? "" : "s"}.` : `Recovered ${found} of ${total} post${total === 1 ? "" : "s"}.`,
      );
      if (found === 0) mascotReact("recoverFail");
      else mascotReact("recoverBatch", { found: String(found), total: String(total) });
    }
  }

  return {
    jobs: [],
    currentMessage: null,

    enqueue: (site, posts) => {
      const pending = get().jobs.filter((j) => j.status === "queued" || j.status === "running");
      const fresh = recoverablePosts(site, posts).filter((p) => !pending.some((j) => j.key === keyOf(site, p.id)));
      if (fresh.length === 0) return { added: 0, tooMany: false };
      if (pending.length + fresh.length > MAX_RECOVERY_BATCH) return { added: 0, tooMany: true };
      for (const p of fresh) postsByKey.set(keyOf(site, p.id), p);
      set((s) => {
        // A post re-added after an earlier run replaces its finished row.
        const keys = new Set(fresh.map((p) => keyOf(site, p.id)));
        const kept = s.jobs.filter((j) => !keys.has(j.key));
        const added = fresh.map((p): RecoveryJob => ({ key: keyOf(site, p.id), site, postId: p.id, status: "queued" }));
        return { jobs: [...kept, ...added] };
      });
      void pump();
      return { added: fresh.length, tooMany: false };
    },

    cancelAll: () => {
      set((s) => ({ jobs: s.jobs.map((j) => (j.status === "queued" ? { ...j, status: "cancelled" } : j)) }));
      if (currentToken != null) void e621Api.cancelRecovery(currentToken);
    },

    retryUnfinished: () => {
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.status === "not_found" || j.status === "failed" || j.status === "cancelled" ? { ...j, status: "queued", detail: undefined } : j,
        ),
      }));
      void pump();
    },

    dismiss: () => {
      if (get().jobs.some((j) => j.status === "queued" || j.status === "running")) return;
      postsByKey.clear();
      set({ jobs: [] });
    },
  };
});
