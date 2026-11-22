//! App-only WireGuard VPN. The user imports a standard WireGuard `.conf`; this app runs the bundled
//! wireproxy (https://github.com/windtf/wireproxy, ISC - a userspace WireGuard client, no driver,
//! no admin) as a hidden child process exposing a SOCKS5 proxy on loopback, and net.rs points every
//! HTTP client *and* WebView2 at it. Only this app's traffic goes through the tunnel; the rest of
//! the system is untouched.
//!
//! - **On/off** lives in a plain `<data>/vpn.json` (not a secret, and it must be readable at launch
//!   before the vault is unlocked). It takes effect at the next launch - see net.rs.
//! - **The profile** (keys, endpoint) lives encrypted in credentials.dat. The private key never
//!   touches disk in plaintext: wireproxy's config references it as `$MONOSODIUM_WG_PRIVATE_KEY`,
//!   passed in the child's environment. (wireproxy doesn't expand env vars for `PreSharedKey`, so
//!   a PSK, when there is one, sits in the temp config for the ~second until the proxy is up; the
//!   file is deleted as soon as wireproxy is listening.)
//! - **Fail-closed**: with the VPN on, clients always target the tunnel port. If wireproxy dies,
//!   requests fail until the supervisor restarts it - there's no fallback to the direct connection.
//! - The child is put in a kill-on-close job object, so it can't outlive the app (even a crash).

use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::net::{IpAddr, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::{credentials, net, paths, vault};

const VPN_FILE: &str = "vpn.json";
const KEY_ENV: &str = "MONOSODIUM_WG_PRIVATE_KEY";
const STATUS_EVENT: &str = "vpn-status";
/// Used when the imported config has no (IP) `DNS =` line - wireproxy needs one to resolve
/// anything, and it's queried *through* the tunnel.
const FALLBACK_DNS: &str = "1.1.1.1";
const LOG_LINES: usize = 40;

#[cfg(has_wireproxy)]
static WIREPROXY: Option<&[u8]> = Some(include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/vendor/wireproxy.exe")));
#[cfg(not(has_wireproxy))]
static WIREPROXY: Option<&[u8]> = None;

// ---------------------------------------------------------------------------------------------
// On/off flag
// ---------------------------------------------------------------------------------------------

#[derive(Default, Serialize, Deserialize)]
struct VpnFile {
    enabled: bool,
}

fn vpn_file() -> PathBuf {
    paths::data_root().join(VPN_FILE)
}

pub(crate) fn enabled_on_disk() -> bool {
    std::fs::read(vpn_file())
        .ok()
        .and_then(|b| serde_json::from_slice::<VpnFile>(&b).ok())
        .is_some_and(|f| f.enabled)
}

fn write_enabled(enabled: bool) -> Result<(), String> {
    let json = serde_json::to_vec(&VpnFile { enabled }).map_err(|e| e.to_string())?;
    paths::write_atomic(&vpn_file(), &json).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------
// Profile: parsing + validating a wg-quick style .conf
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct WgPeer {
    pub public_key: String,
    #[serde(default)]
    pub preshared_key: Option<String>,
    pub endpoint: String,
    pub allowed_ips: Vec<String>,
    #[serde(default)]
    pub keepalive: Option<u32>,
}

/// What's stored in credentials.dat - only the fields wireproxy understands, already validated.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct WgProfile {
    pub name: String,
    pub addresses: Vec<String>,
    pub private_key: String,
    pub dns: Vec<String>,
    #[serde(default)]
    pub mtu: Option<u32>,
    pub peers: Vec<WgPeer>,
    /// The config had no usable DNS line, so `dns` is `[FALLBACK_DNS]`.
    #[serde(default)]
    pub dns_defaulted: bool,
}

/// The non-secret view the frontend gets.
#[derive(Serialize)]
pub struct ProfileSummary {
    pub name: String,
    pub addresses: Vec<String>,
    pub endpoints: Vec<String>,
    pub dns: Vec<String>,
    /// True when the config had no usable DNS line and `FALLBACK_DNS` is used instead.
    pub dns_defaulted: bool,
    /// Whether some peer routes everything (0.0.0.0/0). If not, sites outside the config's
    /// AllowedIPs won't load at all while the VPN is on.
    pub full_tunnel: bool,
}

impl WgProfile {
    fn summary(&self) -> ProfileSummary {
        ProfileSummary {
            name: self.name.clone(),
            addresses: self.addresses.clone(),
            endpoints: self.peers.iter().map(|p| p.endpoint.clone()).collect(),
            dns: self.dns.clone(),
            dns_defaulted: self.dns_defaulted,
            full_tunnel: self.peers.iter().any(|p| p.allowed_ips.iter().any(|a| a == "0.0.0.0/0")),
        }
    }
}

fn valid_key(k: &str) -> bool {
    BASE64.decode(k).is_ok_and(|b| b.len() == 32)
}

fn valid_cidr(s: &str) -> bool {
    let (ip, prefix) = s.split_once('/').unwrap_or((s, ""));
    let Ok(ip) = ip.parse::<IpAddr>() else { return false };
    prefix.is_empty() || prefix.parse::<u8>().is_ok_and(|p| p <= if ip.is_ipv4() { 32 } else { 128 })
}

fn valid_endpoint(s: &str) -> bool {
    let Some((host, port)) = s.rsplit_once(':') else { return false };
    let host = host.strip_prefix('[').and_then(|h| h.strip_suffix(']')).unwrap_or(host);
    !host.is_empty()
        && port.parse::<u16>().is_ok_and(|p| p != 0)
        && host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':' | '_'))
}

