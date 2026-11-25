import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = "http://127.0.0.1:4207";
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir(".local/review", { recursive: true });
const body = "平均は \\alpha + \\beta です。\\frac{1}{2} と \\sqrt{x^2} を使います。\\* はエスケープのまま。";
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(base + "/__preview/");
  await page.getByRole("button", { name: "管理画面を試す" }).click();
  await page.waitForURL("**/admin/");
  await page.locator("[name=title]").fill("LaTeXの表示例");
  const slug = await page.locator("[name=slug]").inputValue();
  await page.locator("[name=body]").fill(body);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#save-notice").textContent === "保存しました。");
  const popupPromise = context.waitForEvent("page");
  await page.locator("#preview").click();
  const preview = await popupPromise;
  await preview.waitForLoadState();
  assert.ok((await preview.locator(".article-body .katex").count()) >= 3);
  const text = await preview.locator(".article-body").innerText();
  assert.ok(text.includes("です。"));
  assert.ok(text.includes("はエスケープのまま。"));
  const css = await preview.evaluate(async () => {
    const link = [...document.querySelectorAll("link[rel=stylesheet]")].find((l) => l.href.includes("/katex/"));
    return link ? { status: (await fetch(link.href)).status, href: link.href } : null;
  });
  assert.ok(css && css.status === 200, "KaTeX CSS is served");
  assert.ok(await preview.evaluate(() => getComputedStyle(document.querySelector(".katex")).fontFamily.includes("KaTeX")));
  assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await preview.screenshot({ path: ".local/review/latex-desktop.png", fullPage: true });
  await preview.setViewportSize({ width: 390, height: 844 });
  assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await preview.screenshot({ path: ".local/review/latex-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "公開", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#save-notice").textContent === "公開しました。");
  const reader = await browser.newContext();
  const publicPage = await reader.newPage();
  await publicPage.goto(base + "/blog/" + slug + "/");
  assert.equal(await publicPage.locator(".article-body").innerHTML(), await preview.locator(".article-body").innerHTML());
  console.log("PASS LaTeX inline math in preview and public pages, KaTeX CSS/font, mobile width");
} finally { await browser.close(); }
