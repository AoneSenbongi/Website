import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.BLOG_PREVIEW_ORIGIN || "http://127.0.0.1:4202";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base + "/__preview/");
  await page.getByRole("button", { name: "管理画面を試す" }).click();
  await page.waitForURL("**/admin/");
  await page.waitForFunction(() => !document.querySelector("#preview").disabled);
  const posts = () => page.evaluate(async () => (await fetch("/api/admin/posts")).json());
  async function preview(heading, kind) {
    const opened = context.waitForEvent("page");
    await page.locator("#preview").click();
    const popup = await opened;
    await popup.waitForFunction(() => document.querySelector("h2")?.textContent === "入力中の見出し");
    assert.equal(await popup.locator("strong").textContent(), heading);
    await popup.waitForFunction(() => document.styleSheets.length > 0);
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.ok(await popup.evaluate(() => [...document.styleSheets].some(s => s.href && new URL(s.href).pathname === "/blog-ui/blog.css" && new URL(s.href).searchParams.has("preview"))));
    if (kind === "diary") {
      for (const width of [1280, 390]) {
        await popup.setViewportSize({width, height:844});
        const sizes = await popup.evaluate(() => {
          const leaf=document.querySelector('.diary-leaf'),css=getComputedStyle(leaf);
          const date=document.querySelector('.diary-date time').getBoundingClientRect(),music=document.querySelector('.music-link').getBoundingClientRect();
          return {available:leaf.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),text:document.querySelector('.diary-words').getBoundingClientRect().width,date:date.toJSON(),music:music.toJSON()};
        });
        assert.ok(sizes.text >= sizes.available-2, JSON.stringify(sizes));
        assert.ok(sizes.music.left > sizes.date.right && Math.abs(sizes.music.top-sizes.date.top)<8, JSON.stringify(sizes));
        assert.ok(await popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await popup.screenshot({path:`.local/review/unsaved-diary-preview-${width}.png`,fullPage:true});
      }
    }
    await popup.close();
    await page.waitForFunction(() => !document.querySelector("#preview").disabled);
  }
  for (const kind of ["blog", "diary"]) {
    await page.locator(`[data-tab=${kind}]`).click();
    assert.equal(await page.locator("#preview").isEnabled(), true);
    if (kind === "blog") await page.locator("[name=title]").fill("未保存プレビュー");
    if (kind === "diary") {
      await page.locator('#music-fields').evaluate(e=>e.open=true);
      await page.locator('[name=music]').fill('https://example.com/song');
      await page.locator('[name=song]').fill('曲名');
    }
    await page.locator("[name=body]").fill("## 入力中の見出し\n\n**保存前**");
    const before = await posts();
    await preview("保存前", kind);
    assert.deepEqual(await posts(), before);
    await page.locator("[name=body]").fill("## 入力中の見出し\n\n**入力を変更**");
    await preview("入力を変更", kind);
    assert.deepEqual(await posts(), before);
    // Clear edits before switching tabs; no draft is saved by this check.
    page.once("dialog", d => d.accept());
    console.log(`PASS ${kind}: unsaved preview enabled, current Markdown, styles, opener isolation, no database change`);
  }
} finally { await browser.close(); }
