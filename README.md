# Monosodium Desktop

An unofficial Windows desktop client for [e621](https://e621.net) and [e6AI](https://e6ai.net), built with Tauri and React. The desktop counterpart to [MonosodiumPDC](https://github.com/ProcioneDeConti/MonosodiumPDC), the same author's Android client - the name's a nod to that project's own codename.

This is a personal project, not affiliated with or endorsed by e621 or e6AI. It talks to them exclusively through their official public API, respecting its rate limits and User-Agent requirements.

## Features

- **e621 and e6AI, one app** - switch between e621 and e6AI (e621's AI-generated content sister site) with a single toggle, each keeping its own separate login. A health-check dot next to the toggle shows whether the active site is reachable (green/checking/red), and both the window's title bar and the shell's own site button always reflect which one you're browsing - click the latter to jump back to the default search from anywhere.
- **Browsing & search** - tag-chip search bar with live, category-colored autocomplete suggestions. A Pinterest-style masonry grid keeps each post's real aspect ratio instead of cropping to a square, with an always-visible info dock (rating, score, favorite status, filetype) on every thumbnail and a movie-icon badge with duration for video/animated posts. A dedicated refresh button resets to the first page rather than re-validating a long scroll history.
- **Post viewer** - full-screen viewer for images, GIFs, APNGs, and video (native WebView2 decoding, no bundled video engine needed), with wheel-zoom/drag-to-pan on images, custom loop/speed/mute video controls, voting, favoriting, tag actions (search, add to search, exclude, add to blacklist) via a category-colored tag chip menu, and a detailed info panel (score, dimensions, MD5, uploader, sources, etc. - click any value to copy it).
- **Blacklist** - client-side blacklist filtering with a quick disable/re-enable toggle (temporarily unhidden posts get a caution-stripe border), plus import/export against your account's saved e621 blacklist.
- **Favorites** - one click from the shell.
- **User profiles** - your own profile and any post's uploader (avatar, level, join date, stats, feedback, about/artist info), with shortcuts into their posts and favorites.
- **Downloads** - save a post's original file with one click, into your Pictures/Videos folder by default or a folder of your choice (Settings).
- **Adjustable content ratings** - an adult-mode master switch plus per-rating (Safe/Questionable/Explicit) toggles.
- **Accent color theming**, a Mica window backdrop, and a random welcome greeting in Settings.

## Requirements

- Windows 11 (uses the built-in WebView2 runtime and Mica backdrop)
- An e621 and/or e6AI account (optional, and separate from each other) - required for voting, favoriting, and blacklist sync; browsing works without one

## Building

Requires [Rust](https://www.rust-lang.org/tools/install) and [Node.js](https://nodejs.org/).

```
git clone https://github.com/ProcioneDeConti/monosodium-desktop.git
cd monosodium-desktop
npm install
npm run tauri dev    # run in development
npm run tauri build  # produce an installer
```

## Tech stack

Tauri 2 (Rust), React 19 + TypeScript + Vite, Tailwind CSS v4, TanStack Query, Zustand, and `masonic` for the virtualized masonry grid.

## License

The source code in this repository is available under the terms in [LICENSE](LICENSE) - free to use, modify, and redistribute, provided the original copyright and attribution notices are kept intact.

## Disclaimer

Transparency is important. This app is a personal project. <ins>**Parts of this app, including some of the third-party tools, libraries, and dependencies it relies on behind the scenes, were written with the assistance of AI tools.**</ins> If this bothers you, please do not install, use, or otherwise disseminate its content. I have not, nor will I ever claim I am a developer: competent or otherwise. I use AI to do what I otherwise may not have been able to do on my own.
