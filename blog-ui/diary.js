import "./article.js";

const slider = document.querySelector(".diary-slider");
const track = slider?.querySelector(".diary-track");
const current = track?.querySelector(".is-current");
if (slider && track && current) {
  const links = [...document.querySelectorAll("[data-diary-step]")];
  let moving = false;
  const fit = () => { slider.style.height = current.getBoundingClientRect().height + "px"; };
  new ResizeObserver(fit).observe(current);
  fit();
  function move(step) {
    const link = links.find(a => Number(a.dataset.diaryStep) === step);
    if (!link || moving) return;
    moving = true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      location.assign(link.href);
      return;
    }
    track.classList.add(step === 1 ? "to-older" : "to-newer");
    let navigated = false;
    const finish = () => { if (!navigated) { navigated = true; location.assign(link.href); } };
    track.addEventListener("transitionend", finish, {once:true});
    setTimeout(finish, 300);
  }
  for (const link of links) link.addEventListener("click", event => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    move(Number(link.dataset.diaryStep));
  });
  document.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target.closest("input,textarea,select,[contenteditable='true'],summary,button,a")) return;
    if (window.getSelection()?.toString()) return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step && links.some(a=>Number(a.dataset.diaryStep)===step)) {event.preventDefault();move(step);}
  });
  let start;
  slider.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch" || !event.isPrimary || event.target.closest("a,button,input,textarea")) return;
    start = {x:event.clientX,y:event.clientY,id:event.pointerId};
  });
  slider.addEventListener("pointercancel", () => { start = null; });
  slider.addEventListener("pointerup", event => {
    if (!start || start.id !== event.pointerId) return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    start=null;
    if (Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.25) move(dx<0 ? 1 : -1);
  });
  // Back/forward may restore a page after its outgoing transition.
  addEventListener("pageshow", () => {moving=false;track.classList.remove("to-older","to-newer");fit();});
}
