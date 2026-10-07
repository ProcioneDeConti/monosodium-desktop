// Builds every release artifact into dist-release/:
//
//   MonosodiumDesktop-<v>-offline-setup.exe   NSIS installer, WebView2 runtime embedded (~210 MB)
//   MonosodiumDesktop-<v>-online-setup.exe     NSIS installer, downloads WebView2 at setup (~4 MB)
//   MonosodiumDesktop-<v>-portable.exe         standalone exe, no installer (needs WebView2 present)
//
// (No MSI: it was published through 1.14.94 and dropped - see PROGRESS.md. `bundle.targets` in
// tauri.conf.json is NSIS-only, so the bundler doesn't produce one.)
//
// The base tauri.conf.json bundles the offline runtime. The "online" installer is the same compiled
// binary re-bundled with `tauri bundle --config src-tauri/tauri.conf.online.json`, which merges
// in webviewInstallMode = downloadBootstrapper. Only the bundler re-runs for the second pass -
// no recompile - so ordering matters: the offline artifacts are copied out before the online
// bundle overwrites target/release/bundle/.
//
// Usage: npm run release            (full: tauri build + re-bundle + portable)
//        npm run release -- --skip-build   (reuse an existing target/release build)
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const skipBuild = process.argv.includes("--skip-build");

const bundleDir = join(root, "src-tauri/target/release/bundle");
const exePath = join(root, "src-tauri/target/release/monosodium-desktop.exe");
const outDir = join(root, "dist-release");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const tauri = (args) => execFileSync(npx, ["tauri", ...args], { stdio: "inherit", cwd: root, shell: process.platform === "win32" });

function collect(variant) {
  const dir = join(bundleDir, "nsis");
  // Match the version too - older builds' bundles linger in the same folder.
  const src = readdirSync(dir).find((n) => n.includes(`_${version}_`) && n.endsWith("-setup.exe"));
  if (!src) throw new Error(`no nsis bundle in ${dir}`);
  copyFileSync(join(dir, src), join(outDir, `MonosodiumDesktop-${version}-${variant}-setup.exe`));
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

if (!skipBuild) tauri(["build"]);
collect("offline");

tauri(["bundle", "--config", "src-tauri/tauri.conf.online.json"]);
collect("online");

copyFileSync(exePath, join(outDir, `MonosodiumDesktop-${version}-portable.exe`));

console.log(`\nRelease artifacts in dist-release/:`);
for (const f of readdirSync(outDir).sort()) console.log(`  ${f}`);
