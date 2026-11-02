import test from "node:test";
import assert from "node:assert/strict";
import { article, diary } from "../worker/pages.mjs";

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
