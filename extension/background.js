import { RADAR } from "./config.js";

function openCapture(payload, besideTab) {
  const url = RADAR + "/capture#" + encodeURIComponent(JSON.stringify(payload));
  chrome.tabs.create({ url, ...(besideTab ? { index: besideTab.index + 1, openerTabId: besideTab.id } : {}) });
}

/** Ask the page's content script; if there is none (not LinkedIn/X), use the selection Chrome gives us. */
async function captureTab(tab, selectionText = "", linkUrl = "") {
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: "radar:capture" });
    if (r?.ok) return true;
  } catch {
    /* no content script on this page */
  }
  let text = selectionText;
  if (!text) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => String(window.getSelection?.() || "").trim(),
      });
      text = res?.result || "";
    } catch {
      /* chrome:// pages etc. */
    }
  }
  if (!text) return false;
  openCapture({ u: linkUrl || tab.url, t: text.slice(0, 2500), s: "other" }, tab);
  return true;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "radar-save", title: "Save to Radar", contexts: ["selection", "page", "link"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "radar-save" || !tab) return;
  const ok = await captureTab(tab, info.selectionText || "", info.linkUrl || "");
  if (!ok) chrome.tabs.create({ url: RADAR + "/leads/new" });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "save-post") return;
  tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab) await captureTab(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "radar:open" && msg.payload) {
    openCapture(msg.payload, sender.tab);
    reply({ ok: true });
  }
  if (msg?.type === "radar:popup-capture") {
    captureTab(msg.tab).then((ok) => reply({ ok }));
    return true;
  }
});
