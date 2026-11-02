import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:4196",
  date = process.env.DIARY_TEST_DATE || "2026-10-21";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const owner = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  reader = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const admin = await owner.newPage(),
  page = await reader.newPage();
const errors = [];
for (const p of [admin, page]) p.on("pageerror", (e) => errors.push(e.message));
await mkdir(".local/review", { recursive: true });
try {
  await admin.goto(base + "/__preview/");
  await admin.getByRole("button", { name: "管理画面を試す" }).click();
  await admin.waitForURL("**/admin/");
  await admin.locator("[data-tab=diary]").click();
  await admin.locator("[name=date]").fill(date);
  await admin
    .locator("[name=body]")
    .fill("日記の表示例です。\n\n文章と写真、音楽をひとつのページに。");
  await admin.locator("#photo").setInputFiles("images/hero.jpg");
  await admin.waitForFunction(
    () => !document.querySelector("#photo-preview").hidden,
  );
  await admin.locator("#music-fields summary").click();
  await admin.locator("[name=music]").fill("https://www.youtube.com/");
  await admin.locator("[name=song]").fill("今日の音楽");
  await admin.getByRole("button", { name: "保存", exact: true }).click();
  await admin.waitForFunction(
    () =>
      document.querySelector("#save-notice").textContent === "保存しました。",
  );
  assert.equal(
    (await page.request.get(base + "/diary/" + date + "/")).status(),
    404,
  );
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "公開", exact: true }).click();
  await admin.waitForFunction(
    () =>
      document.querySelector("#save-notice").textContent === "公開しました。",
  );
  console.log("PASS diary create, photo, music, private draft and publish");
  await page.goto(base + "/diary/" + date + "/");
  await page.waitForFunction(() => !document.querySelector("#like").disabled);
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
  assert.ok(
    (await page.locator(".diary-words").textContent()).includes("日記の表示例"),
  );
  console.log("PASS diary display and persistent like");
  const ownerPage = await owner.newPage();
  ownerPage.on("pageerror", (e) => errors.push(e.message));
  await ownerPage.goto(base + "/diary/" + date + "/");
  await ownerPage.locator("#comment-composer>summary").click();
  await ownerPage.waitForFunction(
    () => !document.querySelector("#comment-form button[type=submit]").disabled,
  );
  assert.equal(await ownerPage.locator("#owner-identity").isVisible(), true);
  assert.equal(await ownerPage.locator("#name-label").isVisible(), false);
  await ownerPage
    .locator("[name=body]")
    .fill("日記にもコメントできるようになりました。");
  await ownerPage.getByRole("button", { name: "送信", exact: true }).click();
  await ownerPage.waitForFunction(() =>
    document
      .querySelector("#comments")
      .textContent.includes("日記にもコメント"),
  );
  assert.equal(await ownerPage.locator("#comments .author-badge").count(), 1);
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector("#comments .author-badge"),
  );
  assert.equal(
    await page.locator("#comments .author-badge").textContent(),
    "本人",
  );
  await page.locator("#comment-composer>summary").click();
  assert.equal(await page.locator("#name-label").isVisible(), true);
  console.log("PASS authenticated owner comment and public author badge");
  await page.screenshot({
    path: ".local/review/diary-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: ".local/review/diary-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await admin.evaluate(() => scrollTo(0, 0));
  await admin.screenshot({
    path: ".local/review/editor-diary-desktop.png",
    fullPage: true,
  });
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.screenshot({
    path: ".local/review/editor-diary-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator(".theme-toggle").click();
  await page.screenshot({
    path: ".local/review/diary-dark-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/review/diary-result.json",
    JSON.stringify(
      {
        passed: true,
        date,
        checks: [
          "create",
          "photo",
          "music",
          "private draft",
          "publish",
          "likes",
          "owner comment",
          "owner badge",
          "desktop/mobile",
          "dark mode",
        ],
        errors,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("PASS diary responsive layout, dark mode and no JS errors");
} finally {
  await browser.close();
}
