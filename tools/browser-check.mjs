import { chromium } from "playwright";
import { turnstileTransport } from "./browser-network.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.BLOG_PREVIEW_URL || "http://127.0.0.1:4196";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Browser checks are local only");
const output = path.join(root, ".local", "review");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const owner = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  reader = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
await turnstileTransport(reader);
const admin = await owner.newPage(),
  page = await reader.newPage();
const errors = [];
for (const p of [admin, page]) p.on("pageerror", (e) => errors.push(e.message));
const slug = "local-review-" + Date.now();
const readerName = "確認の読者 " + slug.slice(-8);
let failed = false;
async function report(step) {
  console.log(step);
}
async function request(p, url, method, body) {
  return p.evaluate(
    async ({ url, method, body }) => {
      const s = await (await fetch("/api/blog/session")).json();
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": s.csrf },
        body: JSON.stringify(body),
      });
      return { status: r.status, data: await r.json() };
    },
    { url, method, body },
  );
}
try {
  await page.goto(base + "/admin/");
  assert.equal(
    (await page.request.get(base + "/api/admin/posts")).status(),
    401,
  );
  await report("PASS: anonymous admin access denied");
  await admin.goto(base + "/__preview/");
  await admin.getByRole("button", { name: "管理画面を試す" }).click();
  await admin.waitForURL("**/admin/");
  await admin.locator("[name=title]").fill("Blogの投稿・交流機能の確認");
  await admin.locator(".url-setting summary").click();
  await admin.locator("[name=slug]").fill(slug);
  await admin
    .locator("[name=body]")
    .fill(
      "このPCだけで表示する動作確認用の記事です。\n\nいいね、コメント、返信通知と写真の表示を確認しています。\n<script>window.untrustedExecuted=true</script>",
    );
  await admin
    .locator("#photo")
    .setInputFiles(path.join(root, "images", "profile-photo.jpg"));
  await admin.waitForFunction(
    () => !document.querySelector("#photo-preview").hidden,
  );
  await admin.getByRole("button", { name: "保存", exact: true }).click();
  await admin.waitForFunction(
    () =>
      document.querySelector("#save-notice").textContent === "保存しました。",
  );
  assert.equal(
    (await page.request.get(base + "/blog/" + slug + "/")).status(),
    404,
  );
  await report("PASS: authenticated draft save and private draft");
  const popupPromise = admin.waitForEvent("popup");
  await admin.getByRole("button", { name: "プレビュー ↗" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.ok(await popup.getByText("下書きプレビュー").count());
  assert.equal(await popup.evaluate(() => !!window.untrustedExecuted), false);
  await popup.close();
  await admin.getByRole("button", { name: "公開", exact: true }).click();
  await admin.waitForFunction(
    () =>
      document.querySelector("#save-notice").textContent === "公開しました。",
  );
  await page.goto(base + "/blog/" + slug + "/");
  await page.waitForFunction(() => !document.querySelector("#like").disabled);
  assert.equal(await page.evaluate(() => !!window.untrustedExecuted), false);
  assert.ok(
    await page.locator(".article-body img").evaluate((n) => n.naturalWidth > 0),
  );
  await page.locator("#like").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#like").getAttribute("aria-pressed") === "true",
  );
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector("#like").getAttribute("aria-pressed") === "true",
  );
  await report("PASS: publish, photo, HTML escaping and persistent like");
  await page.locator("#comment-composer>summary").click();
  await page.locator("[name=name]").fill(readerName);
  await page
    .locator("[name=body]")
    .fill(
      '返信通知の確認です。<img src=x onerror="window.untrustedExecuted=true">',
    );
  await page.locator("#email-label summary").click();
  await page
    .locator("[name=email]")
    .fill("reader+" + slug + "@example.invalid");
  await page.waitForFunction(
    () => !document.querySelector("#comment-form button[type=submit]").disabled,
    {},
    { timeout: 45000 },
  );
  await page.getByRole("button", { name: "送信" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#form-notice").textContent.includes("確認メール"),
    {},
    { timeout: 30000 },
  );
  await page.waitForFunction(() =>
    document.querySelector("#comments").textContent.includes("承認待ち"),
  );
  const outsider = await browser.newContext();
  const other = await outsider.newPage();
  await other.goto(base + "/blog/" + slug + "/");
  await other.waitForFunction(() => !document.querySelector("#like").disabled);
  assert.ok(
    !(await other.locator("#comments").innerText()).includes(readerName),
  );
  await outsider.close();
  await report(
    "PASS: comment with Turnstile, anonymous ownership and pending privacy",
  );
  const outbox = await (
    await admin.request.get(base + "/__preview/outbox")
  ).json();
  const confirmation = outbox.at(-1).text.match(/#confirm=([^\s]+)/)[1];
  const confirmPage = await reader.newPage();
  await confirmPage.goto(base + "/blog/notifications/#confirm=" + confirmation);
  await confirmPage.getByRole("button", { name: "通知を有効にする" }).click();
  await confirmPage.waitForFunction(
    () =>
      document.querySelector("#notice").textContent ===
      "返信通知を有効にしました。",
  );
  assert.equal(await confirmPage.evaluate(() => location.hash), "");
  await admin.reload();
  await admin.locator('[data-tab="comments"]').click();
  await admin.waitForFunction(
    (name) => document.querySelector("#moderation").textContent.includes(name),
    readerName,
  );
  const box = admin
    .locator("#moderation .comment")
    .filter({ hasText: readerName });
  await box.getByRole("button", { name: "承認する", exact: true }).click();
  await admin.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("更新しました"),
  );
  await admin.locator("#comment-filter").selectOption("all");
  const approved = admin
    .locator("#moderation .comment")
    .filter({ hasText: readerName });
  await approved
    .locator("textarea")
    .fill("コメントありがとうございます。これはローカルの返信確認です。");
  admin.once("dialog", (d) => d.accept());
  await approved.getByRole("button", { name: "返信を公開する" }).click();
  await admin.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("返信しました"),
  );
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector("#comments").textContent.includes("あなたへの返信"),
  );
  assert.equal(await page.evaluate(() => !!window.untrustedExecuted), false);
  await report(
    "PASS: email opt-in, approval, admin reply and browser reply recognition",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await admin.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(output, "article-desktop.png"),
    fullPage: true,
  });
  await admin.screenshot({
    path: path.join(output, "admin-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(output, "article-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.screenshot({
    path: path.join(output, "admin-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await report("PASS: desktop and 390px mobile layouts");
  const mailPromise = async () => {
    for (let i = 0; i < 15; i++) {
      const messages = await (
        await admin.request.get(base + "/__preview/outbox")
      ).json();
      const msg = messages.find(
        (m) =>
          m.subject === "Blogのコメントに返信がありました" &&
          m.text.includes(slug),
      );
      if (msg) return msg;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw Error("Reply mail not queued");
  };
  const replyMail = await mailPromise();
  const unsub = replyMail.text.match(/#unsubscribe=([^\s]+)/)[1];
  await confirmPage.goto(base + "/blog/notifications/#unsubscribe=" + unsub);
  await confirmPage.getByRole("button", { name: "通知を解除する" }).click();
  await confirmPage.waitForFunction(
    () =>
      document.querySelector("#notice").textContent ===
      "返信通知を解除しました。",
  );
  await report(
    "PASS: queued reply email and explicit unsubscribe (no external delivery)",
  );
  const before = (
    await (await admin.request.get(base + "/api/admin/posts")).json()
  ).find((p) => p.slug === slug);
  assert.ok(before);
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        passed: true,
        slug,
        url: base + "/blog/" + slug + "/",
        checks: 7,
        pageErrors: errors,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Review article: " + base + "/blog/" + slug + "/");
} catch (e) {
  failed = true;
  await writeFile(
    path.join(output, "failure.json"),
    JSON.stringify({ message: e.message, errors, slug }, null, 2),
  );
  await page
    .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  await browser.close();
  if (failed) process.exitCode = 1;
}
