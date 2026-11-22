// Mirrors src-tauri/src/wireguard.rs's VpnStatus / ProfileSummary.

export type TunnelState = "off" | "locked" | "starting" | "running" | "error";

export interface VpnProfileSummary {
  name: string;
  addresses: string[];
  endpoints: string[];
  dns: string[];
  /** The config had no usable DNS line; 1.1.1.1 (queried through the tunnel) is used instead. */
  dns_defaulted: boolean;
  /** Some peer routes 0.0.0.0/0. If false, sites outside the config's AllowedIPs won't load. */
  full_tunnel: boolean;
}

export interface VpnStatus {
  /** This build includes the wireproxy engine. */
  available: boolean;
  /** Saved on/off flag - what the next launch does. */
  enabled: boolean;
  /** The VPN is in effect for this session (it was on at launch). */
  active: boolean;
  profile: VpnProfileSummary | null;
  state: TunnelState;
  error: string | null;
  log: string[];
  /** Seconds since the latest WireGuard handshake; null = none yet. */
  handshake_age_secs: number | null;
  /** Tunnel traffic this session (survives wireproxy restarts, resets on app launch). */
  rx_bytes: number;
  tx_bytes: number;
}
