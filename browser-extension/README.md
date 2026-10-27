# Open in Monosodium Desktop (browser extension)

Opens e621 / e926 / e6AI links in the Monosodium Desktop app instead of the browser - the
desktop version of Android's "open supported links in this app".

## Install (unpacked)

The app must be installed and launched once first; that registers the `monosodium://` link type
with Windows.

- **Chrome / Edge / Brave:** go to `chrome://extensions` (or `edge://extensions`), turn on
  **Developer mode**, click **Load unpacked**, and pick this `browser-extension` folder.
- **Firefox:** drag the signed `dist/open-in-monosodium-<version>.xpi` onto a Firefox window (or
  `about:addons` → gear → **Install Add-on From File…**). It's signed as an *unlisted* AMO add-on
  (self-distributed, not on the public store). To re-sign after changes, bump `version` in
  `manifest.json` and run, from this folder:
  `npx web-ext sign --channel=unlisted --artifacts-dir=dist --ignore-files="dist/**" README.md`
  with `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` set to AMO API credentials. `dist/` is gitignored.

The first time a link opens, the browser asks "Open Monosodium Desktop?". Tick **Always allow**
so it stops asking.

## Using it

- Opening any supported e621 page (posts, searches, pools, users, wiki, artists, popular,
  favorites) sends it to the app. The tab shows **Close tab** / **Open again** / **View in
  browser instead**. Picking that keeps the tab in the browser until you close it, so you can
  keep browsing e621 there.
- **Toolbar icon:** pauses or resumes the extension. While paused the badge reads "off".
- **Right-click a link → Open in Monosodium Desktop:** works even while paused.
- Pages the app doesn't have (forum, login, account settings, uploads...) are left in the browser.

## How it works

The extension wraps the page URL as `monosodium://open?url=<page>`. The app maps that page to
its own screens (`src/lib/deepLink.ts`). The list of supported pages in `background.js` must stay
in sync with that parser. The app sends unsupported pages back to the browser, so if the
extension redirected one it would loop.
