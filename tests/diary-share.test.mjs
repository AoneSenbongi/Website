import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../worker/index.mjs";

const origin = "https://yamachikaseiya.com";
const ID = "b".repeat(32);
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test" };
const keyResolver = createLocalJWKSet({ keys: [jwk] });
const adminToken = () =>
  new SignJWT({ email: "owner@example.com" })
    .setSubject("owner")
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://test.cloudflareaccess.com")
    .setAudience("test-aud")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
let app, env, db;
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
  for (const file of ["0001_blog.sql", "0002_diary.sql", "0003_share.sql"])
    db.exec(
      readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"),
    );
  db.prepare(
    "INSERT INTO posts(id,slug,title,body,status,created_at,updated_at,published_at,kind,entry_date,music,song) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    ID,
    "diary-draft",
    "2025-11-03",
    "非公開の日記の本文です。",
    "draft",
    1,
    1,
    null,
    "diary",
    "2025-11-03",
    "https://youtu.be/iGkNXfFSdsY",
    "今日の曲",
  );
  env = {
    SITE_ORIGIN: origin,
    ACCESS_ISSUER: "https://test.cloudflareaccess.com",
    ACCESS_AUD: "test-aud",
    ADMIN_EMAIL: "owner@example.com",
    SESSION_SECRET: "s".repeat(48),
    DB: d1(db),
    ASSETS: {
      async fetch() {
        return new Response(
          "<html><head></head><body><main>元のBlog</main></body></html>",
          { headers: { "content-type": "text/html" } },
        );
      },
    },
  };
  app = createApp({ keyResolver });
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
async function share() {
  const s = await session();
  const r = await request("/api/admin/posts/" + ID + "/share", {
    method: "POST",
    body: {},
    cookie: s.cookie,
    csrf: s.csrf,
    admin: await adminToken(),
  });
  assert.equal(r.status, 200);
  return (await r.json()).shareToken;
}
test("非公開日記はキーなしでは404で、本文を返さない", async () => {
  assert.equal((await request("/diary/2025-11-03/")).status, 404);
  const top = await (await request("/diary/")).text();
  assert.ok(!top.includes("非公開の日記の本文です。"));
});
test("正しいキーでのみ単票を表示し、noindexと移動・反応なし", async () => {
  const token = await share();
  const ok = await request("/diary/2025-11-03/?key=" + token);
  assert.equal(ok.status, 200);
  const html = await ok.text();
  assert.ok(html.includes("非公開の日記の本文です。"));
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(!html.includes("diary-navigation"));
  assert.ok(!html.includes("comment-composer"));
  assert.ok(!html.includes("blog-ui/diary.js"));
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<meta property="og:title" content="2025-11-03の日記 \| 山近晴也">/);
  assert.equal(
    (await request("/diary/2025-11-03/?key=" + "x".repeat(43))).status,
    404,
  );
  assert.equal(
    (await request("/diary/2025-11-03/?key=" + token.slice(0, 42) + "x")).status,
    404,
  );
});
test("公開済みの日記はキーがなくても通常どおり表示される", async () => {
  db.prepare("UPDATE posts SET status='published',published_at=1 WHERE id=?").run(ID);
  assert.equal((await request("/diary/2025-11-03/")).status, 200);
});
test("共有トークンの作成は管理者限定で、再作成と無効化が効く", async () => {
  const s = await session();
  const body = { cookie: s.cookie, csrf: s.csrf };
  assert.equal(
    (await request("/api/admin/posts/" + ID + "/share", { method: "POST", body: {} })).status,
    401,
  );
  const first = await share();
  assert.match(first, /^[\w-]{43}$/);
  const second = await share();
  assert.notEqual(second, first);
  assert.equal((await request("/diary/2025-11-03/?key=" + first)).status, 404);
  assert.equal((await request("/diary/2025-11-03/?key=" + second)).status, 200);
  const revoke = await request("/api/admin/posts/" + ID + "/share", {
    method: "DELETE",
    body: {},
    admin: await adminToken(),
    ...body,
  });
  assert.equal(revoke.status, 200);
  assert.equal((await request("/diary/2025-11-03/?key=" + second)).status, 404);
  db.prepare("UPDATE posts SET status='published',published_at=1 WHERE id=?").run(ID);
  assert.equal(
    (await request("/api/admin/posts/" + ID + "/share", { method: "POST", body: {}, admin: await adminToken(), ...body })).status,
    404,
  );
  assert.equal(
    (await request("/api/admin/posts/" + "0".repeat(32) + "/share", { method: "POST", body: {}, admin: await adminToken(), ...body })).status,
    404,
  );
});
test("保存APIは共有トークンを変更せず、日記の更新後もリンクは有効", async () => {
  const token = await share();
  const s = await session();
  const current = await request("/api/admin/posts", { cookie: s.cookie, admin: await adminToken() });
  const post = (await current.json()).find((p) => p.id === ID);
  const updated = await request("/api/admin/posts/" + ID, {
    method: "PUT",
    body: {
      kind: "diary",
      date: "2025-11-03",
      body: "更新後の本文です。",
      photo: null,
      status: "draft",
      title: "2025-11-03",
      slug: "diary-2025-11-03",
      music: "",
      song: "",
      updatedAt: post.updated_at,
    },
    cookie: s.cookie,
    csrf: s.csrf,
    admin: await adminToken(),
  });
  assert.equal(updated.status, 200);
  const html = await (await request("/diary/2025-11-03/?key=" + token)).text();
  assert.ok(html.includes("更新後の本文です。"));
});
