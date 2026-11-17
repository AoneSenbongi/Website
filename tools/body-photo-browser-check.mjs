import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:" + Number(process.env.BLOG_PREVIEW_PORT || 4196);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAVRc9ZkAAAAASUVORK5CYII=",
  "base64",
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir(".local/review", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [],
    failed = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    const url = m.location()?.url || "";
    if (m.type() === "error" && !/favicon/.test(url)) errors.push(m.text() + " @ " + url);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.status() + " " + r.url());
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(origin + "/__preview/");
  await page.getByRole("button", { name: "管理画面を試す" }).click();
  await page.waitForURL("**/admin/");
  await page.waitForSelector("#post-form");
  assert.ok((await page.locator("#posts .admin-row").count()) > 0, "posts load");
  assert.equal(await page.locator("#body-photo").count(), 1, "inline picker");

  const suffix = Date.now().toString().slice(-6);
  const slug = "body-photo-" + suffix;
  await page.fill('input[name="title"]', "本文写真テスト " + suffix);
  await page.locator(".url-setting summary").click();
  await page.fill('input[name="slug"]', slug);
  await page.fill(
    "textarea[name=body]",
    "前書きの段落です。\n\n後書きの段落です。",
  );
  // カーソルを「前書きの段落です。」の直後へ置く
  await page.evaluate(() => {
    const field = document.querySelector("textarea[name=body]");
    field.focus();
    field.setSelectionRange(9, 9);
    field.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.setInputFiles("#body-photo", {
    name: "sample shot.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.waitForFunction(
    () =>
      /!\[[^\]]*\]\(\/media\/[a-f0-9]{32}\.png\)/.test(
        document.querySelector("textarea[name=body]").value,
      ),
    null,
    { timeout: 15000 },
  );
  const body = await page.inputValue("textarea[name=body]");
  assert.match(
    body,
    /^前書きの段落です。\n\n!\[sample shot\]\(\/media\/[a-f0-9]{32}\.png\)\n\n後書きの段落です。$/,
    "inserted at the caret with blank lines: " + JSON.stringify(body),
  );
  const mediaPath = body.match(/\/media\/[a-f0-9]{32}\.png/)[0];

  // 冒頭・背景の登録写真は従来どおり選べる
  await page.setInputFiles("#photo", {
    name: "head.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.waitForFunction(() =>
    document.querySelector("#photo-preview").src.includes("/media/"),
  );
  assert.equal(await page.locator("#remove-photo").isVisible(), true);

  await page.click('button[name="action"][value="save"]');
  await page.waitForFunction(
    () => document.querySelector("#save-notice").textContent.includes("保存"),
    null,
    { timeout: 15000 },
  );
  await page.locator("#posts .admin-row").first().click();
  await page.waitForFunction(
    () => document.querySelector("#save-notice").textContent === "",
  );
  assert.match(
    await page.inputValue("textarea[name=body]"),
    /!\[sample shot\]\(\/media\/[a-f0-9]{32}\.png\)/,
    "reopened post keeps the inserted image",
  );

  await page.locator(".url-setting summary").click();
  await page.click('button[name="action"][value="published"]');
  await page.waitForFunction(
    () => document.querySelector("#save-notice").textContent.includes("公開"),
    null,
    { timeout: 15000 },
  );
  const article = await page.request.get(origin + "/blog/" + slug + "/");
  const html = await article.text();
  assert.equal(article.status(), 200);
  assert.match(html, /<img src="\/media\/[a-f0-9]{32}\.png" alt="sample shot">/);
  const media = await page.request.get(origin + mediaPath);
  assert.equal(media.status(), 200);
  assert.equal(media.headers()["content-type"], "image/png");
  assert.deepEqual(errors, []);
  assert.deepEqual(failed.filter((f) => !/\/favicon\.ico$/.test(f)), []);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + "/admin/");
    await page.waitForSelector("#post-form");
    await page.screenshot({
      path: `.local/review/body-photo-admin-${width}.png`,
      fullPage: false,
    });
  }
  console.log("PASS inline photo insert, save, reopen, publish, media 200");
} finally {
  await browser.close();
}
