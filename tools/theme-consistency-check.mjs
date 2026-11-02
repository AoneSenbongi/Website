import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const common = await readFile("css/style.css", "utf8"), blog = await readFile("blog-ui/blog.css", "utf8");
const browser = await chromium.launch({channel:"msedge",headless:true});
await mkdir(".local/review",{recursive:true});
try {
 const page = await browser.newPage();
 for(const theme of ["light","dark"]){
  await page.setContent(`<html data-theme="${theme}"><head><style>${common}</style></head><body><h1>Home</h1></body></html>`);
  const expected=await page.evaluate(()=>{const b=getComputedStyle(document.body);const r=getComputedStyle(document.documentElement);return {bg:b.backgroundColor,color:b.color,font:b.fontFamily,surface:r.getPropertyValue('--subtle').trim(),button:r.getPropertyValue('--button-bg').trim()};});
  await page.setContent(`<html data-theme="${theme}"><head><style>${common}${blog}</style></head><body><main class="blog-shell journal-index"><header class="index-heading"><h1>Blog</h1></header><div class="article-header"><h1>記事の見出し</h1></div><div class="diary-heading"><h1>日記</h1></div><header class="admin-heading"><h1>書く</h1></header><div class="diary-date"><time>2026.11.02</time></div></main></body></html>`);
  const actual=await page.evaluate(()=>{const b=getComputedStyle(document.body);return {bg:b.backgroundColor,color:b.color,font:b.fontFamily};});
  assert.equal(actual.bg,expected.bg,theme+" Blog background");
  assert.equal(actual.color,expected.color,theme+" Blog text");
  for(const font of await page.locator('h1,time').evaluateAll(es=>es.map(e=>getComputedStyle(e).fontFamily)))assert.equal(font,expected.font,theme+" journal font");
  await page.screenshot({path:`.local/review/theme-blog-${theme}.png`,fullPage:true});
  for(const file of ['contact/index.html','en/contact/index.html']){
   let html=await readFile(file,'utf8');
   html=html.replace('</head>',`<style>${common}</style></head>`).replace('<html lang=',`<html data-theme="${theme}" lang=`).replace(/<script\b[\s\S]*?<\/script>/g,'');
   await page.setContent(html);
   const colors=await page.evaluate(()=>{const hero=getComputedStyle(document.querySelector('.contact-hero'));const btn=getComputedStyle(document.querySelector('.contact-button'));const plain=document.createElement('div');plain.style.color='var(--text)';plain.style.background='var(--subtle)';document.body.append(plain);const p=getComputedStyle(plain);return {hero:hero.backgroundColor,text:hero.color,wantBg:p.backgroundColor,wantText:p.color,button:btn.backgroundColor,buttons:[...document.querySelectorAll('.contact-button')].map(e=>getComputedStyle(e).backgroundColor),font:getComputedStyle(document.querySelector('h1')).fontFamily};});
   assert.equal(colors.hero,colors.wantBg,theme+" contact background");
   assert.equal(colors.text,colors.wantText,theme+" contact text");
   assert.equal(colors.font,expected.font,theme+" contact font");
   assert.ok(colors.buttons.every(c=>c===colors.button),theme+" contact buttons");
  }
  console.log(`PASS ${theme}: shared Blog colors/fonts and JA/EN Contact colors/fonts`);
 }
} finally {await browser.close();}
