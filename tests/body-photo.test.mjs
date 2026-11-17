import test from "node:test";
import assert from "node:assert/strict";
import { article, diary, adminPage } from "../worker/pages.mjs";

const key = "a".repeat(32) + ".jpg";
const post = {
  id: "body-photo",
  kind: "blog",
  slug: "body-photo",
  title: "本文の写真",
  body: "前書き\n\n![差し込んだ写真](/media/" + key + ")\n\n後書き",
  photo: null,
  published_at: 1,
};

test("管理画面は本文へ写真を差し込む入力を持ち、登録写真の操作は変えない", () => {
  const html = adminPage();
  assert.match(html, /<div class="body-photo-editor">/);
  assert.match(
    html,
    /<label class="photo-picker" for="body-photo">＋ 本文に写真を追加<\/label>/,
  );
  assert.match(
    html,
    /<input class="visually-hidden" id="body-photo" type="file" accept="image\/jpeg,image\/png,image\/webp" multiple>/,
  );
  assert.match(html, /id="body-photo-state"/);
  assert.match(html, /<label class="photo-picker" for="photo">＋ 写真を追加<\/label>/);
  assert.match(html, /<img id="photo-preview"/);
  assert.match(html, /id="remove-photo"/);
});

test("本文中の写真は記事・日記・プレビューで画像として表示する", () => {
  for (const html of [
    article(post, false),
    article(post, true),
    diary({ ...post, kind: "diary", entry_date: "2026-11-17" }, [post], true),
  ])
    assert.ok(
      html.includes('<img src="/media/' + key + '" alt="差し込んだ写真">'),
      html.slice(0, 400),
    );
});

test("本文の写真URLがjavascript等なら画像にしない", () => {
  const html = article(
    { ...post, body: "![危険](javascript:alert(1))" },
    true,
  );
  assert.doesNotMatch(html, /<img[^>]+javascript:/i);
  assert.doesNotMatch(html, /src="javascript:/i);
});
