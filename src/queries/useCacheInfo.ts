import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";

export function useCacheInfo(enabled: boolean) {
  return useQuery({
    queryKey: ["cacheInfo"],
    queryFn: () => e621Api.getCacheInfo(),
    enabled,
    staleTime: 0,
  });
}
