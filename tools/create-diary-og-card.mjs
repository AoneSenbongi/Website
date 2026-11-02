import { chromium } from "playwright";

// Static, public diary fallback; no private entry content is baked into the image.
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await page.setContent(`<!doctype html><html lang="ja"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6fa;color:#111827;font-family:"Yu Gothic","Meiryo",sans-serif}
    main{width:1200px;height:630px;padding:68px 80px;position:relative;overflow:hidden}
    .label{font-size:22px;letter-spacing:.25em;color:#536075;margin:0 0 52px}
    h1{font-size:112px;font-weight:600;letter-spacing:.06em;line-height:1.1;margin:0 0 30px;font-family:"Yu Mincho","MS PMincho",serif}
    .description{font-size:29px;letter-spacing:.08em;margin:0}.author{position:absolute;bottom:62px;font-size:27px;margin:0}
    .rule{position:absolute;left:80px;right:80px;bottom:116px;height:1px;background:#cbd1dc}
    .lines{position:absolute;right:80px;top:180px;width:290px;height:210px;background:repeating-linear-gradient(transparent 0 49px,#d6dce7 49px 50px);transform:rotate(-7deg)}
  </style><main><p class="label">DIARY</p><h1>日記</h1><p class="description">日々のこと、音楽、写真。</p><div class="lines"></div><div class="rule"></div><p class="author">山近 晴也</p></main></html>`);
  await page.screenshot({path:"images/diary-og-card.png"});
} finally { await browser.close(); }
