import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../worker/index.mjs";

const origin = "https://yamachikaseiya.com";
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test" };
const keyResolver = createLocalJWKSet({ keys: [jwk] });
const token = (changes = {}) =>
  new SignJWT({ email: "owner@example.com", ...changes })
    .setSubject("owner")
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://test.cloudflareaccess.com")
    .setAudience("test-aud")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
let app, env, db, mail, objects;
function d1(sqlite) {
  return {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...args) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
        async run() {
          return {
            meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const stmt of statements) out.push(await stmt.run());
        sqlite.exec("COMMIT");
        return out;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/0001_blog.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL("../migrations/0002_diary.sql", import.meta.url),
      "utf8",
    ),
  );
  db.prepare(
    "INSERT INTO posts(id,slug,title,body,photo,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run("p1", "hello", "公開記事", "本文", null, "published", 1, 1, 1);
  db.prepare(
    "INSERT INTO posts(id,slug,title,body,photo,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run("p2", "secret", "秘密の下書き", "秘密", null, "draft", 1, 1, null);
  mail = [];
  objects = new Map();
  env = {
    SITE_ORIGIN: origin,
    ACCESS_ISSUER: "https://test.cloudflareaccess.com",
    ACCESS_AUD: "test-aud",
    ADMIN_EMAIL: "owner@example.com",
    SESSION_SECRET: "s".repeat(48),
    MAIL_ENCRYPTION_KEY: "e".repeat(48),
    TURNSTILE_SECRET: "real-secret",
    TURNSTILE_SITE_KEY: "public-key",
    RESEND_API_KEY: "test-key",
    MAIL_FROM: "Blog <blog@example.com>",
    DB: d1(db),
    PHOTOS: {
      async put(k, v, o) {
        objects.set(k, { v, o });
      },
      async get(k) {
        const o = objects.get(k);
        return o
          ? {
              body: o.v,
              httpMetadata: { contentType: o.o.httpMetadata.contentType },
            }
          : null;
      },
    },
    ASSETS: {
      async fetch() {
        return new Response(
          "<html><head></head><body><main>元のBlog</main></body></html>",
          { headers: { "content-type": "text/html" } },
        );
      },
    },
  };
  app = createApp({
    keyResolver,
    fetcher: async (url, options) => {
      if (String(url).includes("siteverify"))
        return Response.json({
          success: true,
          hostname: "yamachikaseiya.com",
          action: "comment",
        });
      if (String(url) === "https://api.resend.com/emails") {
        mail.push(JSON.parse(options.body));
        return Response.json({ id: "sent" });
      }
      throw Error("unexpected network");
    },
  });
});
async function request(
  path,
  { method = "GET", body, cookie, csrf, admin, headers = {} } = {},
) {
  const h = new Headers(headers);
  if (method !== "GET") {
    h.set("Origin", origin);
    h.set("Content-Type", "application/json");
  }
  if (cookie) h.set("Cookie", cookie);
  if (csrf) h.set("X-CSRF-Token", csrf);
  if (admin) h.set("Cf-Access-Jwt-Assertion", admin);
  h.set("CF-Connecting-IP", "192.0.2.1");
  return app.fetch(
    new Request(origin + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    {},
  );
}
async function session() {
  const r = await request("/api/blog/session");
  return {
    ...(await r.json()),
    cookie: r.headers.get("set-cookie").split(";")[0],
  };
}
async function comment(s, body = {}) {
  return request("/api/blog/posts/hello/comments", {
    method: "POST",
    cookie: s.cookie,
    csrf: s.csrf,
    body: { name: "読者", body: "感想です", turnstile: "valid", ...body },
  });
}
test("X向け取得で公開記事のカード情報を返し、下書きは返さない", async () => {
  const r = await request("/blog/hello/", {headers:{"User-Agent":"Twitterbot/1.0"}});
  assert.equal(r.status,200);
  const html = await r.text();
  assert.match(html, /<meta name="twitter:title" content="公開記事 \| 山近晴也">/);
  assert.match(html, /<meta name="twitter:description" content="本文">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.equal((await request("/blog/secret/", {headers:{"User-Agent":"Twitterbot/1.0"}})).status,404);
});
test("日記の共有カードは日付・本文概要・日記画像を使い、下書きは漏らさない",async()=>{
 db.prepare("INSERT INTO posts(id,slug,title,body,status,created_at,updated_at,published_at,kind,entry_date) VALUES(?,?,?,?,?,?,?,?,?,?)")
   .run('diary-share','diary-share','2026-11-02','## 今日\n\n**日記**を書きました。','published',1,1,1,'diary','2026-11-02');
 for(const path of ['/diary/','/diary/2026-11-02/']){
   const r=await request(path,{headers:{'User-Agent':'Twitterbot/1.0'}});assert.equal(r.status,200);const html=await r.text();
   assert.match(html,/<meta name="twitter:title" content="2026-11-02の日記 \| 山近晴也">/);
   assert.match(html,/<meta name="twitter:description" content="今日 日記を書きました。">/);
   assert.ok(html.includes('content="'+origin+'/images/diary-og-card.png"'));
   assert.match(html,/<meta property="og:type" content="article">/);
 }
 db.prepare("UPDATE posts SET status='draft' WHERE id='diary-share'").run();
 assert.equal((await request('/diary/2026-11-02/')).status,404);
 const html=await(await request('/diary/')).text();assert.ok(!html.includes('日記を書きました。'));
 assert.match(html,/<meta name="twitter:title" content="日記 \| 山近晴也">/);
});
test("日記の横移動は古い日付まで辿れ、本文は前後分だけを読み込む",async()=>{
 const insert=db.prepare("INSERT INTO posts(id,slug,title,body,status,created_at,updated_at,published_at,kind,entry_date) VALUES(?,?,?,?,?,?,?,?,?,?)");
 const dates=[];
 for(let i=0;i<367;i++){
   const date=new Date(Date.UTC(2026,10,2)-i*86400000).toISOString().slice(0,10);dates.push(date);
   insert.run('day'+i,'day'+i,date,'本文番号'+i+'終端','published',1,1,1,'diary',date);
 }
 const latest=await(await request('/diary/')).text();
 assert.ok(latest.includes('本文番号0終端'));assert.ok(latest.includes('本文番号1終端'));assert.ok(!latest.includes('本文番号2終端'));
 assert.ok(latest.includes('class="diary-latest"'));
 const oldest=await request('/diary/'+dates[366]+'/');assert.equal(oldest.status,200);
 const html=await oldest.text();
 assert.ok(html.includes('href="/diary/'+dates[365]+'/#diary-reader"'));
 assert.ok(!html.includes('data-diary-step="1"'));
 assert.ok(html.includes('data-slug="day366"'));
 assert.ok(html.includes('本文番号366終端'));assert.ok(!html.includes('本文番号0終端'));
});

test("未保存のMarkdownプレビューは管理者限定でデータを変更しない", async () => {
  const s = await session();
  const before = db.prepare("SELECT * FROM posts ORDER BY id").all();
  const body = {kind:"blog",title:"入力中",slug:"unsaved",body:"## 未保存の見出し\n\n**太字**",status:"draft"};
  assert.equal((await request("/api/admin/preview", {method:"POST",body,cookie:s.cookie,csrf:s.csrf})).status,401);
  assert.equal((await request("/api/admin/preview", {method:"POST",body,admin:await token(),cookie:s.cookie})).status,403);
  const response = await request("/api/admin/preview", {method:"POST",body,admin:await token(),cookie:s.cookie,csrf:s.csrf});
  assert.equal(response.status,200);
  assert.match((await response.json()).html, /<h2>未保存の見出し<\/h2>/);
  assert.deepEqual(db.prepare("SELECT * FROM posts ORDER BY id").all(),before);
});

test("管理画面と全管理APIは署名なし・偽造・別ユーザーを拒否", async () => {
  for (const path of ["/admin/", "/api/admin/posts", "/api/admin/comments"])
    assert.equal((await request(path)).status, 401);
  assert.equal(
    (await request("/api/admin/posts", { admin: "fake" })).status,
    401,
  );
  assert.equal(
    (
      await request("/api/admin/posts", {
        admin: await token({ email: "intruder@example.com" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/admin/posts", { admin: await token() })).status,
    200,
  );
});
test("期限切れ・別audience・別issuer・認証設定不足は拒否", async () => {
  for (const jwt of [
    await new SignJWT({ email: "owner@example.com" })
      .setSubject("owner")
      .setIssuedAt()
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(env.ACCESS_ISSUER)
      .setAudience("other")
      .setExpirationTime("1h")
      .sign(privateKey),
    await new SignJWT({ email: "owner@example.com" })
      .setSubject("owner")
      .setIssuedAt()
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://evil.cloudflareaccess.com")
      .setAudience(env.ACCESS_AUD)
      .setExpirationTime("1h")
      .sign(privateKey),
    await new SignJWT({ email: "owner@example.com" })
      .setSubject("owner")
      .setIssuedAt()
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(env.ACCESS_ISSUER)
      .setAudience(env.ACCESS_AUD)
      .setExpirationTime(1)
      .sign(privateKey),
  ])
    assert.equal(
      (await request("/api/admin/posts", { admin: jwt })).status,
      401,
    );
  env.ADMIN_EMAIL = "";
  assert.equal(
    (await request("/api/admin/posts", { admin: await token() })).status,
    503,
  );
});
test("下書きは一覧・本文・コメント・写真から漏れない", async () => {
  assert.equal((await request("/blog/secret/")).status, 404);
  assert.equal((await request("/api/blog/posts/secret")).status, 404);
  assert.ok(!(await (await request("/blog/")).text()).includes("秘密"));
  objects.set("a".repeat(32) + ".png", {
    v: new Uint8Array([1]),
    o: { httpMetadata: { contentType: "image/png" } },
  });
  db.prepare("UPDATE posts SET photo=? WHERE id=?").run(
    "a".repeat(32) + ".png",
    "p2",
  );
  assert.equal(
    (await request("/media/" + "a".repeat(32) + ".png")).status,
    404,
  );
});
test("Origin・CSRF・Cookie改ざん・Content-Type・過大リクエストを拒否", async () => {
  const s = await session();
  assert.equal(
    (
      await request("/api/blog/posts/hello/like", {
        method: "POST",
        cookie: s.cookie,
        body: { liked: true },
      })
    ).status,
    403,
  );
  const raw = new Request(origin + "/api/blog/posts/hello/like", {
    method: "POST",
    headers: {
      Origin: "https://evil.test",
      "Content-Type": "application/json",
      Cookie: s.cookie,
      "X-CSRF-Token": s.csrf,
    },
    body: '{"liked":true}',
  });
  assert.equal((await app.fetch(raw, env, {})).status, 403);
  assert.equal(
    (
      await request("/api/blog/posts/hello/like", {
        method: "POST",
        cookie: s.cookie + "bad",
        csrf: s.csrf,
        body: { liked: true },
      })
    ).status,
    403,
  );
  const wrongType = new Request(origin + "/api/blog/posts/hello/like", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "text/plain",
      Cookie: s.cookie,
      "X-CSRF-Token": s.csrf,
    },
    body: "{}",
  });
  assert.equal((await app.fetch(wrongType, env, {})).status, 415);
  assert.equal(
    (
      await request("/api/blog/posts/hello/like", {
        method: "POST",
        cookie: s.cookie,
        csrf: s.csrf,
        body: { x: "x".repeat(40000) },
      })
    ).status,
    413,
  );
});
test("いいねはサーバーで重複防止し取り消し可能", async () => {
  const s = await session();
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await request("/api/blog/posts/hello/like", {
          method: "POST",
          cookie: s.cookie,
          csrf: s.csrf,
          body: { liked: true },
        })
      ).status,
      200,
    );
  assert.equal(db.prepare("SELECT count(*) n FROM likes").get().n, 1);
  await request("/api/blog/posts/hello/like", {
    method: "POST",
    cookie: s.cookie,
    csrf: s.csrf,
    body: { liked: false },
  });
  assert.equal(db.prepare("SELECT count(*) n FROM likes").get().n, 0);
});
test("コメントは未承認の間は他人に見えず、本人には承認待ちと分かる", async () => {
  const s = await session();
  const result = await comment(s);
  assert.equal(result.status, 201);
  assert.equal(
    (await (await request("/api/blog/posts/hello")).json()).comments.length,
    0,
  );
  const mine = await (
    await request("/api/blog/posts/hello", { cookie: s.cookie })
  ).json();
  assert.equal(mine.comments[0].status, "pending");
  assert.ok(!JSON.stringify(mine).includes("actor"));
});
test("XSS文字列・SQL注入は実行されず文字として表示", async () => {
  const s = await session();
  const r = await comment(s, {
    name: "'; DROP TABLE posts;--",
    body: "<img src=x onerror=alert(1)>",
  });
  assert.equal(r.status, 201);
  db.prepare("UPDATE comments SET status='approved'").run();
  db.prepare("UPDATE posts SET body=? WHERE id=?").run(
    "<script>alert(1)</script>",
    "p1",
  );
  const html = await (await request("/blog/hello/")).text();
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.equal(db.prepare("SELECT count(*) n FROM posts").get().n, 2);
});
test("Turnstile失敗・ホスト不一致・action不一致・未設定を拒否", async () => {
  for (const answer of [
    { success: false },
    { success: true, hostname: "evil.test", action: "comment" },
    { success: true, hostname: "yamachikaseiya.com", action: "other" },
  ]) {
    app = createApp({
      keyResolver,
      fetcher: async () => Response.json(answer),
    });
    const s = await session();
    assert.equal((await comment(s)).status, 403);
  }
  env.TURNSTILE_SECRET = "";
  const s = await session();
  assert.equal((await comment(s)).status, 503);
});
test("Cookieを変えても同一IPの連続投稿を制限", async () => {
  for (let i = 0; i < 5; i++) {
    const s = await session();
    assert.equal((await comment(s)).status, 201);
  }
  const s = await session();
  assert.equal((await comment(s)).status, 429);
});
test("別記事への返信・非公開コメントへの返信・不正なIDを拒否", async () => {
  const s = await session();
  const c = await (await comment(s)).json();
  assert.equal((await comment(s, { parentId: c.id })).status, 400);
  assert.equal((await comment(s, { parentId: "missing" })).status, 400);
});
test("管理者は記事を保存・公開・非公開化でき、公開日時を保持する", async () => {
  const s = await session(),
    admin = await token();
  let r = await request("/api/admin/posts", {
    method: "POST",
    ...s,
    admin,
    body: { title: "新記事", slug: "new-post", body: "内容", status: "draft" },
  });
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.equal((await request("/blog/new-post/")).status, 404);
  r = await request("/api/admin/posts/" + p.id, {
    method: "PUT",
    ...s,
    admin,
    body: {
      title: "新記事",
      slug: "new-post",
      body: "内容",
      status: "published",
      updatedAt: p.updatedAt,
    },
  });
  assert.equal(r.status, 200);
  assert.equal((await request("/blog/new-post/")).status, 200);
  assert.equal(
    (
      await request("/api/admin/posts/" + p.id, {
        method: "PUT",
        ...s,
        admin,
        body: {
          title: "上書き",
          slug: "new-post",
          body: "古いタブ",
          status: "draft",
          updatedAt: p.updatedAt,
        },
      })
    ).status,
    409,
  );
});
test("メール通知は本人のコメントだけ登録でき、確認前は通知されない", async () => {
  const s = await session(),
    other = await session();
  const c = await (await comment(s)).json();
  assert.equal(
    (
      await request("/api/blog/subscriptions", {
        method: "POST",
        ...other,
        body: { commentId: c.id, email: "reader@example.com" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/api/blog/subscriptions", {
        method: "POST",
        ...s,
        body: { commentId: c.id, email: "reader@example.com" },
      })
    ).status,
    202,
  );
  assert.equal(mail.length, 1);
  const sub = db.prepare("SELECT * FROM subscriptions").get();
  assert.ok(!sub.email.includes("reader@example.com"));
  assert.equal(sub.confirmed, 0);
  const confirmation = mail[0].text.match(/#confirm=([^\s]+)/)[1];
  assert.equal(
    (
      await request("/api/blog/subscriptions/confirm", {
        method: "POST",
        ...s,
        body: { token: confirmation },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/blog/subscriptions/confirm", {
        method: "POST",
        ...s,
        body: { token: confirmation },
      })
    ).status,
    400,
  );
  assert.equal(
    db.prepare("SELECT confirmed FROM subscriptions").get().confirmed,
    1,
  );
  assert.equal(
    (
      await request("/api/blog/subscriptions/unsubscribe", {
        method: "POST",
        ...s,
        body: { token: sub.unsubscribe_token },
      })
    ).status,
    400,
  );
});
test("公開した返信だけ通知し、二重承認でも重複しない。解除後は送信しない", async () => {
  const reader = await session(),
    s = await session(),
    admin = await token();
  const c = await (await comment(reader)).json();
  await request("/api/blog/subscriptions", {
    method: "POST",
    ...reader,
    body: { commentId: c.id, email: "reader@example.com" },
  });
  const confirmation = mail[0].text.match(/#confirm=([^\s]+)/)[1];
  await request("/api/blog/subscriptions/confirm", {
    method: "POST",
    ...s,
    body: { token: confirmation },
  });
  await request("/api/admin/comments/" + c.id, {
    method: "PATCH",
    ...s,
    admin,
    body: { status: "approved" },
  });
  const reply = await (
    await request("/api/admin/replies", {
      method: "POST",
      ...s,
      admin,
      body: { parentId: c.id, body: "返信です" },
    })
  ).json();
  assert.ok(reply.id);
  await app.scheduled({}, env, {});
  await app.scheduled({}, env, {});
  assert.equal(mail.length, 2);
  const unsub = mail[1].text.match(/#unsubscribe=([^\s]+)/)[1];
  await request("/api/blog/subscriptions/unsubscribe", {
    method: "POST",
    ...s,
    body: { token: unsub },
  });
  await request("/api/admin/replies", {
    method: "POST",
    ...s,
    admin,
    body: { parentId: c.id, body: "もう一つ" },
  });
  await app.scheduled({}, env, {});
  assert.equal(mail.length, 2);
});
test("Cookieと応答ヘッダーに保護属性があり、公開APIにメール・秘密を含まない", async () => {
  const r = await request("/api/blog/session");
  const cookie = r.headers.get("set-cookie");
  for (const part of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"])
    assert.ok(cookie.includes(part));
  for (const path of [
    "/blog/",
    "/api/blog/posts/hello",
    "/blog/notifications/",
  ]) {
    const res = await request(path);
    assert.ok(
      res.headers
        .get("content-security-policy")
        .includes("frame-ancestors 'none'"),
    );
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  }
});
test("親コメントを非表示にすると、その返信も公開APIから消える", async () => {
  const reader = await session(),
    owner = await session(),
    admin = await token();
  const c = await (await comment(reader)).json();
  await request("/api/admin/comments/" + c.id, {
    method: "PATCH",
    ...owner,
    admin,
    body: { status: "approved" },
  });
  await request("/api/admin/replies", {
    method: "POST",
    ...owner,
    admin,
    body: { parentId: c.id, body: "返信の本文" },
  });
  await request("/api/admin/comments/" + c.id, {
    method: "PATCH",
    ...owner,
    admin,
    body: { status: "rejected" },
  });
  const data = await (await request("/api/blog/posts/hello")).json();
  assert.equal(data.comments.length, 0);
});
test("返信は一段までに制限し、削除は子コメントと通知も消す", async () => {
  const reader = await session(),
    owner = await session(),
    admin = await token();
  const c = await (await comment(reader)).json();
  await request("/api/admin/comments/" + c.id, {
    method: "PATCH",
    ...owner,
    admin,
    body: { status: "approved" },
  });
  const reply = await (
    await request("/api/admin/replies", {
      method: "POST",
      ...owner,
      admin,
      body: { parentId: c.id, body: "返信" },
    })
  ).json();
  assert.equal((await comment(reader, { parentId: reply.id })).status, 400);
  assert.equal(
    (
      await request("/api/admin/comments/" + c.id, {
        method: "DELETE",
        ...owner,
        admin,
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(db.prepare("SELECT count(*) n FROM comments").get().n, 0);
});
test("写真は管理者に限り形式・容量を検証し、公開まで取得できない", async () => {
  const s = await session(),
    admin = await token();
  const upload = async (bytes, type, jwt = admin) =>
    app.fetch(
      new Request(origin + "/api/admin/photos", {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: s.cookie,
          "X-CSRF-Token": s.csrf,
          "Cf-Access-Jwt-Assertion": jwt,
          "Content-Type": type,
        },
        body: bytes,
      }),
      env,
      {},
    );
  assert.equal(
    (await upload("<svg onload=alert(1)>", "image/svg+xml")).status,
    400,
  );
  assert.equal(
    (await upload(new Uint8Array(5 * 1024 * 1024 + 1), "image/png")).status,
    413,
  );
  assert.equal((await upload("photo", "image/png", "fake")).status, 401);
  const png = new Uint8Array(30);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const result = await upload(png, "image/png");
  assert.equal(result.status, 201);
  const photo = await result.json();
  assert.equal((await request(photo.url)).status, 404);
  assert.equal((await request(photo.url, { admin })).status, 200);
  assert.equal((await upload(png, "image/jpeg")).status, 400);
});
test("メール確認の期限切れ、通知設定不足、未承認返信は配信しない", async () => {
  const s = await session();
  const c = await (await comment(s)).json();
  env.RESEND_API_KEY = "";
  assert.equal(
    (
      await request("/api/blog/subscriptions", {
        method: "POST",
        ...s,
        body: { commentId: c.id, email: "reader@example.com" },
      })
    ).status,
    503,
  );
  env.RESEND_API_KEY = "test";
  await request("/api/blog/subscriptions", {
    method: "POST",
    ...s,
    body: { commentId: c.id, email: "reader@example.com" },
  });
  const confirmation = mail[0].text.match(/#confirm=([^\s]+)/)[1];
  db.prepare("UPDATE subscriptions SET expires=1").run();
  assert.equal(
    (
      await request("/api/blog/subscriptions/confirm", {
        method: "POST",
        ...s,
        body: { token: confirmation },
      })
    ).status,
    400,
  );
  await app.scheduled({}, env, {});
  assert.equal(db.prepare("SELECT count(*) n FROM subscriptions").get().n, 0);
  assert.equal(mail.length, 1);
});
test("送信失敗時は承認を取り消さず、同じ配信キーで再試行する", async () => {
  const reader = await session(),
    owner = await session(),
    admin = await token();
  const c = await (await comment(reader)).json();
  await request("/api/blog/subscriptions", {
    method: "POST",
    ...reader,
    body: { commentId: c.id, email: "reader@example.com" },
  });
  const confirmation = mail[0].text.match(/#confirm=([^\s]+)/)[1];
  await request("/api/blog/subscriptions/confirm", {
    method: "POST",
    ...reader,
    body: { token: confirmation },
  });
  await request("/api/admin/comments/" + c.id, {
    method: "PATCH",
    ...owner,
    admin,
    body: { status: "approved" },
  });
  await request("/api/admin/replies", {
    method: "POST",
    ...owner,
    admin,
    body: { parentId: c.id, body: "返信" },
  });
  let failures = true;
  const keys = [];
  app = createApp({
    keyResolver,
    fetcher: async (url, options) => {
      keys.push(options.headers["Idempotency-Key"]);
      return new Response("{}", { status: failures ? 503 : 200 });
    },
  });
  await app.scheduled({}, env, {});
  assert.equal(
    db.prepare("SELECT state FROM mail_queue").get().state,
    "pending",
  );
  failures = false;
  await app.scheduled({}, env, {});
  assert.equal(db.prepare("SELECT state FROM mail_queue").get().state, "sent");
  assert.equal(keys[0], keys[1]);
});
test("別ホスト経由・秘密ファイル・想定外APIは公開しない", async () => {
  assert.equal(
    (
      await app.fetch(
        new Request("https://other.workers.dev/api/admin/posts"),
        env,
        {},
      )
    ).status,
    421,
  );
  assert.equal((await request("/api/draft")).status, 404);
});
test("下書きの写真はAccess Cookieでも署名と管理者権限を検証する", async () => {
  const key = "a".repeat(32) + ".png";
  objects.set(key, {
    v: new Uint8Array([1]),
    o: { httpMetadata: { contentType: "image/png" } },
  });
  assert.equal(
    (
      await request("/media/" + key, {
        cookie: "CF_Authorization=" + (await token()),
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/media/" + key, { cookie: "CF_Authorization=fake" }))
      .status,
    404,
  );
  assert.equal(
    (
      await request("/media/" + key, {
        cookie:
          "CF_Authorization=" +
          (await token({ email: "intruder@example.com" })),
      })
    ).status,
    404,
  );
});
test("本番ではTurnstileの公開テストキーを受け付けない", async () => {
  const s = await session();
  env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
  assert.equal((await comment(s)).status, 503);
});
test("読者が管理者表示や承認状態を指定しても無視する", async () => {
  const s = await session();
  const r = await comment(s, {
    name: "山近晴也",
    isAdmin: true,
    status: "approved",
  });
  assert.equal(r.status, 201);
  const c = db.prepare("SELECT * FROM comments").get();
  assert.equal(c.is_admin, 0);
  assert.equal(c.status, "pending");
});
test("本文のドル記号をHTML置換の命令として解釈しない", async () => {
  env.ASSETS.fetch = async () =>
    new Response(
      readFileSync(new URL("../blog/index.html", import.meta.url), "utf8"),
      { headers: { "Content-Type": "text/html" } },
    );
  db.prepare("UPDATE posts SET body=? WHERE id=?").run(
    "$& $1 <script>alert(1)</script>",
    "p1",
  );
  const html = await (await request("/blog/hello/")).text();
  assert.ok(html.includes("$&amp; $1 &lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.equal((html.match(/<main/g) || []).length, 1);
});
test("日記は日付別に保存し、下書きを隠し、公開後は専用URLから読める", async () => {
  const s = await session(),
    admin = await token();
  const r = await request("/api/admin/posts", {
    method: "POST",
    ...s,
    admin,
    body: {
      kind: "diary",
      date: "2026-10-22",
      body: "日記の本文",
      music: "https://example.com/song",
      song: "今日の曲",
      status: "draft",
    },
  });
  assert.equal(r.status, 201);
  const saved = await r.json();
  assert.equal((await request("/diary/2026-10-22/")).status, 404);
  assert.ok(!(await (await request("/diary/")).text()).includes("日記の本文"));
  const p = db.prepare("SELECT * FROM posts WHERE id=?").get(saved.id);
  assert.equal(
    (
      await request("/api/admin/posts/" + p.id, {
        method: "PUT",
        ...s,
        admin,
        body: {
          kind: "diary",
          date: "2026-10-22",
          body: p.body,
          music: p.music,
          song: p.song,
          status: "published",
          updatedAt: p.updated_at,
        },
      })
    ).status,
    200,
  );
  const html = await (await request("/diary/2026-10-22/")).text();
  assert.ok(html.includes("日記の本文"));
  assert.ok(html.includes('id="like"'));
  assert.ok(html.includes('id="comment-form"'));
  assert.ok((await (await request("/diary/")).text()).includes("日記の本文"));
  assert.ok(!(await (await request("/blog/")).text()).includes("日記の本文"));
  assert.equal((await request("/blog/diary-2026-10-22/")).status, 404);
});
test("音楽だけの日記は保存できる。不正日付・危険なURL・空の日記は拒否", async () => {
  const s = await session(),
    admin = await token();
  const submit = (body) =>
    request("/api/admin/posts", {
      method: "POST",
      ...s,
      admin,
      body: {
        kind: "diary",
        date: "2026-10-22",
        body: "",
        status: "draft",
        ...body,
      },
    });
  for (const data of [
    { date: "2026-02-30", body: "日記" },
    { body: "" },
    { music: "javascript:alert(1)" },
    { music: "https://user:password@example.com/" },
  ])
    assert.equal((await submit(data)).status, 400);
  assert.equal(
    (await submit({ music: "https://example.com/music" })).status,
    201,
  );
  assert.equal((await submit({ body: "同じ日" })).status, 409);
});
test("本人が公開フォームから投稿すると、名前を指定しなくても認証済み本人になる", async () => {
  const s = await session(),
    admin = await token();
  const config = await (await request("/api/blog/session", { admin })).json();
  assert.equal(config.isAdmin, true);
  const r = await request("/api/blog/posts/hello/comments", {
    method: "POST",
    ...s,
    admin,
    body: { body: "本人のコメント", name: "別の名前" },
  });
  assert.equal(r.status, 201);
  const c = db.prepare("SELECT * FROM comments").get();
  assert.equal(c.name, "山近晴也");
  assert.equal(c.is_admin, 1);
  assert.equal(c.status, "approved");
  const publicComment = (await (await request("/api/blog/posts/hello")).json())
    .comments[0];
  assert.equal(publicComment.isAdmin, 1);
});
test("日記とBlogのいいね・コメントは混ざらない", async () => {
  const s = await session(),
    admin = await token();
  const r = await request("/api/admin/posts", {
    method: "POST",
    ...s,
    admin,
    body: {
      kind: "diary",
      date: "2026-10-22",
      body: "日記",
      status: "published",
    },
  });
  assert.equal(r.status, 201);
  assert.equal(
    (
      await request("/api/blog/posts/diary-2026-10-22/like", {
        method: "POST",
        ...s,
        body: { liked: true },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/blog/posts/diary-2026-10-22/comments", {
        method: "POST",
        ...s,
        body: { body: "日記へのコメント", turnstile: "valid" },
      })
    ).status,
    201,
  );
  const blog = await (await request("/api/blog/posts/hello")).json();
  assert.equal(blog.likes, 0);
  assert.equal(blog.comments.length, 0);
});
test("日記への返信メールは日記のURLを案内し、偽造認証では本人投稿できない", async () => {
  const reader = await session(),
    owner = await session(),
    admin = await token();
  assert.equal(
    (
      await request("/api/blog/posts/hello/comments", {
        method: "POST",
        ...reader,
        admin: "fake",
        body: { body: "偽の本人" },
      })
    ).status,
    401,
  );
  await request("/api/admin/posts", {
    method: "POST",
    ...owner,
    admin,
    body: {
      kind: "diary",
      date: "2026-10-22",
      body: "日記",
      status: "published",
    },
  });
  const c = await (
    await request("/api/blog/posts/diary-2026-10-22/comments", {
      method: "POST",
      ...reader,
      body: { body: "感想", turnstile: "valid" },
    })
  ).json();
  await request("/api/blog/subscriptions", {
    method: "POST",
    ...reader,
    body: { commentId: c.id, email: "reader@example.com" },
  });
  const confirmation = mail[0].text.match(/#confirm=([^\s]+)/)[1];
  await request("/api/blog/subscriptions/confirm", {
    method: "POST",
    ...reader,
    body: { token: confirmation },
  });
  await request("/api/admin/comments/" + c.id, {
    method: "PATCH",
    ...owner,
    admin,
    body: { status: "approved" },
  });
  await request("/api/admin/replies", {
    method: "POST",
    ...owner,
    admin,
    body: { parentId: c.id, body: "返信" },
  });
  await app.scheduled({}, env, {});
  assert.equal(mail.length, 2);
  assert.ok(mail[1].text.includes("/diary/2026-10-22/#comment-"));
  assert.ok(!mail[1].text.includes("/blog/diary-"));
});
