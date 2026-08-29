import { useCallback } from "react";
import type { Post } from "../models/post";
import { useCollectionsStore } from "./collectionsStore";
import { useDownloadsStore } from "./downloadsStore";

/** Adds posts to a collection and, if that collection has an auto-download folder, queues the
 *  *newly* added ones for download there. Returns how many were added. */
export function useAddToCollection() {
  const addPosts = useCollectionsStore((s) => s.addPosts);
  const enqueue = useDownloadsStore((s) => s.enqueue);

  return useCallback(
    async (collectionId: string, posts: Post[]) => {
      const added = await addPosts(
        collectionId,
        posts.map((p) => p.id),
      );
      if (added.length === 0) return 0;
      const col = useCollectionsStore.getState().collections.find((c) => c.id === collectionId);
      if (col?.autoDownloadFolder) {
        enqueue(
          posts.filter((p) => added.includes(p.id)),
          col.autoDownloadFolder,
        );
      }
      return added.length;
    },
    [addPosts, enqueue],
  );
}