fn list(v: &str) -> impl Iterator<Item = String> + '_ {
    v.split(',').map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

/// Parses a WireGuard config as exported by WireGuard for Windows / wg-quick / VPN providers.
/// Keys wireproxy has no use for (PostUp, Table, SaveConfig, ListenPort...) are dropped; anything
/// it would choke on (a non-IP DNS search domain) is filtered out.
pub(crate) fn parse_conf(text: &str, name: &str) -> Result<WgProfile, String> {
    enum Section {
        None,
        Interface,
        Peer,
        Other,
    }
    let mut section = Section::None;
    let mut interfaces = 0;
    let (mut addresses, mut private_key, mut dns, mut mtu) = (Vec::new(), None::<String>, Vec::new(), None);
    let mut peers: Vec<WgPeer> = Vec::new();

    for (n, raw) in text.lines().enumerate() {
        // Base64 keys never contain '#' or ';', so stripping trailing comments is safe.
        let line = raw.split(['#', ';']).next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            section = match line[1..line.len() - 1].trim().to_ascii_lowercase().as_str() {
                "interface" => {
                    interfaces += 1;
                    Section::Interface
                }
                "peer" => {
                    peers.push(WgPeer {
                        public_key: String::new(),
                        preshared_key: None,
                        endpoint: String::new(),
                        allowed_ips: Vec::new(),
                        keepalive: None,
                    });
                    Section::Peer
                }
                _ => Section::Other,
            };
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            return Err(format!("Line {} isn't \"Key = Value\"", n + 1));
        };
        let (key, value) = (key.trim().to_ascii_lowercase(), value.trim());
        // wireproxy expands `$NAME` values from its environment - never let a config do that.
        if value.starts_with('$') {
            return Err(format!("Line {}: values starting with '$' aren't supported", n + 1));
        }
        match section {
            Section::Interface => match key.as_str() {
                "address" => addresses.extend(list(value)),
                "privatekey" => private_key = Some(value.to_string()),
                "dns" => dns.extend(list(value).filter(|d| d.parse::<IpAddr>().is_ok())),
                "mtu" => mtu = Some(value.parse::<u32>().map_err(|_| format!("Line {}: bad MTU", n + 1))?),
                _ => {}
            },
            Section::Peer => {
                let peer = peers.last_mut().expect("peer section pushed");
                match key.as_str() {
                    "publickey" => peer.public_key = value.to_string(),
                    "presharedkey" => peer.preshared_key = Some(value.to_string()),
                    "endpoint" => peer.endpoint = value.to_string(),
                    "allowedips" => peer.allowed_ips.extend(list(value)),
                    "persistentkeepalive" => {
                        peer.keepalive = Some(
                            value.parse::<u32>().map_err(|_| format!("Line {}: bad PersistentKeepalive", n + 1))?,
                        )
                    }
                    _ => {}
                }
            }
            Section::None => return Err(format!("Line {} is outside any [Interface]/[Peer] section", n + 1)),
            Section::Other => {}
        }
    }

    if interfaces != 1 {
        return Err("The config needs exactly one [Interface] section".into());
    }
    let private_key = private_key.ok_or("[Interface] has no PrivateKey")?;
    if !valid_key(&private_key) {
        return Err("PrivateKey isn't a valid WireGuard key".into());
    }
    if addresses.is_empty() {
        return Err("[Interface] has no Address".into());
    }
    if let Some(bad) = addresses.iter().find(|a| !valid_cidr(a)) {
        return Err(format!("Address \"{bad}\" isn't an IP address"));
    }
    if peers.is_empty() {
        return Err("The config has no [Peer] section".into());
    }
    for (i, p) in peers.iter().enumerate() {
        let which = if peers.len() > 1 { format!("[Peer] #{}", i + 1) } else { "[Peer]".into() };
        if !valid_key(&p.public_key) {
            return Err(format!("{which} has no valid PublicKey"));
        }
        if p.preshared_key.as_deref().is_some_and(|k| !valid_key(k)) {
            return Err(format!("{which} PresharedKey isn't a valid WireGuard key"));
        }
        if !valid_endpoint(&p.endpoint) {
            return Err(format!("{which} needs an Endpoint like vpn.example.com:51820"));
        }
        if p.allowed_ips.is_empty() {
            return Err(format!("{which} has no AllowedIPs"));
        }
        if let Some(bad) = p.allowed_ips.iter().find(|a| !valid_cidr(a)) {
            return Err(format!("{which} AllowedIPs entry \"{bad}\" isn't valid"));
        }
    }
    let dns_defaulted = dns.is_empty();
    if dns_defaulted {
        dns.push(FALLBACK_DNS.to_string());
    }
    let name = match name.trim() {
        "" => "WireGuard".to_string(),
        n => n.chars().take(64).collect(),
    };
    Ok(WgProfile { name, addresses, private_key, dns, mtu, peers, dns_defaulted })
}

