import test from "node:test";
import assert from "node:assert/strict";
import { article, diary, musicThumb } from "../worker/pages.mjs";
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
test("日記の音楽リンクを日付の隣へまとめる", () => {
  for (const preview of [false, true]) {
    const html = diary({...entry,music:"https://example.com/song",song:"曲名"},[],preview);
    assert.match(html, /<div class="diary-date"><div class="diary-date-label"><time[^>]*>[^<]*<\/time>[\s\S]*?<\/div><a class="music-link"/);
    assert.equal((html.match(/class="music-link"/g)||[]).length,1);
    assert.match(html, /class="music-note"[^>]*>♫<\/span> <span class="music-title">曲名<\/span>/);
  }
});
test("日記は前後を横に並べ、Latestは最新分だけに表示する",()=>{
 const newest={...entry,id:'newest',entry_date:'2026-10-22'},oldest={...entry,id:'oldest',entry_date:'2026-10-20'};
 const html=diary(entry,[newest,entry,oldest]);
 assert.match(html,/class="diary-track"/);
 assert.match(html,/data-diary-step="-1"[^>]*href="\/diary\/2026-10-22\//);
 assert.match(html,/data-diary-step="1"[^>]*href="\/diary\/2026-10-20\//);
 assert.equal((html.match(/class="diary-latest"/g)||[]).length,1);
 assert.equal((html.match(/id="comment-form"/g)||[]).length,1);
 assert.doesNotMatch(diary(newest,[newest,entry,oldest]),/<a data-diary-step="-1"/);
 assert.doesNotMatch(diary(entry,[newest,entry,oldest],true),/diary-track|diary-latest|data-diary-step/);
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
test("写真なしの日記は音楽のサムネイルを背景に表示し、写真ありでは使わない", () => {
  const music = "https://youtu.be/CS2GKwW_2dI?si=abc";
  const html = diary({ ...entry, photo: null, music, song: "曲名" }, []);
  assert.match(html, /class="diary-leaf has-photo has-music-thumb"/);
  assert.match(
    html,
    /<img class="diary-background diary-music-thumb" src="https:\/\/i\.ytimg\.com\/vi\/CS2GKwW_2dI\/hq720\.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">/,
  );
  assert.doesNotMatch(html, /\/media\//);
  const withPhoto = diary({ ...entry, music }, []);
  assert.match(withPhoto, /src="\/media\//);
  assert.doesNotMatch(withPhoto, /i\.ytimg\.com|has-music-thumb/);
  const noMusic = diary({ ...entry, photo: null }, []);
  assert.doesNotMatch(noMusic, /diary-background|has-photo|has-music-thumb/);
});
test("音楽のサムネイルはYouTubeのURLから動画IDを取り出して決める", () => {
  assert.equal(
    musicThumb("https://youtu.be/CS2GKwW_2dI?si=abc"),
    "https://i.ytimg.com/vi/CS2GKwW_2dI/hq720.jpg",
  );
  assert.equal(
    musicThumb("https://www.youtube.com/watch?v=8M6H6xGaYjk&list=x"),
    "https://i.ytimg.com/vi/8M6H6xGaYjk/hq720.jpg",
  );
  assert.equal(
    musicThumb("https://music.youtube.com/watch?v=CS2GKwW_2dI"),
    "https://i.ytimg.com/vi/CS2GKwW_2dI/hq720.jpg",
  );
  assert.equal(
    musicThumb("https://www.youtube.com/shorts/8M6H6xGaYjk"),
    "https://i.ytimg.com/vi/8M6H6xGaYjk/hq720.jpg",
  );
  for (const bad of [
    "https://example.com/song",
    "https://open.spotify.com/track/abc",
    "https://youtu.be/short-id",
    "https://youtu.be/<script>",
    "not a url",
  ]) {
    assert.equal(musicThumb(bad), null);
  }
});
