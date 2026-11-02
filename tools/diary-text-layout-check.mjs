import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { diary } from "../worker/pages.mjs";

const styles = await Promise.all(["css/style.css", "blog-ui/blog.css"].map(p => readFile(p, "utf8")));
const entry = { id: "fixture", slug: "fixture", entry_date: "2026-11-02", body: "一行目\n二行目\n\n**太字**を含む日記の本文です。" + "文章は枠の幅に合わせて自然に折り返します。".repeat(12) };
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir(".local/review", { recursive: true });
try {
  const page = await browser.newPage();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(`<style>${styles.join("\n")}</style>${diary(entry, [], true)}`);
    const sizes = await page.evaluate(() => {
      const leaf = document.querySelector(".diary-leaf"), words = document.querySelector(".diary-words");
      const css = getComputedStyle(leaf);
      return { available: leaf.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight), text: words.getBoundingClientRect().width };
    });
    assert.ok(sizes.text >= sizes.available - 2, JSON.stringify(sizes));
    assert.equal(await page.locator(".diary-words br").count(), 1);
    assert.equal(await page.locator(".diary-words p").count(), 2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `.local/review/diary-text-width-${width}.png`, fullPage: true });
    console.log(`PASS ${width}px: text fills available width; manual breaks preserved`);
    await page.setContent(`<style>${styles.join("\n")}</style>${diary({ ...entry, photo: "fixture.png" }, [], true)}`);
    assert.ok(await page.locator(".diary-copy").evaluate(e => e.getBoundingClientRect().width <= 514));
  }
} finally {
  await browser.close();
}