/// wireproxy's config: the profile (private key by env reference) + one SOCKS5 listener.
fn render_wireproxy(p: &WgProfile, socks_port: u16) -> String {
    let mut s = String::new();
    s.push_str("[Interface]\n");
    s.push_str(&format!("Address = {}\n", p.addresses.join(", ")));
    s.push_str(&format!("PrivateKey = ${KEY_ENV}\n"));
    s.push_str(&format!("DNS = {}\n", p.dns.join(", ")));
    if let Some(mtu) = p.mtu {
        s.push_str(&format!("MTU = {mtu}\n"));
    }
    for peer in &p.peers {
        s.push_str("\n[Peer]\n");
        s.push_str(&format!("PublicKey = {}\n", peer.public_key));
        if let Some(psk) = &peer.preshared_key {
            s.push_str(&format!("PreSharedKey = {psk}\n"));
        }
        s.push_str(&format!("Endpoint = {}\n", peer.endpoint));
        s.push_str(&format!("AllowedIPs = {}\n", peer.allowed_ips.join(", ")));
        if let Some(k) = peer.keepalive {
            s.push_str(&format!("PersistentKeepalive = {k}\n"));
        }
    }
    s.push_str(&format!("\n[Socks5]\nBindAddress = 127.0.0.1:{socks_port}\n"));
    s
}

// ---------------------------------------------------------------------------------------------
// Child process
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TunnelState {
    /// VPN wasn't on at launch.
    Off,
    /// On, but credentials.dat is still locked behind the vault password.
    Locked,
    Starting,
    /// wireproxy is up and accepting connections (the WireGuard handshake is reported separately).
    Running,
    Error,
}

struct Runtime {
    child: Option<Child>,
    /// Bumped on every (re)start/stop, so a stale supervisor or log reader knows to bow out.
    generation: u64,
    state: TunnelState,
    error: Option<String>,
    log: VecDeque<String>,
    /// Consecutive unexpected exits, for the restart backoff.
    crashes: u32,
    /// The current wireproxy's health endpoint (`-i`) - see `metrics()`.
    info_port: Option<u16>,
    /// Bytes moved by earlier wireproxy processes this session (each restart zeroes its counters),
    /// plus the latest reading from the current one - together, this session's usage.
    carried: (u64, u64),
    last_seen: (u64, u64),
}

