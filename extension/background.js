const SAVE_ID = "save-to-my-arcade";
const CUSTOM_ID = "customize-my-arcade";
const DEFAULT_BACKEND = "https://productline.vercel.app";
const WORKING = new Set(["uploading", "designing", "building"]);

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(() => { setup(); void resume(); });

function setup() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: SAVE_ID,
      title: "Save to My Arcade",
      contexts: ["image", "page", "link"],
    });
    chrome.contextMenus.create({
      id: CUSTOM_ID,
      title: "Customize…",
      contexts: ["image", "page", "link", "action"],
    });
  });
  chrome.alarms.create("my-arcade-jobs", { periodInMinutes: 1 });
  void resume();
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CUSTOM_ID) {
    const url = info.srcUrl || info.linkUrl || "";
    if (url) await stash({ kind: "url", url, at: Date.now() });
    await openCustomize();
    return;
  }
  if (info.menuItemId !== SAVE_ID) return;
  const url = info.srcUrl || info.linkUrl || info.pageUrl || tab?.url || "";
  if (!url) return note("Could not read that page.");
  await saveUrl(url);
});

chrome.action.onClicked.addListener((tab) => { void saveTab(tab); });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "my-arcade-jobs") void resume();
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (id.startsWith("ack-")) return;
  const { backend } = await chrome.storage.local.get({ backend: DEFAULT_BACKEND });
  await chrome.tabs.create({ url: `${String(backend).replace(/\/$/, "")}/shared` });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "region-selected" || !sender.tab?.windowId) return;
  const windowId = sender.tab.windowId;
  const rect = message.rect;
  chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) {
      stash({ kind: "error", message: chrome.runtime.lastError?.message || "Could not capture that region.", at: Date.now() }).then(openCustomize);
      return;
    }
    stash({ kind: "crop", dataUrl, rect, at: Date.now() }).then(openCustomize);
  });
  sendResponse({ ok: true });
  return true;
});

async function saveTab(tab) {
  let imageUrl = "";
  if (tab?.id && tab.url && /^https?:/i.test(tab.url)) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: mainImage,
      });
      imageUrl = result?.result || "";
    } catch { /* restricted page; capture instead */ }
  }
  if (imageUrl && /^https?:/i.test(imageUrl)) {
    await saveUrl(imageUrl);
    return;
  }
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab?.windowId, { format: "jpeg", quality: 82 });
    if (!dataUrl) throw new Error("Could not capture this tab.");
    const res = await fetch(dataUrl);
    await saveBlob(await res.blob(), "tab.jpg");
  } catch (err) {
    note(err instanceof Error ? err.message : "Could not save this tab.");
  }
}

function mainImage() {
  const abs = (value) => { try { return value ? new URL(value, location.href).href : ""; } catch { return ""; } };
  const meta = document.querySelector('meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"]');
  const og = abs(meta?.content);
  if (og && !/svg|logo|icon/i.test(og)) return og;
  let best = "";
  let score = 0;
  for (const img of document.images) {
    const src = abs(img.currentSrc || img.src);
    if (!src || src.startsWith("data:") || /svg|logo|icon|sprite|avatar|favicon/i.test(src)) continue;
    const next = (img.naturalWidth || img.width || 1) * (img.naturalHeight || img.height || 1);
    if (next > score) { score = next; best = src; }
  }
  return best;
}

async function saveUrl(url) {
  try {
    if (url.startsWith("data:image/")) {
      const res = await fetch(url);
      await saveBlob(await res.blob(), "share.jpg");
      return;
    }
    if (!/^https?:/i.test(url)) throw new Error("That link can’t be saved.");
    const data = await postJson({ url });
    await accepted(data);
  } catch (err) {
    note(err instanceof Error ? err.message : "Could not save that.");
  }
}

async function saveBlob(blob, name) {
  const body = new FormData();
  body.set("image", blob, name);
  const data = await post(body, true);
  await accepted(data);
}

async function postJson(payload) {
  return post(JSON.stringify(payload), false);
}

async function post(body, form) {
  const { backend, token } = await chrome.storage.local.get({ backend: DEFAULT_BACKEND, token: "" });
  const headers = {};
  if (token) headers["X-Share-Token"] = token;
  if (!form) headers["Content-Type"] = "application/json";
  const res = await fetch(`${String(backend).replace(/\/$/, "")}/api/share`, { method: "POST", headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save that.");
  return data;
}

async function accepted(data) {
  ack();
  if (!data.shareId) return;
  const { jobs = [] } = await chrome.storage.session.get("jobs");
  const next = [...new Set([data.shareId, ...jobs])];
  await chrome.storage.session.set({ jobs: next });
  await paintBadge(next.length);
  void watch(data.shareId);
}

function ack() {
  chrome.notifications.create(`ack-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128.png"),
    title: "Saved to My Arcade",
    message: "Your surprise is being made",
  });
}

function note(message) {
  chrome.notifications.create(`ack-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128.png"),
    title: "My Arcade",
    message,
  });
}

async function resume() {
  const { jobs = [] } = await chrome.storage.session.get("jobs");
  await paintBadge(jobs.length);
  for (const id of jobs) void watch(id);
}

const watching = new Set();

async function watch(id) {
  if (watching.has(id)) return;
  watching.add(id);
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      await wait(attempt === 0 ? 1200 : 2000);
      const { jobs = [] } = await chrome.storage.session.get("jobs");
      if (!jobs.includes(id)) return;
      const data = await readShare(id);
      if (WORKING.has(data.step)) continue;
      await finish(id, data);
      return;
    }
  } catch { /* the alarm retries anything still in the list */ }
  finally { watching.delete(id); }
}

async function readShare(id) {
  const { backend, token } = await chrome.storage.local.get({ backend: DEFAULT_BACKEND, token: "" });
  const headers = token ? { "X-Share-Token": token } : {};
  const res = await fetch(`${String(backend).replace(/\/$/, "")}/api/share/${id}`, { headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "That share is gone.");
  return data;
}

async function finish(id, data) {
  const { jobs = [] } = await chrome.storage.session.get("jobs");
  const next = jobs.filter((job) => job !== id);
  await chrome.storage.session.set({ jobs: next });
  await paintBadge(next.length);
  if (data.step !== "ready") return;
  const price = formatPrice(data.price);
  const message = data.reveal || [data.title || data.categoryName || "Your product", price].filter(Boolean).join(", ");
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128.png"),
    title: "My Arcade",
    message,
  });
}

function formatPrice(value) {
  if (!value) return "";
  const amount = Number(value.amount);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: value.currency || "USD",
    maximumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount);
}

async function paintBadge(count) {
  await chrome.action.setBadgeBackgroundColor({ color: "#161616" });
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
}

function stash(pending) {
  return chrome.storage.session.set({ pending });
}

async function openCustomize() {
  await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 420,
    height: 760,
    focused: true,
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
