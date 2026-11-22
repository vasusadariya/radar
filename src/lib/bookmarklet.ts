/**
 * The "Save to Radar" bookmarklet. It runs only when you click it, in the page
 * you're on: it reads the post under your text selection (or the open post),
 * then opens Radar's /capture page in a new tab with that data in the URL hash
 * (the hash never reaches a server log). No requests to LinkedIn/X are made.
 *
 * Selectors are best-effort; whatever they miss, the AI fills from the text and
 * you can edit on the capture page. Selecting the post text always works.
 */
export function bookmarkletSource(base: string): string {
  const code = `(()=>{
const B=${JSON.stringify(base)};
const sel=window.getSelection?String(window.getSelection()).trim():"";
let n=window.getSelection&&window.getSelection().anchorNode;
n=n?(n.nodeType===1?n:n.parentElement):null;
const h=location.hostname;
const site=/(^|\\.)linkedin\\.com$/.test(h)?"linkedin":/(^|\\.)(x|twitter)\\.com$/.test(h)?"x":"other";
const T=e=>e?(e.innerText||"").replace(/[ \\t]+\\n/g,"\\n").trim():"";
let box=null;
if(site==="x"){box=n&&n.closest("article");if(!box&&/\\/status\\//.test(location.pathname))box=document.querySelector("article");}
if(site==="linkedin"){box=n&&n.closest("[data-urn],[data-id],.feed-shared-update-v2");if(!box&&/\\/(posts|feed\\/update)\\//.test(location.pathname))box=document.querySelector("[data-urn],.feed-shared-update-v2");}
let text=sel||T(box);
let url=location.href,a="",at="",tt="",pa="",l="";
if(box&&site==="x"){
 const s=box.querySelector('a[href*="/status/"] time');if(s){pa=s.getAttribute("datetime")||"";url=s.closest("a").href;}
 const u=box.querySelector('[data-testid="User-Name"]');if(u)a=T(u).split("\\n")[0];
 const k=box.querySelector('[data-testid="like"],[data-testid="unlike"]');if(k)l=k.getAttribute("aria-label")||T(k);
}
if(box&&site==="linkedin"){
 const urn=box.getAttribute("data-urn")||box.getAttribute("data-id")||"";
 if(/urn:li:(activity|ugcPost|share):/.test(urn))url="https://www.linkedin.com/feed/update/"+urn+"/";
 const q=s=>box.querySelector(s);
 a=T(q('.update-components-actor__title span[aria-hidden="true"]')||q('.update-components-actor__name span[aria-hidden="true"]'));
 at=T(q('.update-components-actor__description span[aria-hidden="true"]'));
 tt=T(q('.update-components-actor__sub-description span[aria-hidden="true"]'));
 l=T(q(".social-details-social-counts__reactions-count")||q(".social-details-social-counts__social-proof-fallback-number"));
}
if(!text){alert("Radar: select the post's text first, then click Save to Radar.");return;}
const d={u:url,t:text.slice(0,2500),a:a.slice(0,200),at:at.slice(0,300),tt:tt.slice(0,100),pa:pa,l:l.slice(0,60),s:site};
window.open(B+"/capture#"+encodeURIComponent(JSON.stringify(d)),"_blank");
})()`;
  return `javascript:${encodeURIComponent(code.replace(/\n/g, ""))}`;
}
