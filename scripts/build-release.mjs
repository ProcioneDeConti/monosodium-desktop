// Builds every release artifact into dist-release/:
//
//   MonosodiumDesktop-<v>-offline-setup.exe   NSIS installer, WebView2 runtime embedded (~250 MB)
//   MonosodiumDesktop-<v>-offline.msi          WiX installer, WebView2 runtime embedded
//   MonosodiumDesktop-<v>-online-setup.exe     NSIS installer, downloads WebView2 at setup (~4 MB)
//   MonosodiumDesktop-<v>-online.msi           WiX installer, downloads WebView2 at setup
//   MonosodiumDesktop-<v>-portable.exe         standalone exe, no installer (needs WebView2 present)
//
// The base tauri.conf.json bundles the offline runtime. The "online" pair is the same compiled
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

const tauri = (args) => execFileSync(npx, ["tauri", ...args], { stdio: "inherit", cwd: root });

function collect(variant) {
  for (const sub of ["nsis", "msi"]) {
    const dir = join(bundleDir, sub);
    const src = readdirSync(dir).find((n) => n.endsWith(sub === "nsis" ? "-setup.exe" : ".msi"));
    if (!src) throw new Error(`no ${sub} bundle in ${dir}`);
    const ext = sub === "nsis" ? "-setup.exe" : ".msi";
    copyFileSync(join(dir, src), join(outDir, `MonosodiumDesktop-${version}-${variant}${ext}`));
  }
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
