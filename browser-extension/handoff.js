// The tab lands here instead of the e621 page: launch the app, then offer close / retry / bypass.
const api = globalThis.browser ?? globalThis.chrome;
const pageUrl = new URLSearchParams(location.search).get("url") ?? "";
const SITES = ["e621.net", "e926.net", "e6ai.net"];

/** The page rebuilt as https on a fixed, allowlisted host, or null if it isn't an e621-family
 *  page (background.js only hands off bare / www. hosts). Never navigate to the raw ?url= value -
 *  it could be javascript: etc. */
function safePageUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  // Rebuild from the constant, not the input, so the destination host can't be attacker-shaped.
  const site = SITES.find((s) => s === host);
  if (!site) return null;
  return `https://${site}${u.pathname}${u.search}${u.hash}`;
}
const safeUrl = safePageUrl(pageUrl);
const deepLink = `monosodium://open?url=${encodeURIComponent(pageUrl)}`;

document.getElementById("url").textContent = pageUrl;

function launch() {
  // The browser shows its own "Open Monosodium Desktop?" prompt the first time (tick "always").
  location.href = deepLink;
}

document.getElementById("close").addEventListener("click", async () => {
  const tab = await api.tabs.getCurrent();
  if (tab?.id !== undefined) api.tabs.remove(tab.id);
});
document.getElementById("retry").addEventListener("click", launch);
document.getElementById("browser").addEventListener("click", async () => {
  if (safeUrl === null) return;
  await api.runtime.sendMessage({ type: "bypass" });
  location.replace(safeUrl);
});

if (safeUrl !== null) launch();
