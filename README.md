# Monosodium Desktop

An unofficial Windows desktop client for [e621](https://e621.net) and [e6AI](https://e6ai.net), built with Tauri and React. It's the desktop counterpart to [MonosodiumPDC](https://github.com/ProcioneDeConti/MonosodiumPDC), the same author's Android client - the name is a nod to that project's own codename.

This is a personal project, not affiliated with or endorsed by e621 or e6AI. It talks to them exclusively through their official public API, and it respects that API's rate limits and User-Agent requirements.

## Features

- **e621 and e6AI in one app** - switch between e621 and e6AI (e621's AI-generated-content sister site) with a single toggle, each keeping its own separate login. A health-check dot next to the toggle shows whether the active site is reachable (green / checking / red), and both the window title bar and the shell's own site button always reflect which one you're browsing - click that button to jump back to the default search from anywhere.
- **Search and browsing** - a tag-chip search bar with live, category-colored autocomplete. A Pinterest-style masonry grid keeps every post's real aspect ratio instead of cropping to a square, with an always-visible info dock (rating, score, favorite status, filetype) on each thumbnail and a duration badge on video and animated posts. A dedicated refresh button jumps back to the first page instead of re-validating a long scroll history.
- **Post viewer** - a full-screen viewer for images, GIFs, APNGs, and video (decoded natively by WebView2, so there's no bundled video engine), with wheel-zoom and drag-to-pan on images, custom loop / speed / mute controls on video, voting, favoriting, tag actions (search, add to search, exclude, add to blacklist) from a category-colored tag-chip menu, and a detailed info panel where clicking any value copies it.
- **Client-side blacklist** - the same matching rules as the Android app, with a quick disable / re-enable toggle (temporarily unhidden posts get a caution-stripe border) and import/export against the blacklist saved on your account.
- **Favorites and profiles** - your favorites are one click from the shell; open your own profile or any post's uploader to see their avatar, level, join date, stats, feedback, and about/artist text, with shortcuts straight into their posts and favorites.
- **Saved searches** - store searches locally and re-run them with one click. e621 has no server-side saved-search feature, so these live only on your machine.
- **Comments, dmail, and the forum** - read and post comments on a post, send and receive dmail (with an unread badge in the shell), and browse forum topics.
- **Slideshow** - hands-off cycling through the current search results at an adjustable interval.
- **Downloads** - save a post's original file with one click, into your Pictures / Videos folder by default or a folder of your choice.
- **Backup and restore** - export an encrypted backup of your settings, saved searches, and other local data, and restore it later or on another machine.
- **Disk-cache management** - see how much space WebView2's cache is using and cap or clear it from Settings.
- **Update check** - an optional check against the GitHub releases page for a newer version.
- **Content rating controls** - an adult-mode master switch plus per-rating (Safe / Questionable / Explicit) toggles.
- **Theming** - an accent color, a light / dark / system theme override, and a random welcome greeting in Settings.

## Requirements

- **Windows 10 (version 1809 / build 17763 or newer) or Windows 11**, 64-bit. This is what Tauri 2 itself supports; older builds of Windows are not supported.
- **The WebView2 runtime.** Windows 11 ships it by default, and most up-to-date Windows 10 machines already have it via Microsoft Edge. If it's missing, the *offline* installer carries a full copy and installs it with no internet connection; the *online* installer downloads it from Microsoft during setup. The portable build carries neither, so it needs the runtime to already be present.
- **An e621 and/or e6AI account** is optional and separate per site. It's required for voting, favoriting, dmail, comments, and blacklist sync; plain browsing works without one.

## Install

Grab the latest build from the [Releases](https://github.com/ProcioneDeConti/monosodium-desktop/releases) page. Each release has three flavors, in both an NSIS `.exe` and a WiX `.msi` where an installer applies:

- **Offline installer** (`-offline-setup.exe` / `-offline.msi`, ~250 MB) - carries the full WebView2 Runtime and installs it with no network access. Use this on a machine that might not have the runtime, or for unattended/air-gapped installs.
- **Online installer** (`-online-setup.exe` / `-online.msi`, ~5 MB) - the same app, but it fetches the WebView2 Runtime from Microsoft during setup if it isn't already present. Much smaller; needs a connection the first time only.
- **Portable** (`-portable.exe`, ~12 MB) - a single self-contained executable with no installer, no registry entries, and no Start Menu shortcut. It keeps its data in a `data` folder next to the exe when that location is writable, and falls back to `%LOCALAPPDATA%\Monosodium Desktop` otherwise. Needs the WebView2 Runtime already installed.

All three are the same compiled build - the only difference is how (or whether) the WebView2 Runtime is handled.

## How it works

- The frontend never calls e621 or e6AI directly. Every API request goes through the Rust backend, which sets the required descriptive `User-Agent` and passes each call through a per-site rate limiter (a 2-request burst refilling at 1/second) so the app stays within the API's limits.
- Media (thumbnails, samples, full files) loads straight from the CDN as plain `<img>` / `<video>` URLs. It never goes through the backend, so your API key is never sent to a CDN host.
- Your login for each site is stored in an encrypted local vault on your machine, not in plain text.

## Building

You'll need [Rust](https://www.rust-lang.org/tools/install) and [Node.js](https://nodejs.org/).

```
git clone https://github.com/ProcioneDeConti/monosodium-desktop.git
cd monosodium-desktop
npm install
npm run tauri dev     # run in development
npm run tauri build   # produce the offline installer
npm run dist          # offline installer + portable exe
npm run release       # every flavor (offline + online installers + portable) into dist-release/
```

The first `cargo` build pulls a few hundred crates and takes a minute or two; builds after that are incremental and quick.

## Tech stack

Tauri 2 (Rust), React 19 + TypeScript + Vite, Tailwind CSS v4, TanStack Query, Zustand, and `masonic` for the virtualized masonry grid.

## License

The source code in this repository is available under the terms in [LICENSE](LICENSE) - free to use, modify, and redistribute, provided the original copyright and attribution notices are kept intact.

## Disclaimer

Transparency is important. This app is a personal project. <ins>**Parts of this app, including some of the third-party tools, libraries, and dependencies it relies on behind the scenes, were written with the assistance of AI tools.**</ins> If this bothers you, please do not install, use, or otherwise disseminate its content. I have not, nor will I ever claim I am a developer: competent or otherwise. I use AI to do what I otherwise may not have been able to do on my own.
