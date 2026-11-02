import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  page,
  article,
  listing,
  adminPage,
  notificationPage,
  diary,
  entryPath,
  shareMetadata,
} from "./pages.mjs";

const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const cookieName = "__Host-blog";
const maxJSON = 32768,
  maxPhoto = 5 * 1024 * 1024;
class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new Problem(status, message);
};
const now = () => Date.now();
const id = () => crypto.randomUUID().replaceAll("-", "");
const base64 = (b) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
function unbase64(s) {
  return Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
async function sha(s) {
  return base64(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
}
async function hmac(secret, s) {
  if (!secret || secret.length < 32) fail(503, "保護設定が完了していません。");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64(await crypto.subtle.sign("HMAC", key, encoder.encode(s)));
}
function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function encrypt(secret, text) {
  if (!secret || secret.length < 32)
    fail(503, "メール保護設定が完了していません。");
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(text),
  );
  return base64(iv) + "." + base64(data);
}
async function decrypt(secret, text) {
  const [iv, data] = text.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return decoder.decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unbase64(iv) },
      key,
      unbase64(data),
    ),
  );
}
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const one = (env, sql, ...args) => stmt(env, sql, ...args).first();
const rows = async (env, sql, ...args) =>
  (await stmt(env, sql, ...args).all()).results;
