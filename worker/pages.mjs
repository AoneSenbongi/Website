import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false, breaks: true });
// Accept spaces inside bold markers without rewriting code or stored Markdown.
markdown.inline.ruler.before("emphasis", "spaced_strong", (state, silent) => {
  if (!state.src.startsWith("**", state.pos) || state.level >= state.md.options.maxNesting) return false;
  const match = /^\*\*(?!\*)([^\n]*?)(?<!\\)\*\*(?!\*)/.exec(state.src.slice(state.pos, state.posMax));
  if (!match || !/^[ \t\u3000]|[ \t\u3000]$/.test(match[1])) return false;
  const content = match[1].trim();
  if (!content) return false;
  if (!silent) {
    state.push("strong_open", "strong", 1).markup = "**";
    const children = [];
    state.md.inline.parse(content, state.md, state.env, children);
    state.tokens.push(...children);
    state.push("strong_close", "strong", -1).markup = "**";
  }
  state.pos += match[0].length;
  return true;
});

export function escape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const date = (ms) =>
  new Date(ms).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
export const entryPath = (p) =>
  p.kind === "diary" ? `/diary/${p.entry_date}/` : `/blog/${p.slug}/`;
export function shareMetadata(post, origin) {
  let image = /^[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(post.photo || "")
    ? origin + "/media/" + post.photo : null;
  let text = "";
  function visit(tokens) {
    for (const token of tokens) {
      if (token.type === "image") {
        if (!image) {
          try {
            const url = new URL(token.attrGet("src"), origin + "/");
            if (url.origin === origin && /^\/(?:images|media|research\/files)\//.test(url.pathname))
              image = url.href;
          } catch { /* A malformed image cannot become a share image. */ }
        }
      } else if (token.children) visit(token.children);
      else if (["text", "code_inline"].includes(token.type)) text += token.content;
      else if (["softbreak", "hardbreak"].includes(token.type)) text += " ";
      if (token.block && token.nesting === -1) text += " ";
    }
  }
  visit(markdown.parse(post.body || "", {}));
  return {
    type: "article",
    description: [...text.replace(/\s+/g, " ").trim()].slice(0, 160).join("") || (post.kind === "diary" ? "山近晴也の日記。日々のこと、音楽、写真。" : post.title || "山近晴也のBlog"),
    image: image || origin + (post.kind === "diary" ? "/images/diary-og-card.png" : "/images/og-card.png"),
  };
}
const switcher = (active) =>
  `<nav class="journal-tabs" aria-label="読みもの"><a href="/blog/"${active === "blog" ? ' aria-current="page"' : ""}>Blog</a><a href="/diary/"${active === "diary" ? ' aria-current="page"' : ""}>日記</a></nav>`;
export async function page(
  env,
  request,
  main,
  {
    script,
    title = "Blog",
    description = "研究や制作の過程で考えたこと、試したことなど。",
    slug,
    canonical,
    type = "website",
    image = env.SITE_ORIGIN + "/images/og-card.png",
    preview = false,
  } = {},
) {
  const asset = await env.ASSETS.fetch(
    new Request(new URL("/blog/", env.SITE_ORIGIN)),
  );
  if (!asset.ok) throw Error("missing template");
  const address =
    env.SITE_ORIGIN +
    (canonical || (slug ? `/blog/${slug}/` : new URL(request.url).pathname));
  let html = (await asset.text())
    .replace(/<main\b[^>]*>[\s\S]*?<\/main>/, () => main)
    .replace(
      /<title>[\s\S]*?<\/title>/,
      () => `<title>${escape(title)} | 山近晴也</title>`,
    )
    .replace(
      /(<meta name="description" content=")[^"]*/,
      (_, prefix) => prefix + escape(description),
    )
    .replace(
      /(<link rel="canonical" href=")[^"]*/,
      (_, prefix) => prefix + escape(address),
    )
    .replace(
      "</head>",
      '<link rel="stylesheet" href="/blog-ui/blog.css?v=20261103a"></head>',
    )
    .replace(/<p class="diary-link"[\s\S]*?<\/p>/, "")
    .replace(
      /<footer>[\s\S]*?<\/footer>/,
      '<footer class="journal-footer"><span>© 山近晴也</span><nav><a href="/contact/">Contact</a><a href="/blog/privacy/">データの扱い</a></nav></footer>',
    )
    .replace(/ style="[^"]*"/g, "");
  if (preview) {
    const version = crypto.randomUUID();
    html = html.replace(/(<link\b[^>]*rel="stylesheet"[^>]*href=")([^"]+)(")/g,
      (_, prefix, href, suffix) => prefix + href.split("?")[0] + "?preview=" + version + suffix);
  }
  if (script)
    html = html.replace(
      "</body>",
      `<script type="module" src="/blog-ui/${script}.js?v=20261103a"></script></body>`,
    );
  const cards = {
    "og:type": type,
    "og:title": title + " | 山近晴也",
    "og:description": description,
    "og:url": address,
    "og:image": image,
    "og:image:alt": title,
    "twitter:card": "summary_large_image",
    "twitter:site": "@YamachikaSeiya",
    "twitter:title": title + " | 山近晴也",
    "twitter:description": description,
    "twitter:image": image,
    "twitter:image:alt": title,
  };
  html = html.replace(/<meta\b[^>]*>/gi, tag => {
    const key = tag.match(/\b(?:name|property)="([^"]+)"/i)?.[1];
    return Object.hasOwn(cards, key) ? "" : tag;
  }).replace("</head>", () => Object.entries(cards).map(([key, value]) =>
    `<meta ${key.startsWith("og:") ? "property" : "name"}="${key}" content="${escape(value)}">`
  ).join("") + "</head>");
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
export function listing(posts) {
  return `<main class="blog-shell journal-index">${switcher("blog")}<header class="index-heading"><p class="eyebrow">山近晴也の記録</p><h1>Blog<span class="heading-dot">.</span></h1></header><div class="post-list">${posts.length ? posts.map((p) => `<article class="post-row${p.photo ? " has-thumbnail" : ""}"><div><p class="post-meta">${date(p.published_at)}</p><h2><a href="/blog/${escape(p.slug)}/">${escape(p.title)}<span aria-hidden="true">↗</span></a></h2></div>${p.photo ? `<a tabindex="-1" aria-hidden="true" href="/blog/${escape(p.slug)}/"><img src="/media/${escape(p.photo)}" alt="" loading="lazy"></a>` : ""}</article>`).join("") : '<p class="empty-state">まだ記事はありません。</p>'}</div></main>`;
}
function interactions(p) {
  return `<section class="article-end" aria-label="記事への反応"><div class="reaction-bar"><button id="like" class="like-button" type="button" aria-pressed="false" aria-label="いいね" disabled><span id="like-icon" aria-hidden="true">♡</span><span id="likes">0</span></button><a class="share-link" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(p.kind === "diary" ? p.entry_date + "の日記" : p.title)}&url=${encodeURIComponent("https://yamachikaseiya.com" + entryPath(p))}" target="_blank" rel="noopener noreferrer">Xで共有 ↗</a></div><p id="notice" role="status" aria-live="polite"></p><div class="comments-heading" hidden><h2>コメント</h2><span id="comment-count"></span></div><div id="comments"></div><details id="comment-composer" class="comment-composer"><summary>コメントを書く</summary><form id="comment-form"><p id="reply-label" class="reply-label" hidden></p><input type="hidden" name="parentId"><p id="owner-identity" class="identity" hidden>山近晴也 <span class="author-badge">本人</span></p><label id="name-label"><span class="visually-hidden">名前（任意）</span><input name="name" maxlength="40" autocomplete="nickname" placeholder="名前（任意）"></label><label><span class="visually-hidden">コメント</span><textarea name="body" maxlength="2000" rows="3" required placeholder="コメントをどうぞ"></textarea></label><details id="email-label" hidden><summary>返信をメールで受け取る</summary><label><span class="visually-hidden">メールアドレス</span><input name="email" type="email" maxlength="254" autocomplete="email" placeholder="メールアドレス（非公開）"></label><small>確認メールから有効にできます。</small></details><div id="challenge"></div><button id="retry-challenge" type="button" class="text-button" hidden>再試行</button><div class="form-bottom"><small id="moderation-note">承認後に公開します。</small><div><button type="button" id="cancel-reply" class="text-button" hidden>キャンセル</button><button type="submit" class="primary-button" disabled>送信</button></div></div><p id="form-notice" role="status" aria-live="polite"></p></form></details></section>`;
}
export function article(p, preview = false) {
  return `<main class="article-shell" data-slug="${escape(p.slug)}"><a class="article-back" href="${preview ? "/admin/" : "/blog/"}">← ${preview ? "管理画面" : "Blog"}</a>${preview ? '<p class="preview-caption">下書きプレビュー</p>' : ""}<article><header class="article-header"><p class="post-meta">${p.published_at ? date(p.published_at) : "下書き"}</p><h1>${escape(p.title)}</h1><p class="byline"><img src="/images/profile-photo.jpg" alt="">山近晴也<span class="author-badge">本人</span></p></header><div class="article-body">${p.photo ? `<figure><img src="/media/${escape(p.photo)}" alt="記事の写真"></figure>` : ""}${p.body
    ? markdown.render(p.body) : ""}</div></article>${preview ? "" : interactions(p) + '<p class="article-diary-link"><a href="/diary/">日記</a></p>'}</main>`;
}
function diaryLeaf(p, latest = false) {
  return `<article class="diary-leaf${p.photo ? " has-photo" : ""}">${p.photo ? `<img class="diary-background" src="/media/${escape(p.photo)}" alt="">` : ""}<div class="diary-copy"><div class="diary-date"><div class="diary-date-label"><time datetime="${escape(p.entry_date)}">${escape(p.entry_date.replaceAll("-", "."))}</time>${latest ? '<span class="diary-latest">Latest</span>' : ""}</div>${p.music ? `<a class="music-link" href="${escape(p.music)}" target="_blank" rel="noopener noreferrer"><span class="music-note" aria-hidden="true">♫</span> <span class="music-title">${escape(p.song || "今日の音楽")}</span><span aria-hidden="true">↗</span></a>` : ""}</div>${p.body ? `<div class="diary-words">${markdown.render(p.body)}</div>` : ""}</div></article>`;
}
export function diary(p, entries = [], preview = false) {
  const ordered = [...entries].sort((a,b) => b.entry_date.localeCompare(a.entry_date));
  const others = ordered.filter(e => e.id !== p?.id);
  const index = ordered.findIndex(e => e.id === p?.id);
  const newer = index > 0 ? ordered[index-1] : null;
  const older = index >= 0 ? ordered[index+1] : null;
  const leaf = entry => entry ? diaryLeaf(entry, entry.id === ordered[0]?.id) : "";
  const arrow = (entry, step, label, symbol) => entry
    ? `<a data-diary-step="${step}" href="${entryPath(entry)}#diary-reader" aria-label="${label}">${symbol}</a>`
    : `<span class="diary-nav-disabled" aria-hidden="true">${symbol}</span>`;
  const reader = preview ? diaryLeaf(p) : `<nav class="diary-navigation" aria-label="日記の移動">${arrow(newer,-1,"新しい日記","←")}${arrow(older,1,"古い日記","→")}</nav><div class="diary-slider" id="diary-reader" tabindex="0" aria-label="日記。左右キーで移動"><div class="diary-track"><div class="diary-slide" aria-hidden="true" inert>${leaf(newer)}</div><div class="diary-slide is-current">${leaf(p)}</div><div class="diary-slide" aria-hidden="true" inert>${leaf(older)}</div></div></div>`;
  return `<main class="article-shell diary-shell"${p ? ` data-slug="${escape(p.slug)}"` : ""}>${switcher("diary")}<header class="diary-heading"><h1>日記</h1>${others.length ? `<details class="diary-archive"><summary>ほかの日記</summary><nav class="date-strip" aria-label="日記の日付">${others.map(e => `<a href="${entryPath(e)}">${escape(e.entry_date.replaceAll("-", "."))}</a>`).join("")}</nav></details>` : ""}</header>${preview ? '<p class="preview-caption">下書きプレビュー</p>' : ""}${p ? reader + (preview ? "" : interactions(p)) : '<div class="diary-empty"><p>まだ日記はありません。</p></div>'}</main>`;
}
export function adminPage() {
  return `<main class="admin-shell blog-shell"><header class="admin-heading"><h1>書く<span class="heading-dot">.</span></h1><a class="logout-link" href="/cdn-cgi/access/logout">ログアウト ↗</a></header><nav class="editor-tabs" aria-label="管理メニュー"><button type="button" data-tab="blog" aria-pressed="true">記事</button><button type="button" data-tab="diary" aria-pressed="false">日記</button><button type="button" data-tab="comments" aria-pressed="false">コメント<span id="pending-count"></span></button></nav><p id="notice" role="status" aria-live="polite"></p><div id="writing-panel" class="writing-layout"><aside class="writing-sidebar"><button type="button" id="new-post" class="new-entry">＋ 新しく書く</button><div id="posts"></div></aside><section class="writing-editor"><form id="post-form"><input type="hidden" name="kind" value="blog"><header class="editor-heading"><h2 id="editor-title">新しい記事</h2><span id="editor-state"></span></header><div id="blog-fields"><label><span class="visually-hidden">タイトル</span><input class="title-input" name="title" maxlength="160" required placeholder="タイトル"></label><details class="url-setting"><summary>URL</summary><label><span class="visually-hidden">URLの末尾</span><input name="slug" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" required placeholder="first-post"></label></details></div><div id="diary-fields" hidden><label class="date-label">日付<input type="date" name="date"></label></div><label><span class="visually-hidden">本文</span><textarea class="body-input" name="body" rows="14" maxlength="20000" required placeholder="Markdownで書く（## 小見出し、**太字**）"></textarea></label><div class="photo-editor"><img id="photo-preview" alt="登録する写真" hidden><div><label class="photo-picker" for="photo">＋ 写真を追加</label><input class="visually-hidden" id="photo" type="file" accept="image/jpeg,image/png,image/webp"><button type="button" id="remove-photo" class="text-button" hidden>写真を外す</button></div><p id="photo-state" class="help-text"></p></div><details id="music-fields" hidden><summary>♫ 音楽を添える</summary><label><span class="visually-hidden">音楽のURL</span><input name="music" type="url" placeholder="https://…"></label><label><span class="visually-hidden">曲名</span><input name="song" maxlength="120" placeholder="曲名（任意）"></label></details><div class="editor-actions"><button type="button" id="preview" class="text-button" disabled>プレビュー ↗</button><div><button type="submit" name="action" value="save">保存</button><button type="submit" name="action" value="published" class="primary-button">公開</button></div></div><p id="save-notice" role="status" aria-live="polite"></p></form></section></div><section id="comments-panel" class="moderation-panel" hidden><div class="moderation-heading"><h2>コメント</h2><label><span class="visually-hidden">表示するコメント</span><select id="comment-filter"><option value="pending">承認待ち</option><option value="all">すべて</option></select></label></div><div id="moderation"></div></section></main>`;
}
export function notificationPage() {
  return `<main class="article-shell notification-shell"><p class="eyebrow">返信通知</p><h1>お知らせの設定</h1><p id="notification-description">メールのリンクから開いてください。</p><p id="notice" role="status" aria-live="polite"></p><button type="button" class="primary-button" id="confirm-notification" hidden>通知を有効にする</button><button type="button" id="unsubscribe-notification" hidden>通知を解除する</button><p><a href="/blog/">← Blog</a></p></main>`;
}
