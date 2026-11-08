import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { e621Api, type SourceKeyCheck, type SourceKeySite, type SourceLoginStatus } from "../../api/client";
import { Button } from "../ui/Button";

interface LoginSite {
  id: string;
  name: string;
  note: string;
}

const SITES: LoginSite[] = [
  {
    id: "furaffinity",
    name: "Fur Affinity",
    note: "Needed for Mature/Adult submissions. Mature/Adult content must also be enabled in your FA account settings.",
  },
];

/** Optional sign-ins to third-party sites, used only by "Try to load from source" on deleted
 *  posts. Sign-in happens in a separate window on the site's own login page - the app never
 *  sees the password, and the resulting session cookie stays in the backend (encrypted in
 *  credentials.dat) and is only sent to that site. */
export function SourceLoginsSection() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-60">
        Some sources only show their images to signed-in users. Signing in here lets deleted-post
        recovery reach them. You sign in on the site's own page; this app never sees your password.
      </p>
      {SITES.map((site) => (
        <SiteRow key={site.id} site={site} />
      ))}
      <SourceApiKeys />
    </div>
  );
}

interface KeySite {
  id: SourceKeySite;
  name: string;
  /** Whether the site's API also wants the account's numeric user id. */
  needsUserId: boolean;
  note: string;
  url: string;
}

const KEY_SITES: KeySite[] = [
  {
    id: "gelbooru",
    name: "Gelbooru",
    needsUserId: true,
    note: "Finds byte-identical copies by md5. Your user id and API key are on your account's Options page.",
    url: "https://gelbooru.com/index.php?page=account&s=options",
  },
  {
    id: "rule34",
    name: "Rule34.xxx",
    needsUserId: true,
    note: "Finds byte-identical copies by md5. Your user id and API key are on your account's Options page.",
    url: "https://rule34.xxx/index.php?page=account&s=options",
  },
  {
    id: "weasyl",
    name: "Weasyl",
    needsUserId: false,
    note: "Optional - recovery already reads Weasyl submission pages without one. With a key it asks Weasyl's API first. Create one under Settings > API Keys on Weasyl.",
    url: "https://www.weasyl.com/control/apikeys",
  },
];

function keyLabel(isSaved: boolean, check: SourceKeyCheck | null): string {
  if (!isSaved) return "No key";
  switch (check?.state) {
    case undefined:
      return "Checking key...";
    case "valid":
      return check.message ? `Key works (${check.message.replace(/^Signed in as /, "")})` : "Key works";
    case "rejected":
      return "Key rejected";
    default:
      return "Key saved (couldn't verify)";
  }
}

function keyStyle(isSaved: boolean, check: SourceKeyCheck | null): string {
  if (!isSaved || !check) return "opacity-50";
  if (check.state === "valid") return "text-green-500";
  if (check.state === "rejected") return "text-red-400";
  return "text-green-500 opacity-70";
}

const keyInput =
  "min-w-0 flex-1 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";

/** Optional API keys for sources that refuse anonymous API use. Like the sign-in cookies, a
 *  saved key stays in the backend (encrypted in credentials.dat); this only learns which are set. */
function SourceApiKeys() {
  const [saved, setSaved] = useState<SourceKeySite[] | null>(null);
  useEffect(() => {
    const refresh = () => void e621Api.sourceKeyStatus().then(setSaved, () => setSaved([]));
    refresh();
    // Settings > Backup & Restore can bring keys back in while this is mounted.
    const unlisten = listen("source-secrets-restored", refresh);
    return () => void unlisten.then((fn) => fn());
  }, []);
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-xs opacity-60">
        Optional API keys. Some sites only answer apps that send one; with a key saved, recovery
        also checks them.
      </p>
      {KEY_SITES.map((site) => (
        <KeyRow
          key={site.id}
          site={site}
          isSaved={saved?.includes(site.id) ?? false}
          onChange={(isSaved) =>
            setSaved((s) => (isSaved ? [...(s ?? []), site.id] : (s ?? []).filter((x) => x !== site.id)))
          }
        />
      ))}
    </div>
  );
}

