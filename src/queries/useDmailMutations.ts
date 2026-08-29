import { useMutation, useQueryClient } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import { dmailsQueryKey, removeDmailsFromCache } from "./useDmailsQuery";

export interface SendDmailInput {
  toName: string;
  title: string;
  body: string;
  respondToId?: number | null;
}

export function useSendDmail(site: Site) {
  return useMutation({
    mutationFn: ({ toName, title, body, respondToId }: SendDmailInput) =>
      e621Api.createDmail(site, toName, title, body, respondToId),
  });
}

/** Deletes one or more received dmails. Sequential (the API is rate-limited), optimistic (rows
 *  vanish immediately), and self-correcting (a settle-time invalidate refetches the real inbox). */
export function useDeleteDmails(site: Site) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await e621Api.deleteDmail(site, id);
      }
      return ids;
    },
    onMutate: (ids) => {
      removeDmailsFromCache(queryClient, site, ids);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: dmailsQueryKey(site) });
      void queryClient.invalidateQueries({ queryKey: ["profile", site, "me"] });
    },
  });
}
