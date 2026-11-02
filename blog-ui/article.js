import { api, session, el } from "./common.js";
export function initArticle(root = document) {
  let disposed = false;
  function status(id, message) {
    if (!disposed) root.querySelector("#" + id)?.replaceChildren(document.createTextNode(message));
  }
  const slug = root.dataset?.slug || root.querySelector("[data-slug]")?.dataset.slug;
  if (!slug) return () => {};
  const base = "/api/blog/posts/" + encodeURIComponent(slug),
    like = root.querySelector("#like"),
    form = root.querySelector("#comment-form"),
    submit = form.querySelector("[type=submit]");
  const composer = root.querySelector("#comment-composer");
  let composerConfig = null,
    challengeStarted = false;
  let liked = false,
    widget,
    turnstileToken = "",
    ready = false,
    owner = false;
  function chooseReply(comment) {
    composer.open = true;
    root.querySelector("#reply-label").hidden = false;
    form.elements.parentId.value = comment.id;
    root.querySelector("#reply-label").textContent =
      comment.name + "さんに返信";
    root.querySelector("#cancel-reply").hidden = false;
    form.elements.body.focus();
  }
  function cancelReply() {
    form.elements.parentId.value = "";
    root.querySelector("#reply-label").textContent = "";
    root.querySelector("#reply-label").hidden = true;
    root.querySelector("#cancel-reply").hidden = true;
  }
  function commentNode(c, toMe) {
    const box = el("article", undefined, {
      class:
        "comment" +
        (c.parentId ? " reply" : "") +
        (c.isAdmin ? " author-comment" : ""),
      id: "comment-" + c.id,
    });
    const name = el("p", c.name, { class: "comment-name" });
    if (c.isAdmin)
      name.append(
        el("span", "本人", {
          class: "author-badge",
          "aria-label": "認証済みの本人",
        }),
      );
    if (c.status === "pending")
      name.append(el("span", "承認待ち", { class: "pending-badge" }));
    const time = el(
      "time",
      new Date(c.createdAt).toLocaleDateString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      { datetime: new Date(c.createdAt).toISOString() },
    );
    box.append(name, time);
    if (toMe) box.append(el("span", "あなたへの返信", { class: "reply-note" }));
    box.append(el("p", c.body, { class: "preserve-lines" }));
    if (c.status === "approved" && !c.parentId) {
      const reply = el("button", "返信", {
        type: "button",
        class: "comment-reply",
      });
      reply.addEventListener("click", () => chooseReply(c));
      box.append(reply);
    }
    return box;
  }
  async function refresh() {
    const data = await api(base);
    if (disposed) return;
    liked = data.liked;
    like.setAttribute("aria-pressed", String(liked));
    root.querySelector("#like-icon").textContent = liked ? "♥" : "♡";
    like.setAttribute("aria-label", liked ? "いいねを取り消す" : "いいね");
    root.querySelector("#likes").textContent = String(data.likes);
    const comments = root.querySelector("#comments");
    comments.replaceChildren();
    root.querySelector(".comments-heading").hidden =
      data.comments.length === 0;
    root.querySelector("#comment-count").textContent =
      data.comments.filter((c) => c.status === "approved").length || "";
    const mine = new Set(data.comments.filter((c) => c.mine).map((c) => c.id));
    const replies = data.comments.filter(
      (c) =>
        c.parentId && mine.has(c.parentId) && !c.mine && c.status === "approved",
    );
    for (const root of data.comments.filter((c) => !c.parentId)) {
      comments.append(commentNode(root, false));
      for (const child of data.comments.filter((c) => c.parentId === root.id))
        comments.append(commentNode(child, replies.includes(child)));
    }
    if (location.hash.startsWith("#comment-"))
      root.querySelector("#" + CSS.escape(location.hash.slice(1)))?.scrollIntoView();
  }
  like.addEventListener("click", async () => {
    like.disabled = true;
    try {
      const data = await api(base + "/like", {
        method: "POST",
        body: { liked: !liked },
      });
      liked = data.liked;
      await refresh();
      status("notice", "");
    } catch (e) {
      status("notice", e.message);
    } finally {
      like.disabled = false;
    }
  });
  root.querySelector("#cancel-reply").addEventListener("click", cancelReply);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    let posted = false;
    try {
      if (!ready || (!owner && !turnstileToken))
        throw Error("投稿者の確認が完了するまでお待ちください。");
      const email = form.elements.email.value.trim();
      const data = await api(base + "/comments", {
        method: "POST",
        body: {
          name: form.elements.name.value,
          body: form.elements.body.value,
          parentId: form.elements.parentId.value || null,
          turnstile: turnstileToken,
        },
      });
      posted = true;
      form.elements.body.value = "";
      cancelReply();
      status(
        "form-notice",
        data.status === "approved"
          ? "投稿しました。"
          : "送信しました。承認待ちです。",
      );
      if (email) {
        try {
          await api("/api/blog/subscriptions", {
            method: "POST",
            body: { commentId: data.id, email },
          });
          status("form-notice", "確認メールを送りました。");
        } catch (e) {
          status("form-notice", "コメントは送信済みです。通知登録：" + e.message);
        }
      }
      await refresh();
    } catch (e) {
      status("form-notice", e.message);
    } finally {
      turnstileToken = "";
      if (window.turnstile && widget !== undefined)
        window.turnstile.reset(widget);
      submit.disabled = !owner;
      if (!posted) status("notice", "");
    }
  });
  let challengeAttempt = 0, challengeTimeout;
  function loadChallenge(config) {
    const attempt = ++challengeAttempt,
      retry = root.querySelector("#retry-challenge");
    retry.hidden = true;
    submit.disabled = true;
    status("form-notice", "");
    const failed = () => {
      if (attempt !== challengeAttempt) return;
      turnstileToken = "";
      submit.disabled = true;
      retry.hidden = false;
      status("form-notice", "投稿者の確認を読み込めませんでした。");
    };
    const render = () => {
      if (attempt !== challengeAttempt) return;
      const options = {
        sitekey: config.turnstileSiteKey,
        action: "comment",
        size: "flexible",
        callback: (token) => {
          if (attempt !== challengeAttempt) return;
          turnstileToken = token;
          ready = true;
          submit.disabled = false;
          retry.hidden = true;
        },
        "expired-callback": () => {
          turnstileToken = "";
          submit.disabled = true;
        },
        "error-callback": failed,
      };
      try {
        if (widget !== undefined) window.turnstile.remove(widget);
        widget = window.turnstile.render(root.querySelector("#challenge"), options);
      } catch {
        failed();
      }
    };
    retry.onclick = () => loadChallenge(config);
    if (window.turnstile) {
      render();
      return;
    }
    document.querySelector("script[data-turnstile-loader]")?.remove();
    const script = document.createElement("script");
    script.dataset.turnstileLoader = "true";
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    clearTimeout(challengeTimeout);
    const timeout = challengeTimeout = setTimeout(failed, 20000);
    script.addEventListener("load", () => {
      clearTimeout(timeout);
      render();
    });
    script.addEventListener("error", () => {
      clearTimeout(timeout);
      failed();
    });
    document.head.append(script);
  }
  function activateComposer() {
    if (composer.open && !owner && composerConfig && !challengeStarted) {
      challengeStarted = true;
      loadChallenge(composerConfig);
    }
  }
  composer.addEventListener("toggle", activateComposer);
  async function init() {
    try {
      const config = await session();
      await refresh();
      if (disposed) return;
      like.disabled = false;
      root.querySelector("#email-label").hidden =
        !config.emailNotifications || config.isAdmin;
      owner = !!config.isAdmin;
      root.querySelector("#owner-identity").hidden = !owner;
      root.querySelector("#name-label").hidden = owner;
      root.querySelector("#moderation-note").hidden = owner;
      if (owner) {
        ready = true;
        submit.disabled = false;
        return;
      }
      if (!config.turnstileSiteKey) {
        status("form-notice", "コメント受付の設定中です。");
        return;
      }
      composerConfig = config;
      activateComposer();
    } catch (e) {
      status("notice", e.message);
    }
  }
  init();
  return () => {
    disposed = true;
    challengeAttempt++;
    clearTimeout(challengeTimeout);
    if (widget !== undefined && window.turnstile) {
      try { window.turnstile.remove(widget); } catch { /* Already removed. */ }
    }
  };
}
if (document.querySelector(".article-shell:not(.diary-shell)[data-slug]")) {
  initArticle(document.querySelector("main[data-slug]"));
}
