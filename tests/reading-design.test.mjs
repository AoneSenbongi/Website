import test from "node:test";
import assert from "node:assert/strict";
import { article, diary } from "../worker/pages.mjs";
const entry = {
  id: "day",
  kind: "diary",
  slug: "diary-2026-10-21",
  entry_date: "2026-10-21",
  title: "2026-10-21",
  body: "日記の本文",
  photo: "a".repeat(32) + ".jpg",
  published_at: 1,
};
test("記事と日記のコメント入力欄は既定で閉じたdetails内に置く", () => {
  for (const html of [
    article({ ...entry, kind: "blog", slug: "example" }),
    diary(entry, [entry]),
  ]) {
    assert.match(html, /<details\b[^>]*id="comment-composer"/);
    assert.doesNotMatch(
      html,
      /<details\b[^>]*id="comment-composer"[^>]*\bopen\b/,
    );
    assert.match(html, /<summary[^>]*>コメントを書く<\/summary>/);
    assert.match(html, /<form id="comment-form">/);
  }
});
test("日記の日付は一箇所にまとめ、1件だけならアーカイブは表示しない", () => {
  const html = diary(entry, [entry]);
  assert.doesNotMatch(html, /heading-dot|date-strip|日々のこと、音楽、写真/);
  assert.match(html, /<time datetime="2026-10-21">2026\.10\.21<\/time>/);
  assert.match(html, /class="diary-copy"/);
});
test("ほかの日記は選択中を除き、閉じたアーカイブにまとめる", () => {
  const html = diary(entry, [
    entry,
    { ...entry, id: "older", entry_date: "2025-10-20" },
  ]);
  assert.match(html, /<details class="diary-archive">/);
  assert.match(html, />ほかの日記<\/summary>/);
  assert.match(html, /href="\/diary\/2025-10-20\/"/);
  assert.doesNotMatch(html, /href="\/diary\/2026-10-21\/"/);
});