static RT: Mutex<Runtime> = Mutex::new(Runtime {
    child: None,
    generation: 0,
    state: TunnelState::Off,
    error: None,
    log: VecDeque::new(),
    crashes: 0,
    info_port: None,
    carried: (0, 0),
    last_seen: (0, 0),
});
static APP: OnceLock<AppHandle> = OnceLock::new();

fn emit_status() {
    if let Some(app) = APP.get() {
        let _ = app.emit(STATUS_EVENT, ());
    }
}

fn set_state(generation: u64, state: TunnelState, error: Option<String>) {
    let mut rt = RT.lock().unwrap();
    if rt.generation == generation {
        rt.state = state;
        rt.error = error;
    }
    drop(rt);
    emit_status();
}

fn push_log(generation: u64, line: String) {
    let mut rt = RT.lock().unwrap();
    if rt.generation != generation {
        return;
    }
    if rt.log.len() >= LOG_LINES {
        rt.log.pop_front();
    }
    rt.log.push_back(line);
}


fn sha256(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// Writes the embedded wireproxy.exe to `<data>/bin/` (once per version - the file name carries
/// the hash) and re-verifies it before every launch, so a swapped-out file is never run.
fn ensure_binary() -> Result<PathBuf, String> {
    let bytes = WIREPROXY.ok_or("This build doesn't include the WireGuard engine (wireproxy)")?;
    static HASH: OnceLock<String> = OnceLock::new();
    let hash = HASH.get_or_init(|| sha256(bytes));
    let dir = paths::data_root().join("bin");
    let path = dir.join(format!("wireproxy-{}.exe", &hash[..12]));
    if std::fs::read(&path).is_ok_and(|b| sha256(&b) == *hash) {
        return Ok(path);
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    paths::write_atomic(&path, bytes).map_err(|e| format!("Couldn't write wireproxy.exe: {e}"))?;
    Ok(path)
}

/// One job object for the process lifetime with KILL_ON_JOB_CLOSE: Windows closes the handle when
/// this process exits for any reason, taking every assigned wireproxy down with it.
fn assign_to_job(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    // HANDLE is a raw pointer (not Sync) - kept as an integer; it's never closed on purpose.
    static JOB: OnceLock<usize> = OnceLock::new();
    let job = *JOB.get_or_init(|| unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return 0;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        job as usize
    });
    if job != 0 {
        unsafe {
            AssignProcessToJobObject(job as _, child.as_raw_handle() as _);
        }
    }
}

fn kill_current(rt: &mut Runtime) {
    if let Some(mut child) = rt.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn log_tail(rt: &Runtime, n: usize) -> String {
    rt.log.iter().rev().take(n).rev().cloned().collect::<Vec<_>>().join("\n")
}

/// Starts (or restarts) wireproxy for this session's proxy port and blocks until it's listening
/// or has failed. Run off the main thread.
fn start_blocking() {
    let Some(socks_port) = net::proxy_port() else { return };
    let generation = {
        let mut rt = RT.lock().unwrap();
        kill_current(&mut rt);
        rt.generation += 1;
        rt.state = TunnelState::Starting;
        rt.error = None;
        rt.log.clear();
        rt.info_port = None;
        rt.carried = (rt.carried.0 + rt.last_seen.0, rt.carried.1 + rt.last_seen.1);
        rt.last_seen = (0, 0);
        rt.generation
    };
    emit_status();
    if let Err(e) = spawn(generation, socks_port) {
        set_state(generation, TunnelState::Error, Some(e));
        return;
    }
    supervise(generation);
}

fn spawn(generation: u64, socks_port: u16) -> Result<(), String> {
    if vault::is_password_protected() && vault::current_key().is_none() {
        set_state(generation, TunnelState::Locked, None);
        return Ok(());
    }
    let profile = credentials::wireguard_profile().ok_or("No WireGuard config imported")?;
    let exe = ensure_binary()?;
    let info_port = std::net::TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .map_err(|e| format!("No free local port: {e}"))?;

    // %TEMP% is per-user (user-only ACL), unlike a portable data folder that may sit on a USB stick.
    let conf_path = std::env::temp_dir().join(format!("monosodium-wg-{}-{generation}.conf", std::process::id()));
    std::fs::write(&conf_path, render_wireproxy(&profile, socks_port)).map_err(|e| e.to_string())?;
    let remove_conf = || {
        let _ = std::fs::remove_file(&conf_path);
    };

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    use std::os::windows::process::CommandExt;
    let spawned = Command::new(&exe)
        .arg("-c")
        .arg(&conf_path)
        // Health endpoint for handshake/traffic stats - loopback only. Note its /metrics includes
        // the private key; see `metrics()`.
        .arg("-i")
        .arg(format!("127.0.0.1:{info_port}"))
        .env(KEY_ENV, &profile.private_key)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    let mut child = match spawned {
        Ok(c) => c,
        Err(e) => {
            remove_conf();
            return Err(format!("Couldn't start wireproxy: {e}"));
        }
    };
    assign_to_job(&child);
    for stream in [child.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
                   child.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>)]
        .into_iter()
        .flatten()
    {
        std::thread::spawn(move || {
            // wireproxy logs every worker goroutine start at DEBUG - only keep the meaningful lines.
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                if !line.starts_with("DEBUG:") {
                    push_log(generation, line);
                }
            }
        });
    }
    {
        let mut rt = RT.lock().unwrap();
        if rt.generation != generation {
            // Superseded while spawning (stop/restart raced us).
            let _ = child.kill();
            remove_conf();
            return Ok(());
        }
        rt.child = Some(child);
        rt.info_port = Some(info_port);
    }

    // Ready = the SOCKS port accepts connections. Bad keys/endpoints make wireproxy exit at once.
    let addr = SocketAddr::from(([127, 0, 0, 1], socks_port));
    let deadline = Instant::now() + Duration::from_secs(15);
    let result = loop {
        {
            let mut rt = RT.lock().unwrap();
            if rt.generation != generation {
                break Ok(());
            }
            if let Some(status) = rt.child.as_mut().and_then(|c| c.try_wait().ok().flatten()) {
                rt.child = None;
                drop(rt);
                std::thread::sleep(Duration::from_millis(200)); // let the log readers catch up
                let tail = log_tail(&RT.lock().unwrap(), 6);
                break Err(format!("wireproxy exited ({status}){}", if tail.is_empty() { String::new() } else { format!(":\n{tail}") }));
            }
        }
        if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
            set_state(generation, TunnelState::Running, None);
            RT.lock().unwrap().crashes = 0;
            break Ok(());
        }
        if Instant::now() > deadline {
            break Err("wireproxy didn't open its proxy port in time".into());
        }
        std::thread::sleep(Duration::from_millis(150));
    };
    remove_conf();
    result
}

