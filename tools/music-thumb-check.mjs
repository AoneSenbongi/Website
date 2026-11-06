import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { diary } from "../worker/pages.mjs";

const styles = await Promise.all(["css/style.css", "blog-ui/blog.css"].map(p => readFile(p, "utf8")));
const music = "https://youtu.be/CS2GKwW_2dI?si=fixture";
const entry = { id: "fixture", slug: "fixture", entry_date: "2026-11-06", body: "音楽つきの日記です。写真は付けていません。", music, song: "テストの曲" };
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir(".local/review", { recursive: true });
try {
  for (const width of [1280, 390]) {
    await browser.contexts().length && await browser.contexts()[0].close();
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.setContent(`<style>${styles.join("\n")}</style>${diary(entry, [], true)}`);
    await page.waitForLoadState("networkidle");
    const result = await page.evaluate(() => {
      const leaf = document.querySelector(".diary-leaf");
      const img = document.querySelector(".diary-music-thumb");
      const copy = document.querySelector(".diary-copy");
      return {
        classes: leaf.className,
        natural: img?.naturalWidth,
        covers: img && leaf.getBoundingClientRect().height - img.getBoundingClientRect().height < 1,
        color: getComputedStyle(leaf).color,
        scrim: getComputedStyle(copy).backgroundColor,
        overflow: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    assert.equal(result.classes, "diary-leaf has-photo has-music-thumb", result.classes);
    assert.ok(result.natural > 0, "thumbnail did not load: " + result.natural);
    assert.ok(result.covers, "thumbnail does not cover the leaf");
    assert.equal(result.color, "rgb(255, 255, 255)");
    assert.equal(result.scrim, "rgba(0, 0, 0, 0.65)");
    assert.ok(result.overflow);
    await page.screenshot({ path: `.local/review/music-thumb-${width}.png`, fullPage: true });
    console.log(`PASS ${width}px: thumbnail covers the leaf; copy uses the photo presentation`);
    // 写真なし・音楽なしは従来どおり
    await page.setContent(`<style>${styles.join("\n")}</style>${diary({ ...entry, music: null, song: null }, [], true)}`);
    assert.equal(await page.locator(".diary-music-thumb").count(), 0);
    assert.equal(await page.locator(".diary-leaf.has-photo").count(), 0);
    console.log(`PASS ${width}px: diary without music keeps the plain layout`);
    // 音楽なし・写真ありは従来どおり
    await page.setContent(`<style>${styles.join("\n")}</style>${diary({ ...entry, music: null, song: null, photo: "fixture.jpg" }, [], true)}`);
    assert.equal(await page.locator(".diary-music-thumb").count(), 0);
    assert.equal(await page.locator("img.diary-background").getAttribute("src"), "/media/fixture.jpg");
    console.log(`PASS ${width}px: photo diaries are unchanged`);
    await page.close();
  }
  // 本番と同じCSPのimg-srcで外部サムネイルが読み込めること
  const page = await browser.newPage();
  const violations = [];
  page.on("console", m => m.type() === "error" && violations.push(m.text()));
  await page.setContent(`<meta http-equiv="Content-Security-Policy" content="img-src 'self' data: https://i.ytimg.com"><img id="t" src="${musicThumbSrc(entry.music)}" alt="">`);
  await page.waitForLoadState("networkidle");
  assert.ok(await page.evaluate(() => document.getElementById("t").naturalWidth > 0), "thumbnail blocked by CSP");
  assert.deepEqual(violations.filter(t => /Content Security Policy|img-src/i.test(t)), []);
  console.log("PASS CSP img-src https://i.ytimg.com loads the thumbnail without violations");
} finally {
  await browser.close();
}
function musicThumbSrc(u) {
  const id = new URL(u).pathname.slice(1);
  return "https://i.ytimg.com/vi/" + id + "/hq720.jpg";
}
