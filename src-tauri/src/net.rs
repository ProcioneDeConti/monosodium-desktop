//! Shared starting point for this app's outbound HTTP clients, so app-wide network policy - the
//! WireGuard tunnel's local SOCKS5 proxy (wireguard.rs) - is applied in one place.
//!
//! Whether the tunnel is on is decided **once per launch**, in [`init`], before any client or
//! webview exists: WebView2 only takes a proxy as a browser argument at environment creation, so
//! toggling the VPN means a relaunch (the frontend does that right after `vpn_set_enabled`).
//! When it's on, every client and every webview points at a fixed loopback port for the whole
//! session - and if wireproxy isn't listening there (not started yet, vault still locked, crashed),
//! requests simply fail. The app never falls back to the direct connection while the VPN is on.

use std::sync::OnceLock;

static PROXY_PORT: OnceLock<Option<u16>> = OnceLock::new();

const WEBVIEW2_ARGS_VAR: &str = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";

/// Must run after `cache::bootstrap()` (which sets the same env var) and before any HTTP client
/// or webview is built.
pub(crate) fn init() {
    let port = crate::wireguard::enabled_on_disk().then(|| {
        // Grab a free loopback port for this session. If even that fails, still pick one: a dead
        // port keeps the session offline, which is what "VPN on, tunnel not up" should mean.
        std::net::TcpListener::bind(("127.0.0.1", 0))
            .and_then(|l| l.local_addr())
            .map(|a| a.port())
            .unwrap_or(1)
    });
    let _ = PROXY_PORT.set(port);
    if let Some(port) = port {
        // Chromium resolves hostnames on the proxy side for socks5://, and always bypasses the
        // proxy for localhost - so `tauri dev`'s localhost:1420 dev server still loads.
        let existing = std::env::var(WEBVIEW2_ARGS_VAR).unwrap_or_default();
        let args = format!("{existing} --proxy-server=socks5://127.0.0.1:{port}");
        std::env::set_var(WEBVIEW2_ARGS_VAR, args.trim());
    }
}

/// The session's tunnel port when the VPN was on at launch.
pub(crate) fn proxy_port() -> Option<u16> {
    PROXY_PORT.get().copied().flatten()
}

fn with_proxy(builder: reqwest::ClientBuilder, scheme: &str) -> reqwest::ClientBuilder {
    match proxy_port().and_then(|p| reqwest::Proxy::all(format!("{scheme}://127.0.0.1:{p}")).ok()) {
        Some(proxy) => builder.proxy(proxy),
        None => builder,
    }
}

/// For known hosts (e621-family, Shlink, update checks): through the tunnel with DNS resolved on the
/// far side too (`socks5h`), so nothing about the destination leaks outside the tunnel.
pub(crate) fn client_builder() -> reqwest::ClientBuilder {
    with_proxy(reqwest::Client::builder(), "socks5h")
}

/// For clients that fetch **user-supplied** URLs behind `source_fetch`'s SSRF guard. Those rely on
/// a custom `dns_resolver` that rejects non-public addresses; with `socks5h` reqwest would hand
/// the hostname to the proxy and that resolver would never run - letting a post's source URL
/// reach the VPN peer's private network. Plain `socks5` resolves locally through the client's
/// resolver (so the guard still applies) and only then tunnels the connection: the traffic still
/// goes through the VPN, only these hosts' DNS lookups don't.
pub(crate) fn guarded_client_builder() -> reqwest::ClientBuilder {
    with_proxy(reqwest::Client::builder(), "socks5")
}
