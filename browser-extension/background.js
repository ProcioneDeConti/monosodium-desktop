// Open in Monosodium Desktop - hands e621 / e6AI page loads to the desktop app.
//
// When a tab is about to load a supported e621/e6AI page, the tab is sent to handoff.html, which
// launches `monosodium://open?url=<page>` (the app maps the page to its own screens - see
// src/lib/deepLink.ts in the app) and offers "close tab" / "view in browser instead".
//
// Only pages the app can show are redirected (SUPPORTED below mirrors the app's parser). That
// matters: the app sends anything it can't show back to the browser, and redirecting those again
// would loop.

const api = globalThis.browser ?? globalThis.chrome;

const HOSTS = new Set(["e621.net", "e926.net", "e6ai.net"]);
/** Pages the app handles - keep in sync with parseSiteUrl() in the app's src/lib/deepLink.ts. */
const SUPPORTED = [
  /^\/$/,
  /^\/posts\/?$/,
  /^\/posts\/\d+\/?$/,
  /^\/pools\/\d+\/?$/,
  /^\/users\/\d+\/?$/,
  /^\/favorites\/?$/,
  /^\/explore\/posts\/popular\/?$/,
  /^\/wiki_pages\/[^/]+\/?$/,
  /^\/artists\/[^/]+\/?$/,
];

// Tabs where the user picked "view in browser instead" stay browser tabs until closed - so a
// reload, redirect or Cloudflare check on that page (or clicking around e621 in it) doesn't bounce
// it back to the app. Kept in storage.session: the background script can be unloaded between
// events (MV3), which would wipe an in-memory set.
async function bypassedTabs() {
  const { bypassTabs = [] } = await api.storage.session.get("bypassTabs");
  return bypassTabs;
}
async function setBypassed(tabId, on) {
  const tabs = new Set(await bypassedTabs());
  if (on) tabs.add(tabId);
  else tabs.delete(tabId);
  await api.storage.session.set({ bypassTabs: [...tabs] });
}
api.tabs.onRemoved.addListener((tabId) => void setBypassed(tabId, false));

function isSupported(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (!HOSTS.has(host)) return false;
  const path = u.pathname;
  if (path === "/favorites" && !u.searchParams.get("user_name")) return false;
  if (/^\/(wiki_pages|artists)\/\d+\/?$/.test(path)) return false; // id-only pages: app wants names
  // show_or_new takes the name from the query instead - same rule (present, not numeric).
  const showOrNew = path.match(/^\/(wiki_pages|artists)\/show_or_new\/?$/);
  if (showOrNew) {
    const name = u.searchParams.get(showOrNew[1] === "wiki_pages" ? "title" : "name");
    if (!name || /^\d+$/.test(name)) return false;
  }
  // The app rejects a path it can't %-decode; don't hand it one.
  try {
    path.split("/").forEach(decodeURIComponent);
  } catch {
    return false;
  }
  return SUPPORTED.some((re) => re.test(path));
}

async function enabled() {
  const { enabled = true } = await api.storage.local.get("enabled");
  return enabled;
}

function handoffUrl(pageUrl) {
  return api.runtime.getURL(`handoff.html?url=${encodeURIComponent(pageUrl)}`);
}

api.webNavigation.onBeforeNavigate.addListener(async (d) => {
  if (d.frameId !== 0 || !isSupported(d.url)) return;
  if ((await bypassedTabs()).includes(d.tabId)) return;
  if (!(await enabled())) return;
  api.tabs.update(d.tabId, { url: handoffUrl(d.url) });
});

// handoff.html marks its tab as a browser tab when the user picks "view in browser instead".
// Returning the promise makes sendMessage wait until it's stored, so the navigation can't win.
api.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (msg && msg.type === "bypass" && tabId !== undefined) return setBypassed(tabId, true).then(() => true);
});

// --- toolbar button: pause / resume ---
async function paintAction() {
  const on = await enabled();
  api.action.setBadgeText({ text: on ? "" : "off" });
  api.action.setBadgeBackgroundColor({ color: "#777" });
  api.action.setTitle({ title: `Monosodium Desktop: ${on ? "ON (click to pause)" : "PAUSED (click to resume)"}` });
}
api.action.onClicked.addListener(async () => {
  await api.storage.local.set({ enabled: !(await enabled()) });
  paintAction();
});

// --- right-click any e621 link: open it in the app, even while paused ---
function setupMenu() {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({
      id: "open-in-monosodium",
      title: "Open in Monosodium Desktop",
      contexts: ["link"],
      targetUrlPatterns: ["*://e621.net/*", "*://e926.net/*", "*://e6ai.net/*", "*://*.e621.net/*", "*://*.e926.net/*", "*://*.e6ai.net/*"],
    });
  });
}
api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "open-in-monosodium" || !info.linkUrl || !tab) return;
  // Opened from an existing page - launch straight away rather than replacing that page.
  api.tabs.create({ url: handoffUrl(info.linkUrl), index: tab.index + 1 });
});

api.runtime.onInstalled.addListener(() => {
  setupMenu();
  paintAction();
});
api.runtime.onStartup.addListener(paintAction);
