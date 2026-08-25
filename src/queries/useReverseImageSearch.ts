import { useMutation } from "@tanstack/react-query";
import { e621Api } from "../api/client";

export function useReverseImageSearch() {
  return useMutation({
    mutationFn: ({ apiKey, filePath }: { apiKey: string | null; filePath: string }) =>
      e621Api.reverseImageSearch(apiKey, filePath),
  });
}
