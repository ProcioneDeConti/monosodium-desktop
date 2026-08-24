import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

/** Polls the active site's reachability every minute - mirrors the reference Android app's
 *  health-check indicator (green/checking/red). Uses the same rate-limited request path as
 *  every other API call (see api.rs), so this never adds meaningful load. */
export function useHealthCheck(site: Site) {
  return useQuery({
    queryKey: ["health", site],
    queryFn: () => e621Api.healthCheck(site),
    refetchInterval: 60_000,
    retry: false,
    staleTime: 30_000,
  });
}
