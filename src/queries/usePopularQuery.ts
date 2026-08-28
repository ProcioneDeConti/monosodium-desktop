import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import type { PopularScale } from "../lib/popular";

/** e621's popular ranking for one day/week/month, already ordered by the server. Not paginated -
 *  the ranked set for a period is fixed and bounded, same handling as usePoolPostsQuery. */
export function usePopularPostsQuery(
  site: Site,
  date: string,
  scale: PopularScale,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["popular", site, date, scale],
    queryFn: async () => (await e621Api.getPopularPosts(site, date, scale)).posts,
    enabled,
    staleTime: 5 * 60_000,
  });
}