/// Watches a child that came up fine; if it later dies on its own, restarts it with backoff. A
/// start that fails outright (bad key, wireproxy refusing the config) has no child left to watch,
/// so it stays in `Error` for the user to fix or retry with Reconnect rather than looping. Same
/// for `Locked` - the vault unlock starts it.
fn supervise(generation: u64) {
    loop {
        std::thread::sleep(Duration::from_secs(1));
        let mut rt = RT.lock().unwrap();
        if rt.generation != generation {
            return;
        }
        let Some(child) = rt.child.as_mut() else { return };
        let Some(status) = child.try_wait().ok().flatten() else { continue };
        rt.child = None;
        rt.state = TunnelState::Error;
        rt.error = Some(format!("wireproxy stopped ({status}) - reconnecting"));
        rt.crashes += 1;
        let wait = Duration::from_secs((1u64 << rt.crashes.min(5)).min(30));
        drop(rt);
        emit_status();
        std::thread::sleep(wait);
        if RT.lock().unwrap().generation != generation {
            return;
        }
        std::thread::spawn(start_blocking);
        return;
    }
}

/// Called from setup and after a vault unlock. No-op when the VPN wasn't on at launch.
pub(crate) fn start_if_enabled(app: &AppHandle) {
    let _ = APP.set(app.clone());
    if net::proxy_port().is_some() {
        std::thread::spawn(start_blocking);
    }
}

