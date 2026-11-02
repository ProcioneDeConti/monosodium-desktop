// Network side of the uploader's checklist: file inspection, MD5 -> IQDB duplicate checks, tag
// preview + full implication graph, and DNP lookups. Pure rules live in lib/uploadChecks.ts.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { e621Api } from "../api/client";
import type { Site } from "../models/site";
import type { UploadFileInfo } from "../models/upload";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { errorMessage } from "../lib/errors";
import { artistTags, edgesFromPreview, resolveTags, type Async } from "../lib/uploadChecks";

export type UploadSource = { kind: "file"; path: string } | { kind: "url"; url: string } | null;

export function toAsync<T>(q: Pick<UseQueryResult<T>, "status" | "data" | "error" | "fetchStatus">, enabled: boolean): Async<T> {
  if (!enabled) return { state: "idle" };
  if (q.status === "success") return { state: "done", value: q.data as T };
  if (q.status === "error") return { state: "error", message: errorMessage(q.error) };
  return { state: "loading" };
}

/** antecedent -> consequents, for every tag ever looked up (implications change rarely). Tags with
 *  none map to []. Lets incremental typing only query new tags. */
const implicationCache = new Map<string, string[]>();
const CHUNK = 40;

/** Walks implications to their full depth (e621's tag preview only resolves two levels). One
 *  request per chunk per level; chains are rarely deeper than ~5. */
async function fullImplicationEdges(site: Site, start: string[]): Promise<Map<string, string[]>> {
  let frontier = start.filter((t) => !implicationCache.has(t));
  const seen = new Set<string>();
  const visit = (names: string[]) => {
    for (const n of names) {
      if (seen.has(n)) continue;
      seen.add(n);
      visit(implicationCache.get(n) ?? []);
    }
  };
  while (frontier.length) {
    const next = new Set<string>();
    for (let i = 0; i < frontier.length; i += CHUNK) {
      const chunk = frontier.slice(i, i + CHUNK);
      for (const n of chunk) implicationCache.set(n, implicationCache.get(n) ?? []);
      for (let page = 1; page <= 5; page++) {
        const rows = await e621Api.getImplicationsFrom(site, chunk, page);
        for (const r of rows) {
          const list = implicationCache.get(r.antecedent_name) ?? [];
          if (!list.includes(r.consequent_name)) list.push(r.consequent_name);
          implicationCache.set(r.antecedent_name, list);
          if (!implicationCache.has(r.consequent_name)) next.add(r.consequent_name);
        }
        if (rows.length < 320) break;
      }
    }
    frontier = [...next].filter((t) => !implicationCache.has(t));
  }
  visit(start);
  const edges = new Map<string, string[]>();
  for (const n of seen) {
    const c = implicationCache.get(n);
    if (c?.length) edges.set(n, c);
  }
  return edges;
}

export function useUploadFile(source: UploadSource) {
  return useQuery({
    queryKey: ["uploadFile", source],
    queryFn: (): Promise<UploadFileInfo> =>
      source!.kind === "file" ? e621Api.uploadInspectFile(source!.path) : e621Api.uploadFetchUrl(source!.url),
    enabled: source !== null,
    retry: false,
    staleTime: Infinity,
  });
}

export function useUploadPreviewImage(path: string | undefined) {
  return useQuery({
    queryKey: ["uploadPreview", path],
    queryFn: () => e621Api.uploadPreview(path!),
    enabled: !!path,
    staleTime: Infinity,
    gcTime: 30_000,
  });
}

export function useMd5Duplicate(site: Site, md5: string | undefined) {
  return useQuery({
    queryKey: ["uploadMd5", site, md5],
    queryFn: async () => {
      const post = await e621Api.uploadMd5Lookup(site, md5!);
      return post ? { id: post.id } : null;
    },
    enabled: !!md5,
    retry: 1,
    staleTime: 60_000,
  });
}

export function useIqdb(site: Site, path: string | undefined, md5Clear: boolean) {
  return useQuery({
    queryKey: ["uploadIqdb", site, path],
    queryFn: () => e621Api.uploadIqdb(site, path!),
    enabled: !!path && md5Clear,
    retry: false,
    staleTime: Infinity,
  });
}

/** Tag preview (aliases/categories) plus the full implication graph, debounced while typing. */
export function useUploadTags(site: Site, tags: string[]) {
  const debounced = useDebouncedValue(tags.join(" "), 600);
  const list = debounced ? debounced.split(" ") : [];
  const query = useQuery({
    queryKey: ["uploadTags", site, debounced],
    queryFn: async () => {
      const preview = await e621Api.uploadTagsPreview(site, list);
      const resolved = resolveTags(list, preview);
      const edges = edgesFromPreview(preview);
      const deep = await fullImplicationEdges(site, resolved.map((t) => t.canonical));
      for (const [k, v] of deep) edges.set(k, [...new Set([...(edges.get(k) ?? []), ...v])]);
      return { preview, edges };
    },
    enabled: list.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  // Still typing (debounce not caught up) counts as loading, so the checklist doesn't flash green
  // on a stale result.
  const settled = debounced === tags.join(" ");
  return { query, settled };
}

export function useDnpCheck(site: Site, artists: string[]) {
  const key = [...artists].sort().join(" ");
  return useQuery({
    queryKey: ["uploadDnp", site, key],
    queryFn: () => e621Api.uploadDnpCheck(site, artists),
    enabled: artists.length > 0,
    retry: 1,
    staleTime: 10 * 60_000,
  });
}

export { artistTags };
