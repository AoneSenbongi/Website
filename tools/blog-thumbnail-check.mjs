import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { listing } from "../worker/pages.mjs";
const styles = await Promise.all(["css/style.css","blog-ui/blog.css"].map(p=>readFile(p,"utf8")));
const photo = existsSync(".local/review/current-share-image.png") ? ".local/review/current-share-image.png" : "images/profile-photo.jpg";
const src = `data:image/${photo.endsWith("png")?"png":"jpeg"};base64,${(await readFile(photo)).toString("base64")}`;
const main=listing([{slug:"example",title:"SFCの合格体験記，筑波の不合格体験記",published_at:1793577600000,photo:"fixture"}]).replace('/media/fixture',src);
const browser=await chromium.launch({channel:"msedge",headless:true});
await mkdir(".local/review",{recursive:true});
try {
 const page=await browser.newPage();
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:844});
  await page.setContent(`<style>${styles.join("\n")}</style>${main}`);
  await page.locator('.post-row img').evaluate(i=>i.decode());
  const size=await page.evaluate(()=>{const row=document.querySelector('.post-row').getBoundingClientRect(),image=document.querySelector('.post-row img').getBoundingClientRect(),text=document.querySelector('.post-row > div').getBoundingClientRect();return {row:row.width,image:image.width,imageBottom:image.bottom,textTop:text.top,fit:getComputedStyle(document.querySelector('.post-row img')).objectFit};});
  if(width===390){assert.ok(size.image>=size.row*0.95,JSON.stringify(size));assert.ok(size.imageBottom<=size.textTop,JSON.stringify(size));}
  else assert.ok(size.image>=300,JSON.stringify(size));
  assert.equal(size.fit,'contain');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`.local/review/blog-thumbnail-${width}.png`,fullPage:true});
  console.log(`PASS ${width}px: large image, full photo, no horizontal overflow`);
 }
}finally{await browser.close();}