function KeyRow({ site, isSaved, onChange }: { site: KeySite; isSaved: boolean; onChange: (saved: boolean) => void }) {
  const [userId, setUserId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not checked yet (or checking); a saved key is tested against the site on open/save.
  const [check, setCheck] = useState<SourceKeyCheck | null>(null);

  async function runCheck() {
    setCheck(null);
    setCheck(await e621Api.checkSourceKey(site.id).catch((e) => ({ state: "unverified" as const, message: String(e) })));
  }

  useEffect(() => {
    if (isSaved) void runCheck();
    else setCheck(null);
  }, [isSaved]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await e621Api.saveSourceKey(site.id, userId, apiKey);
      setUserId("");
      setApiKey("");
      if (isSaved) void runCheck(); // replaced key: the isSaved effect won't re-fire
      onChange(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await e621Api.deleteSourceKey(site.id);
      onChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const canSave = apiKey.trim() !== "" && (!site.needsUserId || userId.trim() !== "");

  return (
    <div className="rounded-[var(--radius-sm)] bg-black/[0.03] dark:bg-white/[0.04] p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{site.name}</h3>
        <span className={`flex items-center gap-1 text-xs ${keyStyle(isSaved, check)}`} title={check?.message ?? undefined}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {keyLabel(isSaved, check)}
        </span>
      </div>
      <p className="mb-2 text-xs opacity-60">{site.note}</p>
      {check?.state === "rejected" && (
        <p className="mb-2 text-xs text-red-400">
          {site.name} refused this key{check.message && check.message !== "The site refused this key" ? ` ("${check.message}")` : ""}.
          {site.needsUserId ? " Check both the user id and the key." : " Check the key."}
        </p>
      )}
      {check?.state === "unverified" && (
        <p className="mb-2 text-xs opacity-60">Couldn't check the key right now ({check.message}).</p>
      )}
      <div className="flex gap-1">
        {site.needsUserId && (
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="User id"
            inputMode="numeric"
            className={`${keyInput} max-w-[8rem]`}
          />
        )}
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          placeholder={isSaved ? "Replace saved key" : "API key"}
          className={keyInput}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={() => void save()}
          className="rounded-[var(--radius-sm)] bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Save
        </button>
        {isSaved && (
          <Button disabled={busy} onClick={() => void remove()}>
            Remove key
          </Button>
        )}
        <button
          type="button"
          onClick={() => void openUrl(site.url)}
          className="ml-auto flex items-center gap-1 text-xs text-[rgb(var(--accent))] hover:underline"
        >
          Get a key
          <ExternalLink size={11} />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

const STATUS_LABEL: Record<SourceLoginStatus | "checking", string> = {
  checking: "Checking...",
  signed_in: "Signed in",
  expired: "Session expired",
  signed_out: "Not signed in",
  unverified: "Signed in (couldn't verify)",
};

const STATUS_STYLE: Record<SourceLoginStatus | "checking", string> = {
  checking: "opacity-50",
  signed_in: "text-green-500",
  expired: "text-amber-500",
  signed_out: "opacity-50",
  unverified: "text-green-500 opacity-70",
};

function SiteRow({ site }: { site: LoginSite }) {
  const [status, setStatus] = useState<SourceLoginStatus | null>(null);
  // A saved session counts for the buttons even when expired/unverified (it can be signed out).
  const signedIn = status != null && status !== "signed_out";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      void e621Api
        .sourceLoginStatus(site.id)
        .then((v) => !cancelled && setStatus(v))
        .catch(() => !cancelled && setStatus("unverified"));
    refresh();
    const unlisten = listen<{ site: string; signed_in: boolean }>("source-login-changed", (e) => {
      if (e.payload.site === site.id) setStatus(e.payload.signed_in ? "signed_in" : "signed_out");
    });
    // A restored backup may carry a saved sign-in for this site.
    const unlistenRestore = listen("source-secrets-restored", refresh);
    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
      void unlistenRestore.then((fn) => fn());
    };
  }, [site.id]);

  async function signIn() {
    setError(null);
    try {
      await e621Api.openSourceLogin(site.id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function signOut() {
    setError(null);
    try {
      await e621Api.sourceLogout(site.id);
      setStatus("signed_out");
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="rounded-[var(--radius-sm)] bg-black/[0.03] dark:bg-white/[0.04] p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{site.name}</h3>
        <span className={`flex items-center gap-1 text-xs ${STATUS_STYLE[status ?? "checking"]}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {STATUS_LABEL[status ?? "checking"]}
        </span>
      </div>
      <p className="mb-2 text-xs opacity-60">{site.note}</p>
      <div className="flex gap-2">
        <Button onClick={() => void signIn()}>{signedIn ? "Sign in again" : "Sign in..."}</Button>
        {signedIn && <Button onClick={() => void signOut()}>Sign out</Button>}
      </div>
      {status === "expired" && (
        <p className="mt-2 text-xs text-amber-500">
          {site.name} no longer accepts the saved session (it expired, or you signed out or changed
          your password there). Sign in again to keep recovering login-only posts.
        </p>
      )}
      {!signedIn && (
        <p className="mt-2 text-xs opacity-50">
          A window opens on {site.name}'s login page. It closes by itself once you're signed in.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
