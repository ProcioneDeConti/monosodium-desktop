// Three-way merge for blacklist sync. The app and the Android client both edit the same
// account-side blacklist, so a plain "push local" overwrites lines added elsewhere, and a plain
// "import" drops lines added here. Instead we keep the text as it was the last time this app
// and the account agreed (the "base"), and replay only what changed on each side:
//
//   result = remote − (lines removed locally since base) + (lines added locally since base)
//
// Lines are compared on a normalised key (trimmed, whitespace collapsed, lowercased - the same
// way parseBlacklist reads them), so "Young  -age_difference" and "young -age_difference" are
// the same rule. With no base (never synced), nothing is treated as a deletion: the result is
// simply the union, remote first.

export function blacklistLineKey(line: string): string {
  return line.trim().replace(/\s+/g, " ").toLowerCase();
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function keySet(text: string): Set<string> {
  return new Set(lines(text).map(blacklistLineKey));
}

export interface BlacklistMerge {
  merged: string;
  /** Lines from the account that weren't in the local copy (what the other client added). */
  pulled: number;
  /** Local lines the account didn't have yet. */
  pushed: number;
  /** Lines dropped from the account because they were removed here since the last sync. */
  removed: number;
}

export function mergeBlacklists(base: string | null, local: string, remote: string): BlacklistMerge {
  const localKeys = keySet(local);
  const baseKeys = base == null ? null : keySet(base);
  const removedLocally = baseKeys
    ? new Set([...baseKeys].filter((k) => !localKeys.has(k)))
    : new Set<string>();

  const out: string[] = [];
  const seen = new Set<string>();
  let pulled = 0;
  let removed = 0;

  for (const line of lines(remote)) {
    const key = blacklistLineKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    if (removedLocally.has(key)) {
      removed++;
      continue;
    }
    if (!localKeys.has(key)) pulled++;
    out.push(line);
  }

  let pushed = 0;
  for (const line of lines(local)) {
    const key = blacklistLineKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    // Was in base and is now gone from the account: removed on the other side - respect that.
    if (baseKeys?.has(key)) continue;
    pushed++;
    out.push(line);
  }

  return { merged: out.join("\n"), pulled, pushed, removed };
}

/** Same rules regardless of order or spacing - used to skip no-op pushes. */
export function sameBlacklist(a: string, b: string): boolean {
  const ka = lines(a).map(blacklistLineKey);
  const kb = lines(b).map(blacklistLineKey);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}
