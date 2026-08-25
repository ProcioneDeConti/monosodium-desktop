// Mirrors src-tauri/src/saucenao.rs's SauceResult - see that module's doc comment for the
// confidence caveat on SauceNAO's own response shape.

export interface SauceResult {
  similarity: number;
  thumbnail: string | null;
  title: string | null;
  ext_urls: string[];
}
