import { api, session, el, status } from "./common.js";
const form = document.querySelector("#post-form");
let current = null,
  photo = null,
  posts = [],
  comments = [],
  busy = false;
let selected = "blog",
  baseline = "";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
function snapshot() {
  return JSON.stringify({
    title: form.elements.title.value,
    slug: form.elements.slug.value,
    body: form.elements.body.value,
    date: form.elements.date.value,
    music: form.elements.music.value,
    song: form.elements.song.value,
    photo,
    kind: form.elements.kind.value,
  });
}
function photoDisplay() {
  const image = document.querySelector("#photo-preview");
  image.hidden = !photo;
  if (photo) image.src = "/media/" + photo;
  else image.removeAttribute("src");
  document.querySelector("#remove-photo").hidden = !photo;
}
function fill(post, kind = selected) {
  current = post || null;
  photo = post?.photo || null;
  selected = post?.kind || kind;
  form.elements.kind.value = selected;
  form.elements.title.value = post?.title || "";
  form.elements.slug.value =
    post?.slug ||
    "post-" +
      today().replaceAll("-", "") +
      "-" +
      crypto.randomUUID().slice(0, 6);
  form.elements.body.value = post?.body || "";
  form.elements.date.value = post?.entry_date || today();
  form.elements.music.value = post?.music || "";
  form.elements.song.value = post?.song || "";
  document.querySelector("#photo").value = "";
  document.querySelector("#photo-state").textContent = "";
  photoDisplay();
  const isDiary = selected === "diary";
  document.querySelector("#blog-fields").hidden = isDiary;
  document.querySelector("#diary-fields").hidden = !isDiary;
  document.querySelector("#music-fields").hidden = !isDiary;
  form.elements.title.required = !isDiary;
  form.elements.slug.required = !isDiary;
  form.elements.date.required = isDiary;
  form.elements.body.required = !isDiary;
  document.querySelector("#editor-title").textContent = post
    ? isDiary
      ? "日記を編集"
      : "記事を編集"
    : isDiary
      ? "新しい日記"
      : "新しい記事";
  document.querySelector("#editor-state").textContent = post
    ? post.status === "published"
      ? "公開中"
      : "下書き"
    : "";
  document.querySelector("#preview").disabled = false;
  status("save-notice", "");
  baseline = snapshot();
  renderPosts();
}
async function loadPosts() {
  posts = await api("/api/admin/posts");
  renderPosts();
}
function renderPosts() {
  const list = document.querySelector("#posts");
  list.replaceChildren();
  const filtered = posts.filter((p) => (p.kind || "blog") === selected);
  if (!filtered.length)
    list.append(el("p", "まだありません。", { class: "empty-state" }));
  for (const p of filtered) {
    const row = el("button", undefined, {
      type: "button",
      class: "admin-row" + (current?.id === p.id ? " selected" : ""),
    });
    row.append(
      el("span", p.kind === "diary" ? p.entry_date : p.title, {
        class: "entry-title",
      }),
      el("small", p.status === "published" ? "公開中" : "下書き"),
    );
    row.addEventListener("click", () => {
      if (busy || (dirty() && !confirm("未保存の変更を破棄しますか？"))) return;
      fill(p);
    });
    list.append(row);
  }
}
function dirty() {
  return baseline !== "" && snapshot() !== baseline;
}
for (const tab of document.querySelectorAll("[data-tab]"))
  tab.addEventListener("click", () => {
    if (busy || (dirty() && !confirm("未保存の変更を破棄しますか？"))) return;
    const target = tab.dataset.tab;
    document.querySelector("#writing-panel").hidden = target === "comments";
    document.querySelector("#comments-panel").hidden = target !== "comments";
    for (const button of document.querySelectorAll("[data-tab]"))
      button.setAttribute("aria-pressed", String(button === tab));
    if (target !== "comments") fill(null, target);
    else {
      baseline = snapshot();
      renderComments();
    }
  });