fn stop() {
    let mut rt = RT.lock().unwrap();
    kill_current(&mut rt);
    rt.generation += 1;
    rt.state = TunnelState::Off;
    rt.error = None;
    drop(rt);
    emit_status();
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

#[derive(Serialize)]
pub struct VpnStatus {
    /// This build carries the wireproxy engine.
    pub available: bool,
    /// The saved on/off flag (what the next launch will do).
    pub enabled: bool,
    /// The VPN is in effect for this session (it was on at launch).
    pub active: bool,
    pub profile: Option<ProfileSummary>,
    pub state: TunnelState,
    pub error: Option<String>,
    pub log: Vec<String>,
    /// Seconds since the most recent WireGuard handshake (any peer). `None` = none yet.
    pub handshake_age_secs: Option<u64>,
    /// Bytes received / sent through the tunnel this session (summed across wireproxy restarts).
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Debug, Default, PartialEq)]
struct Metrics {
    /// Unix seconds of the newest handshake; 0 = never.
    last_handshake: u64,
    rx: u64,
    tx: u64,
}

/// Reads the three numbers we want out of wireproxy's `/metrics` (the WireGuard UAPI dump, one
/// `key=value` per line, a block per peer). **That dump starts with `private_key=`** - the
/// endpoint is unauthenticated on loopback, accepted as a trade-off for these stats (owner's
/// call: private, single-user machines). This parser is a whitelist, so the key never gets
/// further than this function: not into status, logs, or the frontend.
fn parse_metrics(body: &str) -> Metrics {
    let mut m = Metrics::default();
    for line in body.lines() {
        let Some((k, v)) = line.split_once('=') else { continue };
        let Ok(v) = v.trim().parse::<u64>() else { continue };
        match k.trim() {
            "last_handshake_time_sec" => m.last_handshake = m.last_handshake.max(v),
            "rx_bytes" => m.rx += v,
            "tx_bytes" => m.tx += v,
            _ => {}
        }
    }
    m
}

async fn fetch_metrics(info_port: u16) -> Option<Metrics> {
    // Plain loopback client, deliberately *not* net::client_builder(): this talks to wireproxy
    // itself, not through it.
    let client = reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(2)).build().ok()?;
    let resp = client.get(format!("http://127.0.0.1:{info_port}/metrics")).send().await.ok()?;
    resp.status().is_success().then_some(())?;
    Some(parse_metrics(&resp.text().await.ok()?))
}

#[tauri::command]
pub async fn vpn_status() -> VpnStatus {
    let (state, error, log, info_port) = {
        let rt = RT.lock().unwrap();
        (rt.state, rt.error.clone(), rt.log.iter().cloned().collect(), rt.info_port)
    };
    let metrics = match (state, info_port) {
        (TunnelState::Running, Some(port)) => fetch_metrics(port).await,
        _ => None,
    };
    let (handshake_age_secs, rx_bytes, tx_bytes) = {
        let mut rt = RT.lock().unwrap();
        // Only record readings from the wireproxy that's still current (not one replaced meanwhile).
        if let Some(m) = metrics.as_ref().filter(|_| rt.info_port == info_port) {
            rt.last_seen = (m.rx, m.tx);
        }
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
        let age = metrics.filter(|m| m.last_handshake > 0).map(|m| now.saturating_sub(m.last_handshake));
        (age, rt.carried.0 + rt.last_seen.0, rt.carried.1 + rt.last_seen.1)
    };
    VpnStatus {
        available: WIREPROXY.is_some(),
        enabled: enabled_on_disk(),
        active: net::proxy_port().is_some(),
        profile: credentials::wireguard_profile().map(|p| p.summary()),
        state,
        error,
        log,
        handshake_age_secs,
        rx_bytes,
        tx_bytes,
    }
}

/// Validates + saves a config. If the VPN is live this session, reconnects with it right away.
#[tauri::command]
pub fn vpn_import_config(text: String, name: String) -> Result<ProfileSummary, String> {
    if text.len() > 64 * 1024 {
        return Err("That file is too large to be a WireGuard config".into());
    }
    let profile = parse_conf(&text, &name)?;
    credentials::save_wireguard_profile(profile.clone())?;
    if net::proxy_port().is_some() {
        std::thread::spawn(start_blocking);
    }
    Ok(profile.summary())
}

