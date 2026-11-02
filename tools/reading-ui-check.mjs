import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { turnstileTransport } from "./browser-network.mjs";

const base = "http://127.0.0.1:4196";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const checks = [],
  errors = [];
await mkdir(".local/review", { recursive: true });
try {
  for (const [name, path] of [
    ["diary", "/diary/"],
    ["article", "/blog/local-review-1792631459677/"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await turnstileTransport(context);
    const page = await context.newPage();
    let challenges = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/turnstile/v0/api.js")) challenges++;
    });
    await page.goto(base + path, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.querySelector("#like").disabled);
    assert.equal(await page.locator("#comment-form").isVisible(), false);
    assert.equal(challenges, 0);
    if (name === "diary") {
      assert.equal(
        await page.locator(".diary-heading .heading-dot").count(),
        0,
      );
      assert.equal(await page.locator(".diary-date time").count(), 1);
      assert.equal(await page.locator(".diary-archive").count(), 0);
      assert.equal(
        await page
          .locator(".diary-leaf")
          .evaluate((node) => getComputedStyle(node, "::before").content),
        "none",
      );
      assert.ok(
        await page
          .locator(".diary-background")
          .evaluate((img) => img.complete && img.naturalWidth > 0),
      );
    }
    await page.screenshot({
      path: ".local/review/" + name + "-reading-desktop.png",
      fullPage: true,
    });
    await page.locator(".comment-reply").first().click();
    assert.equal(await page.locator("#comment-form").isVisible(), true);
    await page.waitForFunction(
      () =>
        !document.querySelector("#comment-form button[type=submit]").disabled,
    );
    assert.equal(
      await page
        .locator("#comment-form [name=body]")
        .evaluate((node) => document.activeElement === node),
      true,
    );
    assert.equal(challenges, 1);
    await page
      .locator("#comment-form [name=body]")
      .fill("折りたたんでも本文を保持");
    await page.locator("#cancel-reply").click();
    assert.equal(await page.locator("#reply-label").isVisible(), false);
    assert.equal(await page.locator("[name=parentId]").inputValue(), "");
    await page.locator("#comment-composer>summary").click();
    await page.locator("#comment-composer>summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#comment-form").isVisible(), true);
    assert.equal(
      await page.locator("#comment-form [name=body]").inputValue(),
      "折りたたんでも本文を保持",
    );
    assert.equal(challenges, 1);
    await page.locator("#comment-composer>summary").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: ".local/review/" + name + "-reading-mobile.png",
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.locator(".theme-toggle").click();
    await page.screenshot({
      path: ".local/review/" + name + "-reading-dark-mobile.png",
      fullPage: true,
    });
    checks.push(
      name +
        ": collapsed form, lazy challenge, reply focus, keyboard, text retention, mobile/dark",
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/review/reading-result.json",
    JSON.stringify(
      { passed: true, checks, errors, verifiedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(checks.join("\n"));
} finally {
  await browser.close();
}