document.querySelector("#new-post").addEventListener("click", () => {
  if (!busy && (!dirty() || confirm("未保存の変更を破棄しますか？")))
    fill(null);
});
document.querySelector("#remove-photo").addEventListener("click", () => {
  if (busy) return;
  photo = null;
  document.querySelector("#photo").value = "";
  document.querySelector("#photo-state").textContent = "";
  photoDisplay();
});
document.querySelector("#photo").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    status("save-notice", "JPEG・PNG・WebPの写真を5MB以内で選択してください。");
    return;
  }
  busy = true;
  setBusy(true);
  try {
    const r = await fetch("/api/admin/photos", {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "X-CSRF-Token": (await session()).csrf,
      },
      body: file,
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error);
    photo = result.key;
    document.querySelector("#photo-state").textContent = file.name;
    photoDisplay();
  } catch (e) {
    status("save-notice", e.message);
  } finally {
    busy = false;
    setBusy(false);
  }
});
function setBusy(value) {
  for (const control of form.querySelectorAll("button,input,textarea,select"))
    control.disabled = value;
  document.querySelector("#preview").disabled = value;
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const state = event.submitter.value;
  if (
    state === "draft" &&
    current?.status === "published" &&
    !confirm("この記事を非公開の下書きに戻しますか？")
  )
    return;
  const body = {
    kind: form.elements.kind.value,
    date: form.elements.date.value,
    music: form.elements.music.value,
    song: form.elements.song.value,
    title: form.elements.title.value,
    slug: form.elements.slug.value,
    body: form.elements.body.value,
    photo,
    status: state,
    ...(current ? { updatedAt: current.updated_at } : {}),
  };
  busy = true;
  setBusy(true);
  try {
    const result = await api(
      "/api/admin/posts" + (current ? "/" + current.id : ""),
      { method: current ? "PUT" : "POST", body },
    );
    await loadPosts();
    fill(posts.find((p) => p.id === result.id));
    status(
      "save-notice",
      state === "published" ? "公開しました。" : "保存しました。",
    );
  } catch (e) {
    status("save-notice", e.message);
  } finally {
    busy = false;
    setBusy(false);
  }
});
document.querySelector("#preview").addEventListener("click", async () => {
  if (busy || !form.reportValidity()) return;
  const popup = window.open("", "_blank");
  if (!popup) {
    status("save-notice", "プレビューを開くため、ポップアップを許可してください。");
    return;
  }
  popup.opener = null;
  popup.document.body.textContent = "プレビューを読み込んでいます。";
  const body = { ...JSON.parse(snapshot()), status: "draft" };
  busy = true;
  setBusy(true);
  try {
    const result = await api("/api/admin/preview", { method: "POST", body });
    if (!popup.closed) {
      popup.document.open();
      popup.document.write(result.html);
      popup.document.close();
    }
  } catch (e) {
    popup.close();
    status("save-notice", e.message);
  } finally {
    busy = false;
    setBusy(false);
  }
});
async function moderation() {
  comments = await api("/api/admin/comments");
  const count = comments.filter((c) => c.status === "pending").length;
  document.querySelector("#pending-count").textContent = count
    ? " " + count
    : "";
  renderComments();
}
function renderComments() {
  const list = document.querySelector("#moderation");
  list.replaceChildren();
  const filter = document.querySelector("#comment-filter").value;
  for (const c of comments.filter(
    (c) => filter === "all" || c.status === "pending",
  )) {
    const box = el("article", undefined, { class: "comment" });
    box.append(
      el("h3", c.title),
      el(
        "p",
        c.name +
          " · " +
          ({ pending: "承認待ち", approved: "公開中", rejected: "非表示" }[
            c.status
          ] || ""),
      ),
      el("p", c.body, { class: "preserve-lines" }),
    );
    const remove = el("button", "削除する", { type: "button" });
    remove.addEventListener("click", async () => {
      if (
        !confirm("このコメントと返信・通知登録を削除しますか？元に戻せません。")
      )
        return;
      remove.disabled = true;
      try {
        await api("/api/admin/comments/" + c.id, {
          method: "DELETE",
          body: {},
        });
        await moderation();
        status("notice", "コメントを削除しました。");
      } catch (e) {
        status("notice", e.message);
        remove.disabled = false;
      }
    });
    box.append(remove);
    for (const [state, label] of [
      ["approved", "承認する"],
      ["rejected", "非表示にする"],
    ]) {
      const button = el("button", label, { type: "button" });
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await api("/api/admin/comments/" + c.id, {
            method: "PATCH",
            body: { status: state },
          });
          await moderation();
          status("notice", "更新しました。");
        } catch (e) {
          status("notice", e.message);
          button.disabled = false;
        }
      });
      box.append(button);
    }
    if (c.status === "approved" && !c.parent_id) {
      const reply = el("form");
      const label = el("label", "管理者として返信");
      const input = el("textarea", undefined, {
        rows: "3",
        maxlength: "2000",
        required: "required",
      });
      const send = el("button", "返信を公開する", { type: "submit" });
      label.append(input);
      reply.append(label, send);
      reply.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!confirm("この返信を公開しますか？")) return;
        send.disabled = true;
        try {
          await api("/api/admin/replies", {
            method: "POST",
            body: { parentId: c.id, body: input.value },
          });
          await moderation();
          status("notice", "返信しました。");
        } catch (e) {
          status("notice", e.message);
          send.disabled = false;
        }
      });
      box.append(reply);
    }
    list.append(box);
  }
  if (!list.children.length)
    list.append(
      el("p", "該当するコメントはありません。", { class: "help-text" }),
    );
}
document
  .querySelector("#comment-filter")
  .addEventListener("change", renderComments);
window.addEventListener("beforeunload", (event) => {
  if (dirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
try {
  await session();
  await loadPosts();
  await moderation();
  fill(null);
} catch (e) {
  status("notice", e.message);
  setBusy(true);
}
