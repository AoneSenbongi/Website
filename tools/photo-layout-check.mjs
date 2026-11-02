import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const css = await readFile("blog-ui/blog.css", "utf8");
const browser = await chromium.launch({channel:"msedge",headless:true});
await mkdir(".local/review",{recursive:true});
try {
  const page = await browser.newPage();
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    for (const container of ["article-body","diary-words"]) {
      const sizes=[[1600,900],[900,1600],[1200,1200],[160,90]];
      const imgs=sizes.map(([w,h])=>`<img src="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#92a18a"/></svg>`)}">`).join("");
      await page.setContent(`<style>html{font-size:16px}body{margin:0}${css}</style><main class="article-shell"><div class="${container}">${imgs}</div></main>`);
      await page.locator("img").evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
      const results=await page.locator("img").evaluateAll(imgs=>imgs.map(i=>({w:i.getBoundingClientRect().width,h:i.getBoundingClientRect().height,nw:i.naturalWidth,nh:i.naturalHeight,parent:i.parentElement.getBoundingClientRect().width})));
      for(const r of results){
        assert.ok(Math.abs(r.w/r.h-r.nw/r.nh)<0.01,`aspect ratio: ${JSON.stringify(r)}`);
        assert.ok(r.w<=r.parent+1 && r.h<=609,`fits content: ${JSON.stringify(r)}`);
        assert.ok(r.w<=r.nw+1 && r.h<=r.nh+1,`no enlargement: ${JSON.stringify(r)}`);
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      console.log(`PASS ${container} ${width}px: landscape, portrait, square, small`);
      if(container==="article-body")await page.screenshot({path:`.local/review/photo-fit-${width}.png`,fullPage:true});
    }
  }
} finally {await browser.close();}
