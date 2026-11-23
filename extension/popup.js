import { RADAR } from "./config.js";

document.getElementById("open").href = RADAR;
document.getElementById("add").href = RADAR + "/leads/new";

document.getElementById("save").addEventListener("click", async () => {
  const msg = document.getElementById("msg");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const r = await chrome.runtime.sendMessage({ type: "radar:popup-capture", tab });
  if (r?.ok) window.close();
  else msg.textContent = "Select some of the post's text first (or open the post on its own page), then try again.";
});
