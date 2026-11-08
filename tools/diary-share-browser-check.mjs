import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.BLOG_PREVIEW_URL || "http://127.0.0.1:4206";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Browser checks are local only");
const output = path.join(root, ".local", "review");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const owner = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
  reader = await browser.newContext({ viewport: { width: 390, height: 844 } });
const admin = await owner.newPage(),
  page = await reader.newPage();
const errors = [];
for (const p of [admin, page]) p.on("pageerror", (e) => errors.push(e.message));
let failed = false;
try {
  await admin.goto(base + "/__preview/");
  await admin.getByRole("button", { name: "管理画面を試す" }).click();
  await admin.waitForURL("**/admin/");

  // 非公開の日記を用意する（再実行時は既存を選ぶ）
  await admin.locator('[data-tab="diary"]').click();
  const existing = admin.locator("#posts .admin-row").filter({ hasText: "2025-11-03" });
  if (await existing.count()) {
    await existing.first().click();
  } else {
    await admin.locator("[name=date]").fill("2025-11-03");
    await admin.locator("[name=body]").fill("共有リンク確認用の非公開日記です。");
    await admin.getByRole("button", { name: "保存", exact: true }).click();
    await admin.waitForFunction(
      () => document.querySelector("#save-notice").textContent === "保存しました。",
    );
  }
  assert.equal(await admin.locator("#share-fields").isVisible(), true);

  // キーなしのURLは閲覧できない
  assert.equal((await page.request.get(base + "/diary/2025-11-03/")).status(), 404);

  // 共有リンクを作成する（再実行時は既存のリンクを使う）
  if (await admin.locator("#share-create").isVisible()) {
    await admin.locator("#share-fields").scrollIntoViewIfNeeded();
    await admin.screenshot({ path: path.join(output, "diary-share-create.png") });
    await admin.locator("#share-create").click();
  }
  await admin.waitForFunction(() => {
    const a = document.querySelector("#share-url");
    return !document.querySelector("#share-active").hidden && /\?key=[\w-]{43}$/.test(a.href);
  });
  const shareUrl = await admin.locator("#share-url").getAttribute("href");
  await admin.locator("#share-fields").scrollIntoViewIfNeeded();
  await admin.screenshot({ path: path.join(output, "diary-share-admin.png") });

  // 共有リンクでは閲覧でき、noindexで単票表示になる
  const shared = await page.goto(shareUrl);
  assert.equal(shared.status(), 200);
  assert.match(await page.locator(".diary-words").textContent(), /共有リンク確認用の非公開日記です。/);
  assert.equal(await page.locator('meta[name="robots"]').count(), 1);
  assert.equal(await page.locator("#comment-composer").count(), 0);
  assert.equal(await page.locator(".diary-navigation").count(), 0);
  await page.screenshot({ path: path.join(output, "diary-share-390.png"), fullPage: true });

  // 画像を添えて保存すると、共有表示でも同じキーで写真が読める
  await admin.locator("#photo").setInputFiles(path.join(root, "images", "profile-photo.jpg"));
  await admin.waitForFunction(() => !document.querySelector("#photo-preview").hidden);
  await admin.getByRole("button", { name: "保存", exact: true }).click();
  await admin.waitForFunction(
    () => document.querySelector("#save-notice").textContent === "保存しました。",
  );
  assert.equal((await page.goto(shareUrl)).status(), 200);
  await page.waitForFunction(() => {
    const img = document.querySelector(".diary-background");
    return img && img.complete && img.naturalWidth > 0 && img.src.includes("?key=");
  });
  await page.screenshot({ path: path.join(output, "diary-share-photo-390.png"), fullPage: true });

  // 無効化すると同じURLは開けなくなる
  admin.once("dialog", (d) => d.accept());
  await admin.locator("#share-revoke").click();
  await admin.waitForFunction(
    () => document.querySelector("#save-notice").textContent === "共有リンクを無効にしました。",
  );
  assert.equal(await admin.locator("#share-create").isVisible(), true);
  assert.equal((await page.request.get(shareUrl)).status(), 404);

  // 再作成したリンクは別トークンになる
  await admin.locator("#share-create").click();
  await admin.waitForFunction(() => {
    const a = document.querySelector("#share-url");
    return !document.querySelector("#share-active").hidden && /\?key=[\w-]{43}$/.test(a.href);
  });
  const second = await admin.locator("#share-url").getAttribute("href");
  assert.notEqual(second, shareUrl);
  assert.equal((await page.request.get(second)).status(), 200);
  assert.equal((await page.request.get(shareUrl)).status(), 404);
} catch (e) {
  failed = true;
  console.error("FAIL:", e.message);
  await admin.screenshot({ path: path.join(output, "diary-share-failure.png") }).catch(() => {});
} finally {
  assert.deepEqual(errors, []);
  await browser.close();
}
console.log(failed || errors.length ? "FAIL" : "PASS: diary share link flow");
process.exit(failed || errors.length ? 1 : 0);
