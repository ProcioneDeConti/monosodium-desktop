import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { AlertTriangle, FileUp } from "lucide-react";
import { e621Api } from "../../api/client";
import type { TunnelState, VpnStatus } from "../../models/vpn";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { ToggleRow } from "./controls";
// ISC requires the notice to accompany every copy of the bundled binary.
import wireproxyLicense from "../../../src-tauri/vendor/wireproxy-LICENSE.txt?raw";

const STATE_LABEL: Record<TunnelState, string> = {
  off: "Off",
  locked: "Waiting for the encryption password",
  starting: "Connecting...",
  running: "Tunnel up",
  error: "Not connected",
};

const STATE_DOT: Record<TunnelState, string> = {
  off: "bg-gray-400",
  locked: "bg-amber-400",
  starting: "bg-amber-400 animate-pulse",
  running: "bg-green-500",
  error: "bg-red-500",
};

/** WireGuard re-handshakes every ~2 minutes while traffic flows, and not at all while idle - so
 *  an old handshake just means "quiet", not "down". */
function handshakeText(age: number | null): string {
  if (age === null) return "No handshake yet - the server hasn't answered (check the endpoint and keys).";
  if (age < 180) return `Connected - last handshake ${formatAge(age)} ago`;
  return `Idle - last handshake ${formatAge(age)} ago (renews as soon as something loads)`;
}

function formatAge(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function formatBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** App-only WireGuard VPN (src-tauri/src/wireguard.rs). Import a .conf, flip the switch, and the
 *  app relaunches with every request - API calls *and* the webview's images/videos - going
 *  through the tunnel. Fail-closed: while it's on and the tunnel is down, nothing loads. */
export function VpnSection() {
  const [status, setStatus] = useState<VpnStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [showLog, setShowLog] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    void e621Api.vpnStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const unlisteners = [listen("vpn-status", refresh), listen("source-secrets-restored", refresh)];
    return () => unlisteners.forEach((u) => void u.then((f) => f()));
  }, [refresh]);

  // Live handshake/traffic readout - only while this card is mounted and the tunnel is up. Reads
  // wireproxy's local health endpoint, no network traffic.
  const live = status?.active && status.state === "running";
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(refresh, 3000);
    return () => window.clearInterval(id);
  }, [live, refresh]);

  async function run(action: () => Promise<unknown>, thenRelaunch = false) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (thenRelaunch) {
        await relaunch();
        return;
      }
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  }

  async function importText(text: string, name: string) {
    await run(async () => {
      await e621Api.vpnImportConfig(text, name);
      setPasting(false);
      setPasted("");
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 64 * 1024) {
      setError("That file is too large to be a WireGuard config.");
      return;
    }
    await importText(await file.text(), file.name.replace(/\.conf$/i, ""));
  }

  if (!status) return <Spinner size={16} />;

  if (!status.available) {
    return (
      <p className="text-xs opacity-60">
        This build doesn't include the WireGuard engine. (Developer builds need{" "}
        <code>npm run fetch:wireproxy</code> before compiling.)
      </p>
    );
  }

  const { profile } = status;
  const restartPending = status.enabled !== status.active;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs opacity-60">
        Route this app's traffic - searches, images and videos - through your own WireGuard VPN.
        Only Monosodium uses the tunnel; the rest of your PC is unaffected, and no driver or admin
        rights are needed. While it's on, the app never falls back to your normal connection: if the
        tunnel is down, nothing loads. Links you open in your browser or Telegram aren't covered.
      </p>

      <input ref={fileRef} type="file" accept=".conf,text/plain" className="hidden" onChange={onFile} />

      {profile ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 p-2 text-xs">
          <div className="font-semibold">{profile.name}</div>
          <div className="opacity-70">Server: {profile.endpoints.join(", ")}</div>
          <div className="opacity-70">Address: {profile.addresses.join(", ")}</div>
          <div className="opacity-70">
            DNS: {profile.dns.join(", ")}
            {profile.dns_defaulted && " (none in the config - using this through the tunnel)"}
          </div>
          {!profile.full_tunnel && (
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} className="shrink-0" />
              This config doesn't route all traffic (no 0.0.0.0/0 in AllowedIPs), so e621 may not load
              through it.
            </div>
          )}
          <div className="mt-1 flex gap-2">
            <Button disabled={busy} onClick={() => fileRef.current?.click()}>
              Replace config
            </Button>
            <Button
              disabled={busy}
              onClick={() => void run(() => e621Api.vpnRemoveConfig(), status.active)}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => fileRef.current?.click()}>
            <FileUp size={14} className="mr-1 inline" />
            Import .conf file
          </Button>
          <Button disabled={busy} onClick={() => setPasting((v) => !v)}>
            {pasting ? "Cancel" : "Paste config"}
          </Button>
        </div>
      )}

      {pasting && !profile && (
        <div className="flex flex-col gap-1">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={"[Interface]\nPrivateKey = ...\nAddress = ...\n\n[Peer]\nPublicKey = ...\nEndpoint = ...\nAllowedIPs = 0.0.0.0/0"}
            className="rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60
                       dark:bg-black/30 px-2 py-1.5 font-mono text-xs outline-none focus:ring-2
                       focus:ring-[rgb(var(--accent))]"
          />
          <Button disabled={busy || !pasted.trim()} onClick={() => void importText(pasted, "WireGuard")}>
            Save config
          </Button>
        </div>
      )}

      <ToggleRow
        label="Use VPN"
        hint="The app restarts to apply this."
        checked={status.enabled}
        disabled={busy || (!profile && !status.enabled)}
        onChange={(on) => void run(() => e621Api.vpnSetEnabled(on), true)}
      />

      {status.active && (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${STATE_DOT[status.state]}`} />
            <span>{STATE_LABEL[status.state]}</span>
            {(status.state === "error" || status.state === "running") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => e621Api.vpnReconnect())}
                className="text-[rgb(var(--accent))] hover:underline disabled:opacity-40"
              >
                Reconnect
              </button>
            )}
          </div>
          {status.state === "running" && (
            <div className="flex flex-col gap-0.5 opacity-80">
              <span>{handshakeText(status.handshake_age_secs)}</span>
              <span className="tabular-nums">
                This session: ↓ {formatBytes(status.rx_bytes)} · ↑ {formatBytes(status.tx_bytes)}
              </span>
            </div>
          )}
          {status.error && <pre className="whitespace-pre-wrap text-red-500">{status.error}</pre>}
          {status.log.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="self-start opacity-60 hover:underline"
            >
              {showLog ? "Hide log" : "Show log"}
            </button>
          )}
          {showLog && (
            <pre className="max-h-40 overflow-auto rounded-[var(--radius-sm)] bg-black/5 dark:bg-white/5 p-2 text-[11px]">
              {status.log.join("\n")}
            </pre>
          )}
        </div>
      )}

      {restartPending && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle size={12} />
          Restart to {status.enabled ? "turn the VPN on" : "turn the VPN off"}.
          <Button disabled={busy} onClick={() => void relaunch()}>
            Restart now
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <details className="text-[11px] opacity-50">
        <summary className="cursor-pointer">Powered by wireproxy (ISC licence)</summary>
        <pre className="mt-1 whitespace-pre-wrap">{wireproxyLicense}</pre>
      </details>
    </div>
  );
}
