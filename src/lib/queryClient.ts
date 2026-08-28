import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // The webview process has no real "reconnect" event worth refetching on, and a silent
      // refetch storm on every network blip just burns rate-limit slots and memory.
      refetchOnReconnect: false,
      // Drop an inactive query's cached data (a previous search's accumulated infinite-scroll
      // pages, an old profile, stale autocomplete results) a couple of minutes after nothing is
      // observing it, instead of the 5-minute default - the posts pages in particular are the
      // heaviest thing this app keeps in memory.
      gcTime: 2 * 60_000,
    },
  },
});
