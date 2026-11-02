import { initArticle } from "./article.js?v=20261102h";

let cleanupArticle = () => {}, observer, controller, moving = false, sequence = 0, start;
let visibleUrl = location.href;
const drafts = new Map();
const state = () => ({ ...history.state, languageSwap: false, diarySwap: true });
const main = () => document.querySelector("main.diary-shell");
const slider = () => main()?.querySelector(".diary-slider");
function mount() {
  observer?.disconnect();
  const root = main(), reader = slider(), current = reader?.querySelector(".is-current");
  if (!root || !reader || !current) return;
  const fit = () => { if (reader.isConnected) reader.style.height = current.getBoundingClientRect().height + "px"; };
  observer = new ResizeObserver(fit);
  observer.observe(current);
  fit();
  cleanupArticle = initArticle(root);
  const draft = drafts.get(root.dataset.slug), form = root.querySelector("#comment-form");
  if (draft && form) {
    for (const [name,value] of Object.entries(draft.values)) form.elements[name].value = value;
    root.querySelector("#comment-composer").open = draft.open;
    root.querySelector("#reply-label").textContent = draft.reply;
    root.querySelector("#reply-label").hidden = !draft.values.parentId;
    root.querySelector("#cancel-reply").hidden = !draft.values.parentId;
  }
  start = null;
}
function saveDraft() {
  const root=main(), form=root?.querySelector("#comment-form");
  if (form) drafts.set(root.dataset.slug, {
    values:Object.fromEntries(["name","email","body","parentId"].map(name=>[name,form.elements[name].value])),
    open:root.querySelector("#comment-composer").open,
    reply:root.querySelector("#reply-label").textContent,
  });
}
function syncHead(target) {
  document.title = target.title;
  const selector='meta[name="description"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"]';
  document.head.querySelectorAll(selector).forEach(node=>node.remove());
  target.head.querySelectorAll(selector).forEach(node=>document.head.append(document.importNode(node,true)));
}
function animate(track, step) {
  if (!track || !step || matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  return new Promise(resolve=>{
    const finish = event => {
      if (event && event.target !== track) return;
      clearTimeout(timer);track.removeEventListener("transitionend",finish);resolve();
    };
    const timer=setTimeout(finish,250);
    track.addEventListener("transitionend",finish);
    track.classList.add(step===1 ? "to-older" : "to-newer");
  });
}
async function navigate(href, { step = 0, push = true } = {}) {
  const url=new URL(href,location.href);
  if (url.origin!==location.origin || !/^\/diary(?:\/\d{4}-\d{2}-\d{2})?\/$/.test(url.pathname)) return;
  if (moving && push) return;
  controller?.abort();controller=new AbortController();
  const currentSequence=++sequence;
  moving=true;start=null;
  const reader=slider(),track=reader?.querySelector(".diary-track"),nav=main()?.querySelector(".diary-navigation");
  const scrollTop=scrollY, scrollToReader=reader && reader.getBoundingClientRect().top < 0;
  nav?.setAttribute("aria-busy","true");
  document.querySelector(".diary-navigation-notice")?.remove();
  try {
    const [response] = await Promise.all([
      fetch(url.href,{cache:"no-store",signal:controller.signal,headers:{"X-Requested-With":"diary-navigation"}}),
      animate(track,step),
    ]);
    if (!response.ok) throw Error("日記を読み込めませんでした。もう一度お試しください。");
    const target=new DOMParser().parseFromString(await response.text(),"text/html");
    const next=target.querySelector("main.diary-shell[data-slug]");
    if (!next || !next.querySelector(".diary-slider")) throw Error("日記を読み込めませんでした。");
    if (currentSequence!==sequence) return;
    saveDraft();cleanupArticle();observer?.disconnect();
    main().replaceWith(document.importNode(next,true));
    syncHead(target);
    if (push) history.pushState(state(),"",url.href);
    visibleUrl=url.href;
    mount();
    slider().focus({preventScroll:true});
    if (scrollToReader) slider().scrollIntoView({block:"start",behavior:"instant"});
    else window.scrollTo({top:scrollTop,behavior:"instant"});
  } catch (error) {
    if (currentSequence!==sequence || error.name==="AbortError") return;
    if (!push) history.replaceState(state(),"",visibleUrl);
    const notice=document.createElement("p");notice.className="diary-navigation-notice";
    notice.setAttribute("role","status");notice.textContent=error.message;
    nav?.after(notice);
  } finally {
    if (currentSequence===sequence) {
      moving=false;track?.classList.remove("to-older","to-newer");nav?.removeAttribute("aria-busy");
    }
  }
}
function move(step) {
  const link=main()?.querySelector(`[data-diary-step="${step}"]`);
  if (link) navigate(link.href,{step});
}
document.addEventListener("click",event=>{
  const link=event.target.closest(".diary-navigation a[data-diary-step],.diary-archive a");
  if (!link || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();navigate(link.href,{step:Number(link.dataset.diaryStep)||0});
});
document.addEventListener("keydown",event=>{
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target.closest("input,textarea,select,[contenteditable='true'],summary,button,a")) return;
  if (window.getSelection()?.toString()) return;
  const step=event.key==="ArrowRight" ? 1 : event.key==="ArrowLeft" ? -1 : 0;
  if (step && main()?.querySelector(`[data-diary-step="${step}"]`)) {event.preventDefault();move(step);}
});
document.addEventListener("pointerdown",event=>{
  const reader=event.target.closest(".diary-slider");
  if (!reader || event.pointerType!=="touch" || !event.isPrimary || event.target.closest("a,button,input,textarea")) return;
  start={x:event.clientX,y:event.clientY,id:event.pointerId};
});
document.addEventListener("pointercancel",()=>{start=null;});
document.addEventListener("pointerup",event=>{
  if (!start || start.id!==event.pointerId) return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;
  if (Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.25) move(dx<0 ? 1 : -1);
});
addEventListener("popstate",event=>{
  if (event.state?.diarySwap) navigate(location.href,{push:false});
});
addEventListener("pageshow",()=>{
  moving=false;main()?.querySelector(".diary-track")?.classList.remove("to-older","to-newer");
});
history.replaceState(state(),"",location.href);
mount();
