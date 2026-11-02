import { api, session, status } from "./common.js";
let current = null;
const enable = document.querySelector("#confirm-notification");
const disable = document.querySelector("#unsubscribe-notification");
function readLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("confirm") || params.get("unsubscribe");
  const action = params.has("confirm") ? "confirm" : "unsubscribe";
  history.replaceState(null, "", location.pathname);
  enable.hidden = true;
  disable.hidden = true;
  status("notice", "");
  current = token && /^[a-f0-9]{64}$/.test(token) ? { token, action } : null;
  if (!current) return;
  const button = action === "confirm" ? enable : disable;
  button.hidden = false;
  button.disabled = false;
  document.querySelector("#notification-description").textContent =
    action === "confirm"
      ? "このコメントへの返信通知を有効にします。"
      : "このコメントへの返信通知を解除します。";
}
async function apply(event) {
  const link = current;
  if (!link) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await session();
    await api("/api/blog/subscriptions/" + link.action, {
      method: "POST",
      body: { token: link.token },
    });
    if (current !== link) return;
    status(
      "notice",
      link.action === "confirm"
        ? "返信通知を有効にしました。"
        : "返信通知を解除しました。",
    );
    button.hidden = true;
    current = null;
  } catch (e) {
    if (current === link) {
      status("notice", e.message);
      button.disabled = false;
    }
  }
}
enable.addEventListener("click", apply);
disable.addEventListener("click", apply);
window.addEventListener("hashchange", readLink);
readLink();
