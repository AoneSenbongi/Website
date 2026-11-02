import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:4202";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base + "/__preview/");
  await page.getByRole("button", { name: "管理画面を試す" }).click();
  await page.waitForURL("**/admin/");
  await page.waitForFunction(() => !document.querySelector("#preview").disabled);
  const posts = () => page.evaluate(async () => (await fetch("/api/admin/posts")).json());
  async function preview(heading) {
    const opened = context.waitForEvent("page");
    await page.locator("#preview").click();
    const popup = await opened;
    await popup.waitForFunction(() => document.querySelector("h2")?.textContent === "入力中の見出し");
    assert.equal(await popup.locator("strong").textContent(), heading);
    await popup.waitForFunction(() => document.styleSheets.length > 0);
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.ok(await popup.evaluate(() => [...document.styleSheets].some(s => s.href?.endsWith("/blog-ui/blog.css"))));
    await popup.close();
    await page.waitForFunction(() => !document.querySelector("#preview").disabled);
  }
  for (const kind of ["blog", "diary"]) {
    await page.locator(`[data-tab=${kind}]`).click();
    assert.equal(await page.locator("#preview").isEnabled(), true);
    if (kind === "blog") await page.locator("[name=title]").fill("未保存プレビュー");
    await page.locator("[name=body]").fill("## 入力中の見出し\n\n**保存前**");
    const before = await posts();
    await preview("保存前");
    assert.deepEqual(await posts(), before);
    await page.locator("[name=body]").fill("## 入力中の見出し\n\n**入力を変更**");
    await preview("入力を変更");
    assert.deepEqual(await posts(), before);
    // Clear edits before switching tabs; no draft is saved by this check.
    page.once("dialog", d => d.accept());
    console.log(`PASS ${kind}: unsaved preview enabled, current Markdown, styles, opener isolation, no database change`);
  }
} finally { await browser.close(); }
