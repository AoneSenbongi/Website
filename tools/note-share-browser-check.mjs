import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = "http://127.0.0.1:4207";
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir(".local/review", { recursive: true });
const body = [
  "noteの埋め込みを確かめます。",
  '<iframe class="note-embed" src="https://note.com/embed/notes/n87f9ce040450" style="border: 0; display: block; max-width: 99%; width: 494px; padding: 0px; margin: 10px 0px; position: static; visibility: visible;" height="400"></iframe>',
  '<script async src="https://note.com/scripts/embed.js" charset="utf-8"></script>',
  "限定共有の下書き本文です。\\alpha_1",
].join("\n\n");
const mockNote = async (target, seen) => {
  await target.route("https://note.com/**", async (route) => {
    const url = route.request().url();
    seen.push(url);
    if (url.includes("/scripts/embed.js"))
      return route.fulfill({ status: 404, body: "" });
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body><p>note embed fixture</p></body></html>",
    });
  });
};
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await context.newPage();
  admin.on("dialog", (dialog) => dialog.accept());
  const violations = [];
  admin.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await admin.goto(base + "/__preview/");
  await admin.getByRole("button", { name: "管理画面を試す" }).click();
  await admin.waitForURL("**/admin/");
  await admin.locator("[name=title]").fill("note埋め込みと限定共有");
  await admin.locator(".url-setting summary").click();
  const slug = (await admin.locator("[name=slug]").inputValue()).replace(/^post-/, "note-");
  await admin.locator("[name=slug]").fill(slug);
  await admin.locator("[name=body]").fill(body);
  await admin.getByRole("button", { name: "保存", exact: true }).click();
  await admin.waitForFunction(() => document.querySelector("#save-notice").textContent === "保存しました。");

  const seen = [];
  await mockNote(context, seen);
  const popupPromise = context.waitForEvent("page");
  await admin.locator("#preview").click();
  const preview = await popupPromise;
  preview.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await preview.waitForLoadState();
  await preview.locator(".article-body iframe.note-embed").waitFor();
  assert.equal(await preview.locator(".article-body iframe.note-embed").count(), 1);
  const iframe = await preview.locator(".article-body iframe.note-embed").evaluate((el) => ({
    src: el.getAttribute("src"),
    height: el.style.height,
    width: Math.round(el.getBoundingClientRect().width),
  }));
  assert.equal(iframe.src, "https://note.com/embed/notes/n87f9ce040450");
  assert.equal(iframe.height, "400px");
  assert.ok(iframe.width > 300 && iframe.width <= 494, `iframe width: ${iframe.width}`);
  assert.ok(seen.some((url) => url.includes("/embed/notes/n87f9ce040450")));
  assert.ok(!seen.some((url) => url.includes("/scripts/embed.js")), "helper script is not requested");
  assert.ok(!(await preview.locator(".article-body").innerText()).includes("embed.js"));
  assert.equal(await preview.locator(".article-body .katex").count(), 1);
  assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await preview.screenshot({ path: ".local/review/note-share-preview-desktop.png", fullPage: true });
  await preview.setViewportSize({ width: 390, height: 844 });
  assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await preview.screenshot({ path: ".local/review/note-share-preview-mobile.png", fullPage: true });

  assert.ok(await admin.locator("#share-fields").isVisible());
  await admin.locator("#share-create").click();
  await admin.waitForFunction(() => !document.querySelector("#share-active").hidden);
  const shareUrl = await admin.locator("#share-url").getAttribute("href");
  assert.match(shareUrl, new RegExp("/blog/" + slug + "/\\?key=[\\w-]{43}$"));
  await admin.screenshot({ path: ".local/review/note-share-admin.png", fullPage: true });

  const reader = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const shared = await reader.newPage();
  const sharedSeen = [];
  shared.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await mockNote(shared, sharedSeen);
  const response = await shared.goto(shareUrl);
  assert.equal(response.status(), 200);
  await shared.locator(".article-body iframe.note-embed").waitFor();
  assert.equal(await shared.locator(".article-body iframe.note-embed").count(), 1);
  assert.ok(sharedSeen.some((url) => url.includes("/embed/notes/n87f9ce040450")));
  assert.ok(await shared.locator('meta[name="robots"][content="noindex"]').count());
  assert.equal(await shared.locator(".article-end").count(), 0);
  assert.equal(await shared.locator(".article-diary-link").count(), 0);
  assert.ok(!(await shared.content()).includes("blog-ui/article.js"));
  assert.ok((await shared.locator(".article-body").innerText()).includes("限定共有の下書き本文です。"));
  await shared.screenshot({ path: ".local/review/note-share-public.png", fullPage: true });
  await shared.setViewportSize({ width: 390, height: 844 });
  assert.ok(await shared.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  await admin.locator("#share-revoke").click();
  await admin.waitForFunction(() => !document.querySelector("#share-create").hidden);
  assert.equal((await shared.goto(shareUrl)).status(), 404);
  assert.deepEqual(violations, [], "no Content Security Policy violations");
  console.log("PASS note iframe preview/public rendering, Blog draft sharing, revocation, mobile width");
} finally {
  await browser.close();
}
