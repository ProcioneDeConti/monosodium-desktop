// Session-only download queue (not persisted - a half-finished queue isn't worth restoring, and
// the files it would re-fetch are large). Feeds the DownloadsPanel; bulk "download selected" and
// the single-post download buttons both enqueue here. The actual fetch+write is
// `download_post_file` (src-tauri/src/downloads.rs) - the CDN, not the rate-limited API - so a
// small concurrency limit here is just politeness, not a hard requirement.

import { create } from "zustand";
import { e621Api } from "../api/client";
import { downloadFileName, isVideo, playableUrl, type Post } from "../models/post";
import { errorMessage } from "../lib/errors";
import { useStatsStore } from "./statsStore";

export type DownloadStatus = "queued" | "active" | "done" | "error";

export interface DownloadJob {
  id: string;
  postId: number;
  fileName: string;
  url: string;
  isVideo: boolean;
  /** Post's file size in bytes (for the usage-stats "downloaded" total); 0 if unknown. */
  bytes: number;
  dir: string | null;
  status: DownloadStatus;
  error?: string;
  savedPath?: string;
}

interface DownloadsState {
  jobs: DownloadJob[];
  /** Adds one job per post that has a usable file URL and isn't already queued/active/done.
   *  Returns how many were actually added. */
  enqueue: (posts: Post[], dir: string | null) => number;
  retry: (id: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
  clearAll: () => void;
}

const MAX_CONCURRENT = 2;

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  jobs: [],

  enqueue: (posts, dir) => {
    const existing = new Set(
      get()
        .jobs.filter((j) => j.status !== "error")
        .map((j) => j.postId),
    );
    const added: DownloadJob[] = [];
    for (const post of posts) {
      if (existing.has(post.id)) continue;
      const url = playableUrl(post);
      if (!url) continue;
      added.push({
        id: crypto.randomUUID(),
        postId: post.id,
        fileName: downloadFileName(post),
        url,
        isVideo: isVideo(post),
        bytes: post.file?.size || 0,
        dir,
        status: "queued",
      });
    }
    if (added.length > 0) {
      set((s) => ({ jobs: [...s.jobs, ...added] }));
      pump();
    }
    return added.length;
  },

  retry: (id) => {
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === id ? { ...j, status: "queued", error: undefined } : j,
      ),
    }));
    pump();
  },

  remove: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

  clearFinished: () =>
    set((s) => ({ jobs: s.jobs.filter((j) => j.status === "queued" || j.status === "active") })),

  clearAll: () => set({ jobs: [] }),
}));

function setStatus(id: string, patch: Partial<DownloadJob>) {
  useDownloadsStore.setState((s) => ({
    jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
  }));
}

async function runJob(job: DownloadJob) {
  setStatus(job.id, { status: "active" });
  try {
    const path = await e621Api.downloadPostFile(job.url, job.fileName, job.dir, job.isVideo);
    setStatus(job.id, { status: "done", savedPath: path });
    useStatsStore.getState().recordDownload(job.bytes);
  } catch (e) {
    setStatus(job.id, { status: "error", error: errorMessage(e, "Download failed") });
  }
  pump();
}

/** Starts as many queued jobs as the concurrency limit allows. Safe to call repeatedly. */
function pump() {
  const { jobs } = useDownloadsStore.getState();
  const active = jobs.filter((j) => j.status === "active").length;
  const slots = MAX_CONCURRENT - active;
  if (slots <= 0) return;
  jobs
    .filter((j) => j.status === "queued")
    .slice(0, slots)
    .forEach((j) => void runJob(j));
}
