// Drives wallpaper rotation: fetches candidates from the chosen source, picks one (lib/wallpaper.ts),
// and hands it to src-tauri/src/wallpaper.rs. `useWallpaperRotation` is mounted once in App and
// keeps running while the window is hidden to the tray - that's the point of a rotation. Hidden
// WebView2 timers get throttled to about once a minute, which is the tick we use anyway.

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { e621Api } from "../api/client";
import type { Post } from "../models/post";
import type { Site } from "../models/site";
import { useCollectionsStore } from "../state/collectionsStore";
import { useSettingsStore } from "../state/settingsStore";
import { useWallpaperStore } from "../state/wallpaperStore";
import { errorMessage } from "./errors";
import {
  allowedRatings,
  collectionSample,
  isRotationDue,
  pickWallpaper,
  ratingFilterFor,
  ROTATION_RETRY_MIN,
  rotationQuery,
  sourceTags,
} from "./wallpaper";

const TICK_MS = 60_000;
let inFlight: Promise<void> | null = null;

/** Sets a single post as the wallpaper (viewer button). Restarts the rotation interval. */
export async function setPostAsWallpaper(post: Post, site: Site): Promise<void> {
  if (!post.file.url) throw new Error("This post has no original file to use.");
  const { fit, recordChange } = useWallpaperStore.getState();
  await e621Api.setWallpaper(post.file.url, fit);
  recordChange(post.id, site);
}

async function fetchCandidates(): Promise<Post[]> {
  const { source, safeOnly, recentIds } = useWallpaperStore.getState();
  if (!source) throw new Error("Pick a source for the rotation first.");
  const { adultModeEnabled, enabledRatings } = useSettingsStore.getState();
  const ratings = allowedRatings(safeOnly, adultModeEnabled, enabledRatings);

  if (source.kind === "collection") {
    const collection = useCollectionsStore
      .getState()
      .collections.find((c) => c.id === source.collectionId);
    if (!collection) throw new Error(`The collection "${source.label}" no longer exists.`);
    const ids = collectionSample(collection.postIds, recentIds);
    if (ids.length === 0) throw new Error(`The collection "${collection.title}" is empty.`);
    return (await e621Api.getPosts(source.site, `id:${ids.join(",")}`, ids.length)).posts;
  }
  const tags = sourceTags(source) ?? "";
  return (await e621Api.getPosts(source.site, rotationQuery(tags, ratingFilterFor(ratings)), 50))
    .posts;
}

async function rotateOnce(): Promise<void> {
  const state = useWallpaperStore.getState();
  try {
    const source = state.source;
    if (!source) throw new Error("Pick a source for the rotation first.");
    const posts = await fetchCandidates();
    const { adultModeEnabled, enabledRatings, blacklistEntries } = useSettingsStore.getState();
    const pick = pickWallpaper(posts, {
      // Always the real blacklist - "Show blacklisted posts" is a browsing toggle, not a desktop one.
      blacklist: blacklistEntries,
      ratings: allowedRatings(state.safeOnly, adultModeEnabled, enabledRatings),
      recentIds: state.recentIds,
      currentId: state.current?.site === source.site ? state.current.postId : null,
    });
    if (!pick?.file.url) {
      throw new Error(
        "No usable images found - videos, blacklisted posts, and hidden ratings are skipped.",
      );
    }
    await e621Api.setWallpaper(pick.file.url, useWallpaperStore.getState().fit);
    useWallpaperStore.getState().recordChange(pick.id, source.site);
  } catch (e) {
    const retryMin = Math.min(ROTATION_RETRY_MIN, state.intervalMin);
    useWallpaperStore
      .getState()
      .recordFailure(errorMessage(e, "Couldn't change the wallpaper."), Date.now() + retryMin * 60_000);
    throw e;
  }
}

/** Advances the rotation right now (Settings button, tray item). Concurrent calls share one run. */
export function rotateWallpaperNow(): Promise<void> {
  if (!inFlight) inFlight = rotateOnce().finally(() => (inFlight = null));
  return inFlight;
}

export function useWallpaperRotation(booted: boolean): void {
  const enabled = useWallpaperStore((s) => s.isLoaded && s.rotationEnabled && s.source != null);

  // Tray "Next wallpaper" is only clickable while a rotation is running.
  useEffect(() => {
    if (!booted) return;
    void e621Api.setWallpaperRotationActive(enabled).catch(() => {});
  }, [booted, enabled]);

  useEffect(() => {
    if (!booted || !enabled) return;
    function tick() {
      const s = useWallpaperStore.getState();
      if (isRotationDue(s.lastChangedAt, s.intervalMin, Date.now(), s.retryAt)) {
        rotateWallpaperNow().catch(() => {});
      }
    }
    tick();
    const id = window.setInterval(tick, TICK_MS);
    const unlisten = listen("tray-next-wallpaper", () => rotateWallpaperNow().catch(() => {}));
    return () => {
      window.clearInterval(id);
      void unlisten.then((f) => f());
    };
  }, [booted, enabled]);
}
