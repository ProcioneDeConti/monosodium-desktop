import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";

export function useArtistQuery(site: Site, name: string | null) {
  return useQuery({
    queryKey: ["artist", site, name],
    queryFn: () => e621Api.getArtist(site, name!),
    enabled: !!name,
    staleTime: 10 * 60_000,
  });
}

export function useArtistDnpQuery(site: Site, artistId: number | null | undefined) {
  return useQuery({
    queryKey: ["artistDnp", site, artistId],
    queryFn: () => e621Api.getArtistDnp(site, artistId!),
    enabled: artistId != null,
    staleTime: 10 * 60_000,
  });
}
