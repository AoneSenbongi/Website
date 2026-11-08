import "./build.mjs";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createLocalJWKSet, generateKeyPair, exportJWK, SignJWT } from "jose";
import { createApp } from "../worker/index.mjs";
import { d1 } from "./sqlite.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)),
  port = Number(process.env.BLOG_PREVIEW_PORT || 4196),
  origin = "http://127.0.0.1:" + port;
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid local port");
const store = path.join(root, ".local", process.env.BLOG_PREVIEW_ISOLATED === "1" ? "publish-check" : "");
await mkdir(path.join(store, "photos"), { recursive: true });
const sqlite = new DatabaseSync(path.join(store, "blog.sqlite"));
sqlite.exec("PRAGMA foreign_keys=ON");
if (
  !sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='posts'")
    .get()
)
  sqlite.exec(
    readFileSync(path.join(root, "migrations/0001_blog.sql"), "utf8"),
  );
if (
  !sqlite
    .prepare("PRAGMA table_info(posts)")
    .all()
    .some((column) => column.name === "kind")
) {
  const backup = path.join(store, "before-diary-migration.sqlite");
  if (!existsSync(backup)) sqlite.prepare("VACUUM INTO ?").run(backup);
  sqlite.exec(
    readFileSync(path.join(root, "migrations/0002_diary.sql"), "utf8"),
  );
}
if (
  !sqlite
    .prepare("PRAGMA table_info(posts)")
    .all()
    .some((column) => column.name === "share_token")
) {
  const backup = path.join(store, "before-share-migration.sqlite");
  if (!existsSync(backup)) sqlite.prepare("VACUUM INTO ?").run(backup);
  sqlite.exec(
    readFileSync(path.join(root, "migrations/0003_share.sql"), "utf8"),
  );
}
const secretPath = path.join(store, "secrets.json");
if (!existsSync(secretPath))
  await writeFile(
    secretPath,
    JSON.stringify({
      session: crypto.randomUUID() + crypto.randomUUID(),
      mail: crypto.randomUUID() + crypto.randomUUID(),
    }),
  );
const secrets = JSON.parse(await readFile(secretPath, "utf8"));
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "preview" };
const mail = [];
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain",
};
const assets = {
  async fetch(request) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Not found", { status: 404 });
    }
    if (pathname.endsWith("/")) pathname += "index.html";
    if (!path.extname(pathname)) pathname += ".html";
    const file = path.resolve(root, "dist", "." + pathname),
      prefix = path.join(root, "dist") + path.sep;
    if (!file.startsWith(prefix))
      return new Response("Not found", { status: 404 });
    try {
      let content = await readFile(file);
      if (pathname === "/blog/index.html")
        content = Buffer.from(
          content
            .toString()
            .replace(
              "<body>",
              '<body><aside class="preview-flag"><a href="/__preview/">プレビュー</a></aside>',
            ),
        );
      return new Response(content, {
        headers: {
          "Content-Type":
            mime[path.extname(file)] || "application/octet-stream",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};
const env = {
  SITE_ORIGIN: origin,
  ACCESS_ISSUER: "https://local-preview.cloudflareaccess.com",
  ACCESS_AUD: "local-preview",
  ADMIN_EMAIL: "preview@localhost.invalid",
  SESSION_SECRET: secrets.session,
  MAIL_ENCRYPTION_KEY: secrets.mail,
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
  RESEND_API_KEY: "preview-only",
  MAIL_FROM: "Blog <preview@localhost.invalid>",
  DB: d1(sqlite),
  ASSETS: assets,
  PHOTOS: {
    async put(key, value, metadata) {
      if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(key))
        throw Error("Invalid key");
      await writeFile(path.join(store, "photos", key), value);
      await writeFile(
        path.join(store, "photos", key + ".json"),
        JSON.stringify(metadata),
      );
    },
    async get(key) {
      if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(key)) return null;
      try {
        return {
          body: await readFile(path.join(store, "photos", key)),
          httpMetadata: JSON.parse(
            await readFile(path.join(store, "photos", key + ".json"), "utf8"),
          ).httpMetadata,
        };
      } catch {
        return null;
      }
    },
  },
};
const app = createApp({
  keyResolver: createLocalJWKSet({ keys: [jwk] }),
  fetcher: async (url, options) => {
    if (url === "https://api.resend.com/emails") {
      mail.push(JSON.parse(options.body));
      return Response.json({ id: "local-" + mail.length });
    }
    const response = await fetch(url, options);
    // Official Turnstile test keys report "localhost" for local tests; only this local harness normalizes it.
    if (String(url).includes("/siteverify")) {
      const data = await response.json();
      if (data.success) {
        data.hostname = "127.0.0.1";
        data.action = "comment";
      }
      return Response.json(data, { status: response.status });
    }
    return response;
  },
});
const server = createServer(async (req, res) => {
  try {
    if (
      req.headers.host !== "127.0.0.1:" + port ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      res.writeHead(403);
      res.end("Local preview only");
      return;
    }
    const url = new URL(req.url, origin);
    if (url.pathname === "/__preview/" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
      });
      res.end(
        '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>プレビュー</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/blog-ui/blog.css"></head><body><main class="article-shell notification-shell"><p class="eyebrow">このPC内の試作</p><h1>プレビュー<span class="heading-dot">.</span></h1><nav class="journal-tabs"><a href="/blog/">Blog ↗</a><a href="/diary/">日記 ↗</a></nav><form method="post" action="/__preview/login"><button class="primary-button">管理画面を試す</button></form><details><summary>確認用メール</summary><p><a href="/__preview/outbox">受信箱を開く ↗</a></p></details></main></body></html>',
      );
      return;
    }
    if (url.pathname === "/__preview/login" && req.method === "POST") {
      if (req.headers.origin !== origin) {
        res.writeHead(403);
        res.end();
        return;
      }
      const token = await new SignJWT({ email: env.ADMIN_EMAIL })
        .setSubject("local-preview")
        .setProtectedHeader({ alg: "RS256", kid: "preview" })
        .setIssuer(env.ACCESS_ISSUER)
        .setAudience(env.ACCESS_AUD)
        .setIssuedAt()
        .setExpirationTime("2h")
        .sign(privateKey);
      res.writeHead(303, {
        Location: "/admin/",
        "Set-Cookie": `preview_admin=${token}; Path=/; HttpOnly; SameSite=Strict`,
      });
      res.end();
      return;
    }
    if (url.pathname === "/__preview/outbox" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(mail, null, 2));
      return;
    }
    if (url.pathname === "/cdn-cgi/access/logout") {
      res.writeHead(303, {
        Location: "/__preview/",
        "Set-Cookie": "preview_admin=; Path=/; Max-Age=0",
      });
      res.end();
      return;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers))
      if (value && key !== "cf-access-jwt-assertion")
        headers.set(key, Array.isArray(value) ? value.join(",") : value);
    headers.set("cf-connecting-ip", "127.0.0.1");
    const jwt = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("preview_admin="))
      ?.slice(14);
    if (jwt) headers.set("cf-access-jwt-assertion", jwt);
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 6 * 1024 * 1024) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method)
        ? undefined
        : Buffer.concat(chunks),
    });
    const result = await app.fetch(request, env, {});
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("Preview error");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log("Local preview: " + origin + "/__preview/ (mail stays local)"),
);
const timer = setInterval(
  () =>
    app
      .scheduled({}, env, {})
      .catch(() => console.error("Preview background task failed")),
  10000,
);
timer.unref();
