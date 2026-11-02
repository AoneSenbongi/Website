import { chromium } from "playwright";
import assert from "node:assert/strict";

const base = process.env.BLOG_PREVIEW_URL || "http://127.0.0.1:4198";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error("Local checks only");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const owner = await browser.newContext();
  const reader = await browser.newContext();
  const page = await owner.newPage();
  const dialogs = [];
  page.on("dialog", async d => { dialogs.push(d.message()); await d.dismiss(); });
  await page.goto(base + "/__preview/");
  await page.getByRole("button", { name: "管理画面を試す" }).click();
  await page.waitForURL("**/admin/");
  const suffix = Date.now();
  const diaryDate = `${2100 + suffix % 7000}-12-30`;
  for (const kind of ["blog", "diary"]) {
    await page.locator(`[data-tab=${kind}]`).click();
    const url = kind === "blog" ? `/blog/one-click-${suffix}/` : `/diary/${diaryDate}/`;
    if (kind === "blog") {
      await page.locator("[name=title]").fill("公開動作確認");
      await page.locator(".url-setting summary").click();
      await page.locator("[name=slug]").fill(`one-click-${suffix}`);
    } else await page.locator("[name=date]").fill(diaryDate);
    await page.locator("[name=body]").fill("保存中の本文");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#save-notice").textContent === "保存しました。");
    assert.equal((await reader.request.get(base + url)).status(), 404);
    await page.locator("[name=body]").fill("未保存の編集も公開");
    await page.getByRole("button", { name: "公開", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#save-notice").textContent === "公開しました。", undefined, { timeout: 4000 });
    assert.deepEqual(dialogs, []);
    let response = await reader.request.get(base + url);
    assert.equal(response.status(), 200);
    assert.ok((await response.text()).includes("未保存の編集も公開"));
    await page.locator("[name=body]").fill("公開後の更新");
    await page.getByRole("button", { name: "公開", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#save-notice").textContent === "公開しました。");
    response = await reader.request.get(base + url);
    assert.ok((await response.text()).includes("公開後の更新"));
    assert.deepEqual(dialogs, []);
    console.log(`PASS ${kind}: private draft, one-click publish with unsaved edits, update, anonymous reading`);
  }
} finally { await browser.close(); }
