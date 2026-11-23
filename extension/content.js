// Radar content script (LinkedIn + X). It only reads posts that are already on
// your screen, and only when you click a Radar button. It never scrolls, clicks,
// likes, messages or makes requests to LinkedIn/X.
(() => {
  if (window.__radarLoaded) return;
  window.__radarLoaded = true;

  const host = location.hostname;
  const site = /(^|\.)linkedin\.com$/.test(host) ? "linkedin" : /(^|\.)(x|twitter)\.com$/.test(host) ? "x" : "other";

  const POST = {
    x: 'article[data-testid="tweet"]',
    linkedin:
      '[data-urn^="urn:li:activity:"],[data-urn^="urn:li:ugcPost:"],[data-urn^="urn:li:share:"],[data-id^="urn:li:activity:"],.feed-shared-update-v2',
  }[site];

  const T = (e) => (e ? (e.innerText || "").replace(/[ \t]+\n/g, "\n").trim() : "");

  /** Outermost matching post container for a node (LinkedIn nests them). */
  function postFor(node) {
    if (!POST || !node) return null;
    let el = node.nodeType === 1 ? node : node.parentElement;
    let found = null;
    while (el && (el = el.closest(POST))) {
      found = el;
      el = el.parentElement;
    }
    return found;
  }

  function openPostOnPage() {
    if (site === "x" && /\/status\//.test(location.pathname)) return document.querySelector(POST);
    if (site === "linkedin" && /\/(posts|feed\/update)\//.test(location.pathname)) return document.querySelector(POST);
    return null;
  }

  /** Build the same payload the bookmarklet sends to /capture. */
  function extract(box, selection = "") {
    let url = location.href, a = "", at = "", tt = "", pa = "", l = "";
    let text = selection;
    if (box) {
      if (site === "x") {
        const textEl = box.querySelector('[data-testid="tweetText"]');
        text = text || T(textEl) || T(box);
        const time = box.querySelector('a[href*="/status/"] time');
        if (time) {
          pa = time.getAttribute("datetime") || "";
          url = time.closest("a").href;
        }
        const user = box.querySelector('[data-testid="User-Name"]');
        if (user) a = T(user).split("\n")[0];
        const like = box.querySelector('[data-testid="like"],[data-testid="unlike"]');
        if (like) l = like.getAttribute("aria-label") || T(like);
      }
      if (site === "linkedin") {
        const q = (s) => box.querySelector(s);
        const urn = box.getAttribute("data-urn") || box.getAttribute("data-id") || q("[data-urn]")?.getAttribute("data-urn") || "";
        const m = urn.match(/urn:li:(activity|ugcPost|share):\d+/);
        if (m) url = "https://www.linkedin.com/feed/update/" + m[0] + "/";
        const body = q(".update-components-text, .feed-shared-update-v2__description, .feed-shared-inline-show-more-text");
        text = text || T(body) || T(box);
        a = T(q('.update-components-actor__title span[aria-hidden="true"]') || q('.update-components-actor__name span[aria-hidden="true"]'));
        at = T(q('.update-components-actor__description span[aria-hidden="true"]'));
        tt = T(q('.update-components-actor__sub-description span[aria-hidden="true"]'));
        l = T(q(".social-details-social-counts__reactions-count") || q(".social-details-social-counts__social-proof-fallback-number"));
      }
    }
    text = (text || "").trim();
    if (!text) return null;
    return {
      u: url,
      t: text.slice(0, 2500),
      a: a.slice(0, 200),
      at: at.slice(0, 300),
      tt: tt.slice(0, 100),
      pa,
      l: l.slice(0, 60),
      s: site,
    };
  }

  function send(payload) {
    chrome.runtime.sendMessage({ type: "radar:open", payload });
  }

  /** Popup / shortcut / right-click: use the selection, else the open post. */
  function captureCurrent() {
    const sel = String(window.getSelection?.() || "").trim();
    const box = postFor(window.getSelection?.()?.anchorNode) || openPostOnPage();
    const payload = extract(box, sel);
    if (payload) send(payload);
    return !!payload;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === "radar:capture") reply({ ok: captureCurrent() });
  });

  // ---- one button per post ----
  if (!POST) return;

  const css = document.createElement("style");
  css.textContent = `
.radar-btn{all:initial;position:absolute;z-index:5;top:10px;right:${site === "x" ? "64px" : "92px"};
display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;cursor:pointer;
font:600 12px/18px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#065f46;background:#ecfdf5;
border:1px solid #a7f3d0;opacity:.55;transition:opacity .15s,background .15s}
.radar-btn:hover{opacity:1;background:#d1fae5}
.radar-btn[data-done]{opacity:1;color:#fff;background:#059669;border-color:#059669}
.radar-btn i{all:initial;width:7px;height:7px;border-radius:50%;background:#10b981}
.radar-btn[data-done] i{background:#fff}`;
  document.documentElement.appendChild(css);

  function decorate(box) {
    if (box.dataset.radar || box.parentElement?.closest(POST)) return;
    box.dataset.radar = "1";
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "radar-btn";
    b.title = "Save this post to Radar";
    b.innerHTML = "<i></i>Radar";
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = String(window.getSelection?.() || "").trim();
      const inside = sel && box.contains(window.getSelection().anchorNode);
      const payload = extract(box, inside ? sel : "");
      if (!payload) return;
      send(payload);
      b.dataset.done = "1";
      b.lastChild.textContent = "Sent to Radar";
    });
    box.appendChild(b);
  }

  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll(POST).forEach(decorate);
  };
  new MutationObserver(() => {
    if (!queued) {
      queued = true;
      setTimeout(scan, 300);
    }
  }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
