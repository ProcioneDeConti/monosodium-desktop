import { useMutation } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

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
