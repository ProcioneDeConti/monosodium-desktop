import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

/** Fetches a user's profile - `userId === "me"` hits `users/me.json` for the signed-in account,
 *  a numeric id hits `users/<id>.json` for any public profile. */
export function useUserProfileQuery(site: Site, userId: number | "me") {
  return useQuery({
    queryKey: ["profile", site, userId],
    queryFn: () => (userId === "me" ? e621Api.getCurrentUser(site) : e621Api.getUser(site, userId)),
    staleTime: 60_000,
  });
}
