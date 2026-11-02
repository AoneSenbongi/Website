import test from "node:test";
import assert from "node:assert/strict";
import { article } from "../worker/pages.mjs";

const post = { id: "example", slug: "example", title: "記事", body: "本文" };

test("Public Blog articles link to the diary after comments", () => {
  const html = article(post);
  assert.match(html, /<p class="article-diary-link"><a href="\/diary\/">日記<\/a><\/p><\/main>$/);
  assert.ok(html.indexOf('class="article-diary-link"') > html.indexOf('id="comment-form"'));
});

test("Draft previews keep their editing flow without a diary link", () => {
  assert.doesNotMatch(article(post, true), /class="article-diary-link"/);
});
