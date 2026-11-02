import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { page, diary } from "../worker/pages.mjs";

const template = await readFile("blog/index.html", "utf8");
const styles = await Promise.all(["css/style.css", "css/blog.css", "blog-ui/blog.css"].map(p => readFile(p, "utf8")));
let updated = false;
const requests = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.endsWith(".css")) {
    requests.push(url.pathname + url.search);
    const index = ["/css/style.css", "/css/blog.css", "/blog-ui/blog.css"].indexOf(url.pathname);
    res.writeHead(200, { "Content-Type": "text/css", "Cache-Control": "public, max-age=14400" });
    res.end(index === 2 && !updated ? "/* old-cache */ .diary-copy{max-width:32rem}" : styles[index] || "");
  } else {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end('<link rel="stylesheet" href="/blog-ui/blog.css"><button>preview</button>');
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const editor = await browser.newPage();
  await editor.goto(origin + "/editor/");
  updated = true;
  assert.ok(await editor.evaluate(async () => (await (await fetch("/blog-ui/blog.css")).text()).includes("old-cache")));
  const html = await (await page({ SITE_ORIGIN: origin, ASSETS: { fetch: async () => new Response(template) } }, new Request(origin + "/api/admin/preview"), diary({ id: "fixture", entry_date: "2026-11-02", body: "本文", music: "https://example.com/song", song: "曲名" }, [], true), { preview: true })).text();
  const opened = editor.waitForEvent("popup");
  await editor.evaluate(html => { const popup = window.open("", "_blank"); popup.opener = null; popup.document.open(); popup.document.write(html); popup.document.close(); }, html);
  const popup = await opened;
  await popup.waitForFunction(() => document.querySelector(".diary-copy") && getComputedStyle(document.querySelector(".diary-copy")).maxWidth === "none");
  assert.ok(requests.some(url => url.startsWith("/blog-ui/blog.css?preview=")));
  assert.equal(await popup.locator(".diary-date .music-link").textContent(), "♫ 曲名↗");
  await popup.screenshot({ path: ".local/review/preview-old-cache-fixed.png", fullPage: true });
  console.log("PASS: cached old CSS stays cached; real popup preview requests fresh CSS and applies updated diary layout");
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
