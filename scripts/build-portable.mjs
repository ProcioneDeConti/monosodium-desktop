// Copies the raw tauri build output into dist-portable/ as a standalone,
// installer-free exe - no Start Menu/Desktop/registry entries, since it's
// never run through the NSIS/MSI bundler. WebView2 is linked directly into
// the binary (no companion DLLs needed), so this file alone is enough to run
// the app wherever the WebView2 runtime is already present - Windows 11 ships
// it by default, and most current Windows 10 machines have it via Edge. Unlike
// the installer, the portable exe does not bundle an offline runtime copy.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const src = new URL("../src-tauri/target/release/monosodium-desktop.exe", import.meta.url);
const outDir = new URL("../dist-portable/", import.meta.url);
const dest = new URL(`../dist-portable/MonosodiumDesktop-${pkg.version}-portable.exe`, import.meta.url);

if (!existsSync(src)) {
  console.error("Release exe not found - run `npm run tauri build` first.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(src, dest);
console.log(`Portable exe written to dist-portable/MonosodiumDesktop-${pkg.version}-portable.exe`);
