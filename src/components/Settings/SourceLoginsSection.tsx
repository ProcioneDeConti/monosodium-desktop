import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { e621Api } from "../../api/client";
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
    </div>
  );
}

function SiteRow({ site }: { site: LoginSite }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void e621Api.sourceLoginStatus(site.id).then((v) => !cancelled && setSignedIn(v));
    const unlisten = listen<{ site: string; signed_in: boolean }>("source-login-changed", (e) => {
      if (e.payload.site === site.id) setSignedIn(e.payload.signed_in);
    });
    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
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
      setSignedIn(false);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="rounded-[var(--radius-sm)] bg-black/[0.03] dark:bg-white/[0.04] p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{site.name}</h3>
        <span className={`flex items-center gap-1 text-xs ${signedIn ? "text-green-500" : "opacity-50"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${signedIn ? "bg-green-500" : "bg-current"}`} />
          {signedIn ? "Signed in" : "Not signed in"}
        </span>
      </div>
      <p className="mb-2 text-xs opacity-60">{site.note}</p>
      <div className="flex gap-2">
        <Button onClick={() => void signIn()}>{signedIn ? "Sign in again" : "Sign in..."}</Button>
        {signedIn && <Button onClick={() => void signOut()}>Sign out</Button>}
      </div>
      {!signedIn && (
        <p className="mt-2 text-xs opacity-50">
          A window opens on {site.name}'s login page. It closes by itself once you're signed in.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
