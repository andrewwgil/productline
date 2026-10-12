const MENU_ID = "make-with-arcade";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Make it with Arcade",
    contexts: ["image"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  await stash({ kind: "url", url: info.srcUrl, at: Date.now() });
  await openUi();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "region-selected" || !sender.tab?.windowId) return;
  const windowId = sender.tab.windowId;
  const rect = message.rect;
  chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) {
      stash({ kind: "error", message: chrome.runtime.lastError?.message || "Could not capture that region.", at: Date.now() }).then(openUi);
      return;
    }
    stash({ kind: "crop", dataUrl, rect, at: Date.now() }).then(openUi);
  });
  sendResponse({ ok: true });
  return true;
});

function stash(pending) {
  return chrome.storage.session.set({ pending });
}

async function openUi() {
  try {
    await chrome.action.openPopup();
  } catch {
    await chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      width: 420,
      height: 760,
      focused: true,
    });
  }
}
