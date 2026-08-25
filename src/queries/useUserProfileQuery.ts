import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

/** Fetches a user's profile - `userId === "me"` hits `users/me.json` for the signed-in account,
 *  a numeric id hits `users/<id>.json` for any public profile. `refetchInterval` is opt-in (used
 *  by AppShell to poll the signed-in account's unread dmail count for its Messages badge). */
export function useUserProfileQuery(
  site: Site,
  userId: number | "me",
  enabled = true,
  refetchInterval?: number,
) {
  return useQuery({
    queryKey: ["profile", site, userId],
    queryFn: () => (userId === "me" ? e621Api.getCurrentUser(site) : e621Api.getUser(site, userId)),
    enabled,
    staleTime: 60_000,
    refetchInterval,
  });
}