const run = (env, sql, ...args) => stmt(env, sql, ...args).run();
const json = (value, status = 200) => Response.json(value, { status });
function text(value, min, max, label) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
  )
    fail(400, `${label}を確認してください。`);
  return value.trim();
}
function postInput(data) {
  const kind = data.kind ?? "blog";
  if (!["blog", "diary"].includes(kind)) fail(400, "種類が不正です。");
  let entryDate = null,
    music = null,
    song = null;
  if (kind === "diary") {
    entryDate = text(data.date, 10, 10, "日付");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(entryDate) ||
      !Number.isFinite(Date.parse(entryDate)) ||
      new Date(entryDate).toISOString().slice(0, 10) !== entryDate
    )
      fail(400, "日付を確認してください。");
    if (data.music) {
      music = text(data.music, 1, 2048, "音楽のURL");
      let u;
      try {
        u = new URL(music);
      } catch {
        fail(400, "音楽のURLを確認してください。");
      }
      if (u.protocol !== "https:" || u.username || u.password)
        fail(400, "音楽はHTTPSのURLで指定してください。");
      music = u.href;
      song = data.song ? text(data.song, 1, 120, "曲名") : null;
    }
  }
  const slug =
    kind === "diary" ? "diary-" + entryDate : text(data.slug, 1, 80, "URL");
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    ["notifications", "privacy", "admin"].includes(slug) ||
    (kind === "blog" && slug.startsWith("diary-"))
  )
    fail(400, "URLは半角英数字とハイフンで指定してください。");
  if (!["draft", "published"].includes(data.status))
    fail(400, "公開状態が不正です。");
  const photo = data.photo || null;
  if (photo && !/^[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(photo))
    fail(400, "写真が不正です。");
  const body = text(data.body ?? "", kind === "blog" ? 1 : 0, 20000, "本文");
  if (kind === "diary" && !body && !photo && !music)
    fail(400, "文章・写真・音楽のいずれかを追加してください。");
  return {
    slug,
    title: kind === "diary" ? entryDate : text(data.title, 1, 160, "タイトル"),
    body,
    kind,
    entryDate,
    music,
    song,
    status: data.status,
    photo,
  };
}
async function readBytes(request, max) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        fail(413, "送信内容が大きすぎます。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
async function readJSON(request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    fail(415, "JSONで送信してください。");
  let data;
  try {
    data = JSON.parse(decoder.decode(await readBytes(request, maxJSON)));
  } catch (e) {
    if (e instanceof Problem) throw e;
    fail(400, "送信形式が不正です。");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail(400, "送信形式が不正です。");
  return data;
}
async function visitor(request, env) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!raw) return null;
  const [value, signature, ...extra] = raw.split(".");
  if (extra.length || !/^\d{13}-[a-f0-9]{32}$/.test(value) || !signature)
    return null;
  const created = Number(value.split("-")[0]);
  if (created > now() + 60000 || created < now() - 180 * 86400000) return null;
  if (!equal(signature, await hmac(env.SESSION_SECRET, "cookie:" + value)))
    return null;
  return {
    raw,
    actor: await hmac(env.SESSION_SECRET, "actor:" + value),
    csrf: await hmac(env.SESSION_SECRET, "csrf:" + value),
  };
}
async function session(request, env, isAdmin = false) {
  let v = await visitor(request, env),
    cookie;
  if (!v) {
    const value = now() + "-" + id();
    const raw =
      value + "." + (await hmac(env.SESSION_SECRET, "cookie:" + value));
    v = { csrf: await hmac(env.SESSION_SECRET, "csrf:" + value) };
    cookie = `${cookieName}=${raw}; Path=/; Max-Age=15552000; Secure; HttpOnly; SameSite=Lax`;
  }
  const r = json({
    csrf: v.csrf,
    isAdmin,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
    emailNotifications: !!(
      env.RESEND_API_KEY &&
      env.MAIL_FROM &&
      env.MAIL_ENCRYPTION_KEY
    ),
  });
  if (cookie) r.headers.set("Set-Cookie", cookie);
  return r;
}
async function mutation(request, env) {
  if (
    request.headers.get("origin") !== env.SITE_ORIGIN ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    fail(403, "このサイトから操作してください。");
  const v = await visitor(request, env);
  if (!v || !equal(v.csrf, request.headers.get("x-csrf-token")))
    fail(403, "ページを再読み込みしてください。");
  return v;
}
async function limit(env, key, max, period = 600000) {
  const bucket = Math.floor(now() / period);
  const k = await hmac(env.SESSION_SECRET, `limit:${bucket}:${key}`);
  const result = await one(
    env,
    "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    k,
    now() + period * 2,
  );
  if (result.count > max)
    fail(429, "操作が続いています。しばらく待ってください。");
}
async function protectRate(request, env, v, type, max) {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) fail(503, "接続の確認ができません。");
  await limit(env, type + ":ip:" + ip, max);
  await limit(env, type + ":actor:" + v.actor, max);
}
async function published(env, slug) {
  const p = await one(
    env,
    "SELECT * FROM posts WHERE slug=? AND status='published'",
    slug,
  );
  if (!p) fail(404, "記事が見つかりません。");
  return p;
}
async function publicData(request, env, p) {
  const v = await visitor(request, env);
  const comments = await rows(
    env,
    "SELECT id,parent_id AS parentId,name,body,status,is_admin AS isAdmin,created_at AS createdAt,CASE WHEN actor=? THEN 1 ELSE 0 END AS mine FROM comments WHERE post_id=? AND (status='approved' OR (actor=? AND status='pending')) AND (parent_id IS NULL OR EXISTS(SELECT 1 FROM comments parent WHERE parent.id=comments.parent_id AND parent.status='approved')) ORDER BY created_at,id LIMIT 300",
    v?.actor || "",
    p.id,
    v?.actor || "",
  );
  return {
    post: { id: p.id, slug: p.slug, title: p.title },
    likes: (
      await one(env, "SELECT count(*) AS n FROM likes WHERE post_id=?", p.id)
    ).n,
    liked: !!(
      v &&
      (await one(
        env,
        "SELECT 1 FROM likes WHERE post_id=? AND actor=?",
        p.id,
        v.actor,
      ))
    ),
    comments,
  };
}
function secured(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
  );
  return new Response(response.body, { status: response.status, headers });
}