/// Forgets the config and turns the VPN off. If it was live, the frontend relaunches - until then
/// this session stays pointed at the (now stopped) tunnel, i.e. offline.
#[tauri::command]
pub fn vpn_remove_config() -> Result<(), String> {
    write_enabled(false)?;
    credentials::delete_wireguard_profile()?;
    stop();
    Ok(())
}

/// Saves the on/off flag for the next launch (the frontend relaunches straight after).
#[tauri::command]
pub fn vpn_set_enabled(enabled: bool) -> Result<(), String> {
    if enabled {
        if WIREPROXY.is_none() {
            return Err("This build doesn't include the WireGuard engine".into());
        }
        if credentials::wireguard_profile().is_none() {
            return Err("Import a WireGuard config first".into());
        }
    }
    write_enabled(enabled)
}

#[tauri::command]
pub fn vpn_reconnect() -> Result<(), String> {
    if net::proxy_port().is_none() {
        return Err("The VPN isn't on".into());
    }
    RT.lock().unwrap().crashes = 0;
    std::thread::spawn(start_blocking);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "uCTIK+56CPyCvwJxmU5dBfuyJvPuSXAq1FzHdnIxe1Q=";
    const PUB: &str = "QP+A67Z2UBrMgvNIdHv8gPel5URWNLS4B3ZQ2hQIZlg=";

    fn conf(extra_iface: &str, extra_peer: &str) -> String {
        format!(
            "[Interface]\nPrivateKey = {KEY}\nAddress = 10.2.0.2/32, fd00::2/128\n{extra_iface}\n\n\
             [Peer]\n# comment\nPublicKey = {PUB}\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = vpn.example.com:51820\n{extra_peer}\n"
        )
    }

    #[test]
    fn parses_typical_provider_config() {
        let p = parse_conf(&conf("DNS = 10.2.0.1, corp.lan\nPostUp = iptables -A\nTable = off", "PersistentKeepalive = 25"), " Home ")
            .unwrap();
        assert_eq!(p.name, "Home");
        assert_eq!(p.addresses, ["10.2.0.2/32", "fd00::2/128"]);
        assert_eq!(p.dns, ["10.2.0.1"]); // search domain dropped
        assert!(!p.dns_defaulted);
        assert_eq!(p.peers[0].keepalive, Some(25));
        assert!(p.summary().full_tunnel);
    }

    #[test]
    fn defaults_dns_and_rejects_bad_input() {
        let p = parse_conf(&conf("", ""), "").unwrap();
        assert!(p.dns_defaulted);
        assert_eq!(p.dns, [FALLBACK_DNS]);
        assert!(parse_conf(&conf("", "").replace(KEY, "nope"), "").is_err());
        assert!(parse_conf(&conf("", "").replace("vpn.example.com:51820", "vpn.example.com"), "").is_err());
        assert!(parse_conf(&conf("MTU = $HOME", ""), "").is_err());
        assert!(parse_conf("[Peer]\nPublicKey = x\n", "").is_err());
    }

    #[test]
    fn metrics_parser_sums_peers_and_ignores_everything_else() {
        let body = "private_key=00ff\nlisten_port=5\npublic_key=ab\nlast_handshake_time_sec=100\n\
                    rx_bytes=10\ntx_bytes=20\npublic_key=cd\nlast_handshake_time_sec=300\nrx_bytes=1\ntx_bytes=2\nerrno=0\n";
        assert_eq!(parse_metrics(body), Metrics { last_handshake: 300, rx: 11, tx: 22 });
    }

    #[test]
    fn renders_key_by_env_reference() {
        let p = parse_conf(&conf("", &format!("PresharedKey = {PUB}")), "").unwrap();
        let out = render_wireproxy(&p, 4242);
        assert!(!out.contains(KEY));
        assert!(out.contains(&format!("PrivateKey = ${KEY_ENV}")));
        assert!(out.contains("PreSharedKey = "));
        assert!(out.contains("[Socks5]\nBindAddress = 127.0.0.1:4242"));
    }
}
