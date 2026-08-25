// Ported from the reference Android app's data/util/Eula.kt - same source text
// (assets/eula.txt, copied verbatim from its res/raw/eula.txt) and the same hash algorithm, so
// this module's output matches what that file's own doc comment describes exactly: "a simple
// content fingerprint (not cryptographic) - just enough that editing the EULA text changes the
// stored hash, so a previously-accepted version no longer matches and the user is prompted to
// agree again."

import eulaTextRaw from "../assets/eula.txt?raw";

export const EULA_TEXT = eulaTextRaw;

/** Reimplements Java/Kotlin's `String.hashCode()` (not anything JS-native) so this hash is a
 *  faithful port of the Kotlin `text.hashCode().toString()` it's replacing, not just "some hash
 *  that happens to work" - `Math.imul` reproduces Java's 32-bit signed int multiply-overflow
 *  semantics that a plain `*` wouldn't. */
function javaStringHashCode(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return hash;
}

export function eulaHash(text: string): string {
  return javaStringHashCode(text).toString();
}

/** The current build's EULA fingerprint - compare against the persisted `eulaAcceptedHash`
 *  (state/settingsStore.ts) to decide whether to show the agree/disagree gate. */
export const CURRENT_EULA_HASH = eulaHash(EULA_TEXT);
