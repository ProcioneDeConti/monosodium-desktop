// The tab lands here instead of the e621 page: launch the app, then offer close / retry / bypass.
const api = globalThis.browser ?? globalThis.chrome;
const pageUrl = new URLSearchParams(location.search).get("url") ?? "";
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
  await api.runtime.sendMessage({ type: "bypass" });
  location.replace(pageUrl);
});

if (/^https:\/\/([a-z0-9-]+\.)?(e621|e926|e6ai)\.net\//i.test(pageUrl)) launch();
