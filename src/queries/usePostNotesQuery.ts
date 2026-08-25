import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

export function usePostNotesQuery(site: Site, postId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["postNotes", site, postId],
    // Inactive notes are moderator-deleted/superseded - dropped client-side, same treatment as
    // is_hidden comments (see useCommentsQuery.ts).
    queryFn: async () => (await e621Api.getPostNotes(site, postId)).filter((n) => n.is_active),
    enabled,
    staleTime: 60_000,
  });
}
