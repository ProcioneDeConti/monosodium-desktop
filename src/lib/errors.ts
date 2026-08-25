// Extracts a human-readable message from anything that might land in a catch block or a
// TanStack Query error slot. Exists because of a real, previously-widespread bug: Tauri's
// invoke() rejects with a *plain string* when a Rust command returns Err(String) (not an Error
// object), so every `(error as Error)?.message ?? fallback` / `e instanceof Error ? e.message :
// fallback` across this app was silently discarding the real backend error and always showing
// the generic fallback text instead - found live via a dmail send failure that only ever showed
// "Failed to send." no matter what actually went wrong server-side.

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (typeof error === "string" && error.trim() !== "") return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
