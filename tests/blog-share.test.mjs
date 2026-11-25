import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../worker/index.mjs";

const origin = "https://yamachikaseiya.com";
const ID = "c".repeat(32);
const PHOTO = "a".repeat(32) + ".jpg";
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
        bind(...values) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } };
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
    db.exec(readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"));
  db.prepare(
    "INSERT INTO posts(id,slug,title,body,status,created_at,updated_at,published_at,kind,entry_date,music,song) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(ID, "shared-draft", "共有したい記事", "非公開の記事の本文です。", "draft", 1, 1, null, "blog", null, null, null);
  const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  env = {
    SITE_ORIGIN: origin,
    ACCESS_ISSUER: "https://test.cloudflareaccess.com",
    ACCESS_AUD: "test-aud",
    ADMIN_EMAIL: "owner@example.com",
    SESSION_SECRET: "s".repeat(48),
    DB: d1(db),
    PHOTOS: {
      async get(key) {
        return key === PHOTO
          ? { body: photoBytes, httpMetadata: { contentType: "image/jpeg" } }
          : null;
      },
    },
    ASSETS: {
      async fetch() {
        return new Response("<html><head></head><body><main>元のBlog</main></body></html>", {
          headers: { "content-type": "text/html" },
        });
      },
    },
  };
  app = createApp({ keyResolver });
});
async function request(path, { method = "GET", body, cookie, csrf, admin } = {}) {
  const h = new Headers({ "CF-Connecting-IP": "192.0.2.1" });
  if (method !== "GET") {
    h.set("Origin", origin);
    h.set("Content-Type", "application/json");
  }
  if (cookie) h.set("Cookie", cookie);
  if (csrf) h.set("X-CSRF-Token", csrf);
  if (admin) h.set("Cf-Access-Jwt-Assertion", admin);
  return app.fetch(new Request(origin + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, {});
}
async function session() {
  const r = await request("/api/blog/session");
  return {
    ...(await r.json()),
    cookie: r.headers.get("set-cookie").split(";")[0],
  };
}
async function share() {
  const { cookie, csrf } = await session();
  const r = await request("/api/admin/posts/" + ID + "/share", {
    method: "POST",
    body: {},
    cookie: cookie.split(";")[0],
    csrf,
    admin: await adminToken(),
  });
  assert.equal(r.status, 200);
  return (await r.json()).shareToken;
}
test("下書き記事はキーなしでは404で、一覧にも本文を出さない", async () => {
  assert.equal((await request("/blog/shared-draft/")).status, 404);
  const top = await (await request("/blog/")).text();
  assert.ok(!top.includes("非公開の記事の本文です。"));
});
test("正しいキーでのみ単票を表示し、noindexと反応・コメント・スクリプトなし", async () => {
  const token = await share();
  const ok = await request("/blog/shared-draft/?key=" + token);
  assert.equal(ok.status, 200);
  const html = await ok.text();
  assert.ok(html.includes("非公開の記事の本文です。"));
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<meta property="og:title" content="共有したい記事 \| 山近晴也">/);
  assert.ok(!html.includes("article-end"));
  assert.ok(!html.includes("comment-composer"));
  assert.ok(!html.includes("blog-ui/article.js"));
  assert.ok(!html.includes("data-slug="));
  assert.equal((await request("/blog/shared-draft/?key=" + "x".repeat(43))).status, 404);
  assert.equal((await request("/blog/shared-draft/?key=" + token.slice(0, 42) + "x")).status, 404);
});
test("共有トークンは再作成・無効化でき、公開記事には作れない", async () => {
  const first = await share();
  const second = await share();
  assert.notEqual(first, second);
  assert.equal((await request("/blog/shared-draft/?key=" + first)).status, 404);
  assert.equal((await request("/blog/shared-draft/?key=" + second)).status, 200);
  const { cookie, csrf } = await session();
  const revoke = await request("/api/admin/posts/" + ID + "/share", {
    method: "DELETE",
    body: {},
    cookie: cookie.split(";")[0],
    csrf,
    admin: await adminToken(),
  });
  assert.equal(revoke.status, 200);
  assert.equal((await request("/blog/shared-draft/?key=" + second)).status, 404);
  db.prepare("UPDATE posts SET status='published',published_at=1 WHERE id=?").run(ID);
  assert.equal((await request("/blog/shared-draft/")).status, 200);
  assert.equal((await request("/api/admin/posts/" + ID + "/share", {
    method: "POST",
    body: {},
    cookie: cookie.split(";")[0],
    csrf,
    admin: await adminToken(),
  })).status, 404);
});
test("共有した下書き記事の写真と本文画像はキー付きで取得できる", async () => {
  db.prepare("UPDATE posts SET photo=?,body=? WHERE id=?").run(
    PHOTO,
    "![写真](/media/" + PHOTO + ")",
    ID,
  );
  const token = await share();
  assert.equal((await request("/media/" + PHOTO)).status, 404);
  assert.equal((await request("/media/" + PHOTO + "?key=" + token)).status, 200);
  const html = await (await request("/blog/shared-draft/?key=" + token)).text();
  assert.match(html, new RegExp('src="/media/' + PHOTO + '\\?key=' + token + '"'));
  assert.match(html, new RegExp('/media/' + PHOTO + '\\?key=' + token));
  assert.match(html, new RegExp('content="' + origin + '/media/' + PHOTO + '\\?key=' + token + '"'));
});
