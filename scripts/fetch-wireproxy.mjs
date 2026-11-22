// Downloads the pinned wireproxy release (https://github.com/windtf/wireproxy, ISC licence) into
// src-tauri/vendor/wireproxy.exe, where src-tauri/build.rs picks it up and wireguard.rs embeds it
// with include_bytes! (one copy for every release flavour - the portable exe has no sidecar
// folder). The exe is gitignored; this script is the only way it gets there, and both the
// archive and the extracted exe are checked against pinned SHA-256s, so bumping the version
// means updating all three constants below by hand after checking the release.
//
// Usage: npm run fetch:wireproxy   (also run by npm run release; a no-op when already present)
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "v1.1.3";
const ARCHIVE_SHA256 = "bce041ea9fe0f8a3351301dcbe29cdf6a523bb25cf9c62f17ebb5699a8051d0f";
const EXE_SHA256 = "b176b561fd8bf15d828fcab484cfd5b4fb941cb9f61807901ca64b955af27e1f";
const URL_ = `https://github.com/windtf/wireproxy/releases/download/${VERSION}/wireproxy_windows_amd64.tar.gz`;

const root = fileURLToPath(new URL("..", import.meta.url));
const dest = join(root, "src-tauri/vendor/wireproxy.exe");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

if (existsSync(dest) && sha256(readFileSync(dest)) === EXE_SHA256) {
  console.log(`wireproxy ${VERSION} already present`);
  process.exit(0);
}

console.log(`fetching wireproxy ${VERSION}...`);
const res = await fetch(URL_);
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
const archive = Buffer.from(await res.arrayBuffer());
if (sha256(archive) !== ARCHIVE_SHA256) throw new Error("wireproxy archive checksum mismatch - refusing to use it");

// Extracted in its own empty temp folder; Windows 10+ ships bsdtar as tar.exe.
const work = mkdtempSync(join(tmpdir(), "wireproxy-"));
try {
  writeFileSync(join(work, "w.tar.gz"), archive);
  execFileSync("tar", ["-xzf", "w.tar.gz", "wireproxy.exe"], { cwd: work });
  const exe = readFileSync(join(work, "wireproxy.exe"));
  if (sha256(exe) !== EXE_SHA256) throw new Error("wireproxy.exe checksum mismatch - refusing to use it");
  writeFileSync(`${dest}.tmp`, exe);
  renameSync(`${dest}.tmp`, dest);
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`wireproxy ${VERSION} -> src-tauri/vendor/wireproxy.exe`);