export function createApp({ keyResolver, fetcher = fetch } = {}) {
  const resolvers = new Map();
  async function admin(request, env) {
    if (
      !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(
        env.ACCESS_ISSUER || "",
      ) ||
      !env.ACCESS_AUD ||
      !env.ADMIN_EMAIL
    )
      fail(503, "管理者認証の設定が完了していません。");
    // Public media routes may receive the Access cookie without an injected JWT header.
    // Both inputs are untrusted until the same signature/claims checks below pass.
    const jwt =
      request.headers.get("cf-access-jwt-assertion") ||
      request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("CF_Authorization="))
        ?.slice("CF_Authorization=".length);
    if (!jwt) fail(401, "管理者としてログインしてください。");
    let payload;
    try {
      let resolver = keyResolver;
      if (!resolver) {
        if (!resolvers.has(env.ACCESS_ISSUER))
          resolvers.set(
            env.ACCESS_ISSUER,
            createRemoteJWKSet(
              new URL(env.ACCESS_ISSUER + "/cdn-cgi/access/certs"),
            ),
          );
        resolver = resolvers.get(env.ACCESS_ISSUER);
      }
      ({ payload } = await jwtVerify(jwt, resolver, {
        algorithms: ["RS256"],
        issuer: env.ACCESS_ISSUER,
        audience: env.ACCESS_AUD,
        requiredClaims: ["exp", "iat", "email", "sub"],
        maxTokenAge: "24h",
      }));
    } catch {
      fail(401, "管理者の認証を確認できません。");
    }
    if (
      typeof payload.email !== "string" ||
      payload.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()
    )
      fail(403, "管理権限がありません。");
    return payload;
  }
  async function challenge(request, env, token) {
    if (!env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY)
      fail(503, "コメント受付の設定中です。");
    if (
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(env.SITE_ORIGIN) &&
      (/^[123]x/.test(env.TURNSTILE_SITE_KEY) ||
        /^[123]x/.test(env.TURNSTILE_SECRET))
    )
      fail(503, "投稿者確認の本番設定が完了していません。");
    if (typeof token !== "string" || !token || token.length > 2048)
      fail(403, "投稿者の確認をやり直してください。");
    let answer;
    try {
      const r = await fetcher(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: env.TURNSTILE_SECRET,
            response: token,
            remoteip: request.headers.get("cf-connecting-ip"),
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!r.ok) throw Error();
      answer = await r.json();
    } catch {
      fail(503, "投稿者の確認に失敗しました。時間を置いてお試しください。");
    }
    if (
      !answer.success ||
      answer.hostname !== new URL(env.SITE_ORIGIN).hostname ||
      answer.action !== "comment"
    )
      fail(403, "投稿者の確認をやり直してください。");
  }
  async function send(env, to, subject, body, key) {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM || /[\r\n]/.test(env.MAIL_FROM))
      fail(503, "メール通知は現在利用できません。");
    const r = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [to],
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      fail(503, "メールを送信できませんでした。時間を置いてお試しください。");
  }
  async function queueReply(env, cid) {
    await run(
      env,
      "INSERT OR IGNORE INTO mail_queue(id,comment_id,subscription_id,created_at) SELECT ?,c.id,s.id,? FROM comments c JOIN subscriptions s ON s.comment_id=c.parent_id JOIN posts p ON p.id=c.post_id WHERE c.id=? AND c.status='approved' AND s.confirmed=1 AND p.status='published' AND c.actor<>s.actor",
      id(),
      now(),
      cid,
    );
  }
  async function drain(env) {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) return;
    const jobs = await rows(
      env,
      "SELECT q.id FROM mail_queue q WHERE (q.state='pending' OR (q.state='sending' AND q.locked_at<?)) AND q.attempts<8 AND q.created_at>? ORDER BY q.created_at LIMIT 20",
      now() - 60000,
      now() - 23 * 3600000,
    );
    for (const job of jobs) {
      const claim = await one(
        env,
        "UPDATE mail_queue SET state='sending',attempts=attempts+1,locked_at=? WHERE id=? AND (state='pending' OR (state='sending' AND locked_at<?)) RETURNING id",
        now(),
        job.id,
        now() - 60000,
      );
      if (!claim) continue;
      const data = await one(
        env,
        "SELECT q.id,c.id AS reply_id,p.slug,p.kind,p.entry_date,s.email,s.unsubscribe_token FROM mail_queue q JOIN comments c ON c.id=q.comment_id JOIN comments parent ON parent.id=c.parent_id JOIN posts p ON p.id=c.post_id JOIN subscriptions s ON s.id=q.subscription_id WHERE q.id=? AND c.status='approved' AND parent.status='approved' AND p.status='published' AND s.confirmed=1",
        job.id,
      );
      if (!data) {
        await run(
          env,
          "UPDATE mail_queue SET state='cancelled' WHERE id=?",
          job.id,
        );
        continue;
      }
      try {
        const email = await decrypt(env.MAIL_ENCRYPTION_KEY, data.email),
          unsubscribe = await decrypt(
            env.MAIL_ENCRYPTION_KEY,
            data.unsubscribe_token,
          );
        await send(
          env,
          email,
          "Blogのコメントに返信がありました",
          `コメントへの返信が公開されました。\n${env.SITE_ORIGIN}${entryPath(data)}#comment-${data.reply_id}\n\n通知の解除：\n${env.SITE_ORIGIN}/blog/notifications/#unsubscribe=${unsubscribe}`,
          `reply-${job.id}`,
        );
        await run(env, "UPDATE mail_queue SET state='sent' WHERE id=?", job.id);
      } catch {
        await run(
          env,
          "UPDATE mail_queue SET state='pending' WHERE id=?",
          job.id,
        );
      }
    }
  }
  async function route(request, env) {
    const url = new URL(request.url),
      path = url.pathname;
    const dynamic = /^\/(?:blog|diary|admin|api|media)(?:\/|$)/.test(path);
    if (!dynamic) return env.ASSETS.fetch(request);
    if (url.origin !== env.SITE_ORIGIN)
      fail(421, "サイトの正規URLからアクセスしてください。");
    if (!env.DB) fail(503, "Blogの設定中です。");
    const isAdmin = /^\/(?:admin|api\/admin)(?:\/|$)/.test(path);
    if (isAdmin) await admin(request, env);
    if (request.method === "GET") {
      if (path === "/api/blog/session") {
        let owner = false;
        try {
          await admin(request, env);
          owner = true;
        } catch {}
        return session(request, env, owner);
      }
      const diaryRoute = path.match(/^\/diary(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/);
      if (diaryRoute) {
        const entries = await rows(
          env,
          "SELECT * FROM posts WHERE kind='diary' AND status='published' ORDER BY entry_date DESC LIMIT 365",
        );
        let entry = entries[0] || null;
        if (diaryRoute[1]) {
          entry = await one(
            env,
            "SELECT * FROM posts WHERE kind='diary' AND status='published' AND entry_date=?",
            diaryRoute[1],
          );
          if (!entry) fail(404, "日記が見つかりません。");
        }
        return page(env, request, diary(entry, entries), {
          script: entry ? "article" : undefined,
          title: entry ? entry.entry_date + "の日記" : "日記",
          canonical: entry ? entryPath(entry) : "/diary/",
        });
      }
      if (path === "/blog" || path === "/blog/")
        return page(
          env,
          request,
          listing(
            await rows(
              env,
              "SELECT slug,title,body,photo,published_at FROM posts WHERE kind='blog' AND status='published' ORDER BY published_at DESC LIMIT 100",
            ),
          ),
        );
      if (path === "/blog/notifications/")
        return page(env, request, notificationPage(), {
          script: "notifications",
          title: "返信通知",
        });
      if (path === "/blog/privacy/")
        return page(
          env,
          request,
          '<main class="article-shell"><h1>Blogのデータの扱い</h1><p>いいねとコメントの操作を同じブラウザーで識別するため、ランダムなCookieを180日間保存します。人物の本人確認や端末間同期は行いません。</p><p>コメントは承認後に名前・本文・投稿日時を公開します。匿名の表示名は本人であることの証明ではありません。未承認コメントは投稿したブラウザーと管理者だけが確認できます。</p><p>メール通知は任意です。メールアドレスは暗号化して保存し、公開しません。配信にはResendを利用します。コメント送信時はCloudflare Turnstileで不正投稿を確認します。Cloudflareは配信や不正利用対策のため接続情報を処理します。</p><p>未確認の通知登録は24時間で無効となり、定期処理で削除します。解除した通知登録も削除します。コメント削除の依頼はContactからご連絡ください。</p><p><a href="/blog/">Blogに戻る</a> · <a href="/contact/">Contact</a></p></main>',
          { title: "Blogのデータの扱い" },
        );
      if (path === "/admin" || path === "/admin/")
        return page(env, request, adminPage(), {
          script: "admin",
          title: "Blog管理",
        });
      if (path === "/api/admin/posts")
        return json(
          await rows(
            env,
            "SELECT * FROM posts ORDER BY updated_at DESC LIMIT 200",
          ),
        );
      if (path === "/api/admin/comments")
        return json(
          await rows(
            env,
            "SELECT c.id,c.post_id,c.parent_id,c.name,c.body,c.status,c.is_admin,c.created_at,p.title,p.slug FROM comments c JOIN posts p ON p.id=c.post_id ORDER BY c.created_at DESC LIMIT 300",
          ),
        );
      const preview = path.match(/^\/admin\/preview\/([a-f0-9]{32})\/$/);
      if (preview) {
        const p = await one(env, "SELECT * FROM posts WHERE id=?", preview[1]);
        if (!p) fail(404, "記事が見つかりません。");
        return page(
          env,
          request,
          p.kind === "diary" ? diary(p, [], true) : article(p, true),
          { title: p.title, preview: true },
        );
      }
      const media = path.match(/^\/media\/([a-f0-9]{32}\.(?:jpg|png|webp))$/);
      if (media) {
        const pub = await one(
          env,
          "SELECT 1 FROM posts WHERE photo=? AND status='published'",
          media[1],
        );
        if (!pub) {
          try {
            await admin(request, env);
          } catch {
            fail(404, "写真が見つかりません。");
          }
        }
        const object = await env.PHOTOS.get(media[1]);
        if (!object) fail(404, "写真が見つかりません。");
        return new Response(object.body, {
          headers: { "Content-Type": object.httpMetadata.contentType },
        });
      }
      const api = path.match(/^\/api\/blog\/posts\/([a-z0-9-]+)$/);
      if (api)
        return json(
          await publicData(request, env, await published(env, api[1])),
        );
      const post = path.match(/^\/blog\/([a-z0-9-]+)\/$/);
      if (post) {
        const p = await published(env, post[1]);
        if (p.kind !== "blog") fail(404, "記事が見つかりません。");
        return page(env, request, article(p), {
          script: "article",
          title: p.title,
          ...shareMetadata(p, env.SITE_ORIGIN),
          slug: p.slug,
        });
      }
      fail(404, "ページが見つかりません。");
    }
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method))
      fail(405, "この操作には対応していません。");
    const v = await mutation(request, env);
    if (path === "/api/admin/photos" && request.method === "POST") {
      const bytes = await readBytes(request, maxPhoto);
      let ext, type;
      if (
        bytes.length > 12 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      ) {
        ext = "jpg";
        type = "image/jpeg";
      } else if (
        bytes.length > 24 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
      ) {
        ext = "png";
        type = "image/png";
      } else if (
        bytes.length > 16 &&
        decoder.decode(bytes.slice(0, 4)) === "RIFF" &&
        decoder.decode(bytes.slice(8, 12)) === "WEBP"
      ) {
        ext = "webp";
        type = "image/webp";
      } else fail(400, "JPEG・PNG・WebPの写真を選択してください。");
      if (request.headers.get("content-type") !== type)
        fail(400, "写真の形式が一致しません。");
      const key = id() + "." + ext;
      await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
      return json({ key, url: "/media/" + key }, 201);
    }
    const data = await readJSON(request);
    if (isAdmin) {
      if (path === "/api/admin/preview" && request.method === "POST") {
        const input = postInput({ ...data, status: "draft" });
        if (input.photo && !(await env.PHOTOS.get(input.photo)))
          fail(400, "写真が見つかりません。");
        const p = { ...input, entry_date: input.entryDate, published_at: null };
        const response = await page(env, request,
          p.kind === "diary" ? diary(p, [], true) : article(p, true),
          { title: p.title, preview: true });
        return json({ html: await response.text() });
      }
      if (path === "/api/admin/posts" && request.method === "POST") {
        const p = postInput(data),
          pid = id(),
          time = now();
        if (p.photo && !(await env.PHOTOS.get(p.photo)))
          fail(400, "写真が見つかりません。");
        await run(
          env,
          "INSERT INTO posts(id,slug,title,body,photo,status,created_at,updated_at,published_at,kind,entry_date,music,song) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          pid,
          p.slug,
          p.title,
          p.body,
          p.photo,
          p.status,
          time,
          time,
          p.status === "published" ? time : null,
          p.kind,
          p.entryDate,
          p.music,
          p.song,
        );
        return json({ id: pid, updatedAt: time }, 201);
      }
      const post = path.match(/^\/api\/admin\/posts\/([a-f0-9]{32})$/);
      if (post && request.method === "PUT") {
        const p = postInput(data);
        if (!Number.isSafeInteger(data.updatedAt))
          fail(400, "保存状態を確認できません。");
        if (p.photo && !(await env.PHOTOS.get(p.photo)))
          fail(400, "写真が見つかりません。");
        const stamp = Math.max(now(), data.updatedAt + 1);
        const saved = await one(
          env,
          "UPDATE posts SET slug=?,title=?,body=?,photo=?,status=?,updated_at=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,kind=?,entry_date=?,music=?,song=? WHERE id=? AND updated_at=? RETURNING id,updated_at AS updatedAt",
          p.slug,
          p.title,
          p.body,
          p.photo,
          p.status,
          stamp,
          p.status,
          stamp,
          p.kind,
          p.entryDate,
          p.music,
          p.song,
          post[1],
          data.updatedAt,
        );
        if (!saved)
          fail(409, "別の画面で更新されています。一覧から開き直してください。");
        return json(saved);
      }
      const comment = path.match(/^\/api\/admin\/comments\/([a-f0-9]{32})$/);
      if (comment && request.method === "DELETE") {
        await run(env, "DELETE FROM comments WHERE id=?", comment[1]);
        return json({ ok: true });
      }
      if (comment && request.method === "PATCH") {
        if (!["approved", "rejected"].includes(data.status))
          fail(400, "承認状態が不正です。");
        const c = await one(
          env,
          "UPDATE comments SET status=? WHERE id=? AND (parent_id IS NULL OR EXISTS(SELECT 1 FROM comments parent WHERE parent.id=comments.parent_id AND parent.status='approved')) RETURNING id",
          data.status,
          comment[1],
        );
        if (!c) fail(400, "コメントまたは返信先を確認してください。");
        if (data.status === "approved") await queueReply(env, c.id);
        return json({ ok: true });
      }
      if (path === "/api/admin/replies" && request.method === "POST") {
        const parent = await one(
          env,
          "SELECT c.* FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=? AND c.status='approved' AND c.parent_id IS NULL AND p.status='published'",
          text(data.parentId, 1, 64, "返信先"),
        );
        if (!parent) fail(400, "公開済みのコメントを選択してください。");
        const cid = id();
        await run(
          env,
          "INSERT INTO comments VALUES(?,?,?,?,?,?, 'approved',1,?)",
          cid,
          parent.post_id,
          parent.id,
          v.actor,
          "山近晴也",
          text(data.body, 1, 2000, "返信"),
          now(),
        );
        await queueReply(env, cid);
        return json({ id: cid }, 201);
      }
      fail(404, "操作が見つかりません。");
    }
    const like = path.match(/^\/api\/blog\/posts\/([a-z0-9-]+)\/like$/);
    if (like && request.method === "POST") {
      await protectRate(request, env, v, "like", 60);
      const p = await published(env, like[1]);
      if (typeof data.liked !== "boolean")
        fail(400, "いいねの状態が不正です。");
      if (data.liked)
        await run(
          env,
          "INSERT OR IGNORE INTO likes(post_id,actor) VALUES(?,?)",
          p.id,
          v.actor,
        );
      else
        await run(
          env,
          "DELETE FROM likes WHERE post_id=? AND actor=?",
          p.id,
          v.actor,
        );
      return json({
        liked: data.liked,
        likes: (
          await one(env, "SELECT count(*) n FROM likes WHERE post_id=?", p.id)
        ).n,
      });
    }
    const comment = path.match(/^\/api\/blog\/posts\/([a-z0-9-]+)\/comments$/);
    if (comment && request.method === "POST") {
      const p = await published(env, comment[1]);
      const credentials =
        request.headers.has("cf-access-jwt-assertion") ||
        request.headers
          .get("cookie")
          ?.split(";")
          .some((c) => c.trim().startsWith("CF_Authorization="));
      let owner = false;
      if (credentials) {
        await admin(request, env);
        owner = true;
      }
      const name = owner
          ? "山近晴也"
          : data.name
            ? text(data.name, 1, 40, "名前")
            : "匿名",
        body = text(data.body, 1, 2000, "コメント");
      let parent = null;
      if (data.parentId) {
        parent = await one(
          env,
          "SELECT id FROM comments WHERE id=? AND post_id=? AND status='approved' AND parent_id IS NULL",
          text(data.parentId, 1, 64, "返信先"),
          p.id,
        );
        if (!parent) fail(400, "公開済みの返信先を選択してください。");
      }
      await protectRate(request, env, v, "comment", 5);
      if (!owner) await challenge(request, env, data.turnstile);
      const cid = id();
      await run(
        env,
        "INSERT INTO comments VALUES(?,?,?,?,?,?,?,?,?)",
        cid,
        p.id,
        parent?.id || null,
        v.actor,
        name,
        body,
        owner ? "approved" : "pending",
        owner ? 1 : 0,
        now(),
      );
      if (owner && parent) await queueReply(env, cid);
      return json({ id: cid, status: owner ? "approved" : "pending" }, 201);
    }
    if (path === "/api/blog/subscriptions" && request.method === "POST") {
      if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.MAIL_ENCRYPTION_KEY)
        fail(503, "メール通知は現在利用できません。");
      const cid = text(data.commentId, 1, 64, "コメント"),
        email = text(data.email, 3, 254, "メールアドレス").toLowerCase();
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))
        fail(400, "メールアドレスを確認してください。");
      if (
        !(await one(
          env,
          "SELECT 1 FROM comments WHERE id=? AND actor=? AND status IN ('pending','approved')",
          cid,
          v.actor,
        ))
      )
        fail(404, "自分のコメントを選択してください。");
      await protectRate(request, env, v, "subscribe", 3);
      const emailHash = await hmac(env.SESSION_SECRET, "email:" + email);
      await limit(env, "mail:" + emailHash, 3, 3600000);
      if (await one(env, "SELECT 1 FROM subscriptions WHERE comment_id=?", cid))
        return json({ ok: true }, 202);
      const confirm = id() + id(),
        unsubscribe = id() + id(),
        sid = id();
      await run(
        env,
        "INSERT INTO subscriptions VALUES(?,?,?,?,?,?,?,?,0,?)",
        sid,
        cid,
        v.actor,
        await encrypt(env.MAIL_ENCRYPTION_KEY, email),
        emailHash,
        await sha(confirm),
        await sha(unsubscribe),
        await encrypt(env.MAIL_ENCRYPTION_KEY, unsubscribe),
        now() + 86400000,
      );
      try {
        await send(
          env,
          email,
          "Blogの返信通知を確認してください",
          `このコメントへの返信通知を希望する場合は、24時間以内に次のページを開き「通知を有効にする」を押してください。\n${env.SITE_ORIGIN}/blog/notifications/#confirm=${confirm}\n\n心当たりがなければ操作は不要です。確認前に返信通知を送信することはありません。`,
          `confirm-${sid}`,
        );
      } catch (e) {
        await run(env, "DELETE FROM subscriptions WHERE id=?", sid);
        throw e;
      }
      return json({ ok: true }, 202);
    }
    if (
      path === "/api/blog/subscriptions/confirm" &&
      request.method === "POST"
    ) {
      const hash = await sha(text(data.token, 64, 64, "確認リンク"));
      const sub = await one(
        env,
        "UPDATE subscriptions SET confirmed=1,confirm_hash=NULL WHERE confirm_hash=? AND expires>? AND confirmed=0 RETURNING id",
        hash,
        now(),
      );
      if (!sub) fail(400, "確認リンクは無効、期限切れ、または確認済みです。");
      return json({ ok: true });
    }
    if (
      path === "/api/blog/subscriptions/unsubscribe" &&
      request.method === "POST"
    ) {
      const hash = await sha(text(data.token, 64, 64, "解除リンク"));
      await run(
        env,
        "DELETE FROM subscriptions WHERE unsubscribe_hash=?",
        hash,
      );
      return json({ ok: true });
    }
    fail(404, "操作が見つかりません。");
  }
  return {
    async fetch(request, env) {
      try {
        const response = await route(request, env);
        return /^\/(?:blog|diary|admin|api|media)(?:\/|$)/.test(
          new URL(request.url).pathname,
        )
          ? secured(response)
          : response;
      } catch (e) {
        const conflict = String(e.message).includes("UNIQUE constraint failed");
        return secured(
          json(
            {
              error:
                e instanceof Problem
                  ? e.message
                  : conflict
                    ? "同じURLの記事が既にあります。"
                    : "処理できませんでした。時間を置いてお試しください。",
            },
            e instanceof Problem ? e.status : conflict ? 409 : 500,
          ),
        );
      }
    },
    async scheduled(controller, env) {
      await drain(env);
      await env.DB.batch([
        stmt(env, "DELETE FROM limits WHERE expires<?", now()),
        stmt(
          env,
          "DELETE FROM subscriptions WHERE confirmed=0 AND expires<?",
          now(),
        ),
        stmt(
          env,
          "DELETE FROM mail_queue WHERE created_at<?",
          now() - 7 * 86400000,
        ),
      ]);
    },
  };
}
export default createApp();
