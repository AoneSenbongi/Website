import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { article, diary, page } from "../worker/pages.mjs";

const post = { id: "test", kind: "blog", slug: "markdown", title: "表示例", entry_date: "2026-11-02", body: "## 小見出し\n\n**太字**と*斜体*\n\n- 項目\n\n> 引用\n\n`code`\n\n[リンク](https://example.com)" };
for (const preview of [false, true]) {
  test(`Blog and diary render Markdown in ${preview ? "preview" : "public"} pages`, () => {
    for (const html of [article(post, preview), diary(post, [post], preview)]) {
      for (const text of ["<h2>小見出し</h2>", "<strong>太字</strong>", "<em>斜体</em>", "<li>項目</li>", "<blockquote>", "<code>code</code>", 'href="https://example.com"']) assert.ok(html.includes(text), text);
    }
  });
}
test("Raw HTML and unsafe links cannot execute through Markdown", () => {
  const body = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert%281%29)\n\n[x](data:text/html;base64,PHNjcmlwdD4=)\n\n```html\n<script>sample</script>\n```';
  for (const html of [article({...post, body}, true), diary({...post, body}, [], true)]) {
    assert.doesNotMatch(html, /<script>|<img src=x|href="(?:javascript|data):/i);
    assert.ok(html.includes("&lt;script&gt;"));
  }
});
test("Plain text paragraphs, line breaks, and literal dollar signs survive", () => {
  const html = article({...post,body:"一行目\n二行目\n\n料金 $5 & $&"}, true);
  assert.match(html, /一行目<br>\n二行目/);
  assert.ok(html.includes("料金 $5 &amp; $&amp;"));
});

test("Spaced bold markers render in Blog and diary previews and public pages", () => {
  const body = "** 一つは成績による脚切りです． **\n\n平均評定は** 2.6 **。\n\n**片側 **と** 片側**と**　全角　**";
  for (const preview of [false, true]) {
    for (const html of [article({...post, body}, preview), diary({...post, body}, [], preview)]) {
      for (const text of ["一つは成績による脚切りです．", "2.6", "片側", "全角"])
        assert.ok(html.includes(`<strong>${text}</strong>`), text);
    }
  }
});

test("Spaced bold preserves code, escaped markers, and HTML safety", () => {
  const body = '`** 文字 **`\n\n```\n** 文字 **\n```\n\n\\*\\* 文字 \\*\\*\n\n** <script>x</script> **\n\n** [x](javascript:alert%281%29) **';
  const html = article({...post, body}, true);
  assert.ok(html.includes('<code>** 文字 **</code>'));
  assert.ok(html.includes('<code>** 文字 **\n</code>'));
  assert.ok(html.includes('<p>** 文字 **</p>'));
  assert.ok(html.includes('<strong>&lt;script&gt;x&lt;/script&gt;</strong>'));
  assert.doesNotMatch(html, /<script>|href="javascript:/);
});

test("Backslash commands render as inline LaTeX math in Blog and diary", () => {
  const body = "値は \\alpha + \\beta です。\\frac{1}{2} もあります。\\* はエスケープのまま。";
  for (const preview of [false, true]) {
    for (const html of [article({...post, body}, preview), diary({...post, body}, [], preview)]) {
      assert.match(html, /class="katex"/);
      assert.ok(html.includes("です。"), "Japanese text after the formula remains");
      assert.ok(html.includes("もあります。"));
      assert.ok(html.includes("はエスケープのまま。"));
      assert.ok(html.includes("\\alpha + \\beta"), "MathML keeps the formula source");
    }
  }
});

test("LaTeX input cannot inject markup, scripts, or links", () => {
  const body = "\\href{javascript:alert(1)}{x}\n\n\\text{<script>alert(1)</script>}\n\n\\alpha $5 & $&";
  const html = article({...post, body}, true);
  assert.doesNotMatch(html, /<script>|href="javascript:/i);
  assert.ok(html.includes("$5 &amp; $&amp;"));
});

test("Pasted note iframes render while the helper script stays inactive", () => {
  const body = `前の文。\n\n<iframe class="note-embed" src="https://note.com/embed/notes/n87f9ce040450" style="border: 0; display: block; max-width: 99%; width: 494px; padding: 0px; margin: 10px 0px; position: static; visibility: visible;" height="400"></iframe>\n<script async src="https://note.com/scripts/embed.js" charset="utf-8"></script>\n\n後の文。`;
  for (const preview of [false, true]) {
    for (const html of [article({...post, body}, preview), diary({...post, body}, [], preview)]) {
      assert.match(html, /<iframe class="note-embed" src="https:\/\/note\.com\/embed\/notes\/n87f9ce040450" height="200" style="height:200px"/);
      assert.doesNotMatch(html, /note\.com\/scripts\/embed\.js|<script|onerror=/i);
      assert.ok(html.includes("前の文。"));
      assert.ok(html.includes("後の文。"));
    }
  }
});
test("Iframes other than note embeds stay escaped", () => {
  const body = '<iframe src="https://evil.example/"></iframe>\n\n<iframe src="https://note.com.evil.example/embed/notes/n1"></iframe>\n\n<iframe src="https://note.com/embed/notes/n1" onload="alert(1)"></iframe>';
  const html = article({...post, body}, true);
  assert.ok(html.includes("&lt;iframe"));
  assert.doesNotMatch(html, /<iframe[^>]+evil\.example|<iframe[^>]+onload/i);
  assert.match(html, /<iframe class="note-embed" src="https:\/\/note\.com\/embed\/notes\/n1"/);
  assert.doesNotMatch(html, /<iframe[^>]+onload/i);
});
test("Shared draft articles use keyed media and omit reactions and navigation links", () => {
  const key = "k".repeat(43);
  const photo = "a".repeat(32) + ".jpg";
  const bodyPhoto = "b".repeat(32) + ".png";
  const html = article({...post, photo, body: `本文 ![写真](/media/${bodyPhoto})`}, false, key, true);
  assert.match(html, new RegExp(`src="/media/${photo}\\?key=${key}"`));
  assert.match(html, new RegExp(`/media/${bodyPhoto}\\?key=${key}`));
  assert.match(html, /class="journal-tabs"/);
  assert.doesNotMatch(html, /article-end|article-diary-link|data-slug=/);
});
test("KaTeX positioning styles survive the page template cleanup", async () => {
  const template = await readFile(new URL("../blog/index.html", import.meta.url), "utf8");
  const env = { SITE_ORIGIN: "https://yamachikaseiya.com", ASSETS: { fetch: async () => new Response(template) } };
  const body = "下付き \\alpha_1 と上付き \\alpha^2。";
  for (const preview of [false, true]) {
    const html = await (await page(env, new Request("https://yamachikaseiya.com/blog/example/"), article({...post, body}, preview), { preview })).text();
    assert.match(html, /class="msupsub"/);
    assert.match(html, /style="top:-/);
  }
});
