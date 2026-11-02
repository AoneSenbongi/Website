import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { page as renderPage, diary, shareMetadata } from "../worker/pages.mjs";

const template=await readFile('blog/index.html','utf8');
const entries=['2026-11-02','2026-10-29','2025-01-01'].map((date,i)=>({id:`day${i}`,kind:'diary',slug:`day${i}`,entry_date:date,title:date,body:'日記の本文です。\n'.repeat(i===0?35:8),music:'https://example.com/song',song:'曲名'}));
const writes=[];
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/')){
      res.setHeader('Content-Type','application/json');
      if(url.pathname==='/api/blog/session')return res.end(JSON.stringify({csrf:'test',isAdmin:true,emailNotifications:false}));
      if(req.method==='POST'){
        let body='';for await(const part of req)body+=part;
        writes.push({path:url.pathname,body:JSON.parse(body)});
        return res.end(JSON.stringify(url.pathname.endsWith('/like')?{liked:true}:{id:'comment',status:'approved'}));
      }
      return res.end(JSON.stringify({likes:0,liked:false,comments:[]}));
    }
    if(url.pathname.startsWith('/diary/')){
      const date=url.pathname.split('/')[2];
      const entry=entries.find(e=>e.entry_date===date)||entries[0];
      const response=await renderPage({SITE_ORIGIN:origin,ASSETS:{fetch:async()=>new Response(template)}},new Request(url),diary(entry,entries),{script:'diary',title:entry.entry_date+'の日記',canonical:'/diary/'+entry.entry_date+'/',...shareMetadata(entry,origin)});
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self';img-src 'self' data:;connect-src 'self'");
      return res.end(await response.text());
    }
    if(/^\/(?:css|js|blog-ui)\/[a-z-]+\.(?:css|js)$/.test(url.pathname)){
      res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');
      return res.end(await readFile('.'+url.pathname));
    }
    res.writeHead(404);res.end();
  }catch(e){res.writeHead(500);res.end(String(e));}
});
let origin;
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const p=await context.newPage();
  const activeDate=()=>p.locator('.is-current time').getAttribute('datetime');
  const open=async(path='/diary/')=>{await p.goto(origin+path);await p.waitForFunction(()=>!document.querySelector('#like').disabled);};
  const expectDate=async date=>{await p.waitForURL(`**/diary/${date}/#diary-reader`);assert.equal(await activeDate(),date);await p.waitForFunction(()=>!document.querySelector('#like').disabled);};
  await open();
  assert.equal(await activeDate(),'2026-11-02');
  assert.equal(await p.locator('.is-current .diary-latest').textContent(),'Latest');
  assert.equal(await p.locator('a[data-diary-step="-1"]').count(),0);
  const badge=await p.locator('.is-current .diary-latest').evaluate(e=>({radius:getComputedStyle(e).borderRadius,color:getComputedStyle(e).color,border:getComputedStyle(e).borderTopWidth}));
  assert.equal(badge.radius,'999px');assert.equal(badge.border,'1px');
  await p.screenshot({path:'.local/review/diary-carousel-390.png'});
  await p.locator('[data-diary-step="1"]').click();await expectDate('2026-10-29');
  assert.equal(await p.locator('.is-current .diary-latest').count(),0);
  await p.locator('#like').click();
  assert.ok(writes.some(w=>w.path==='/api/blog/posts/day1/like'));
  await p.locator('#comment-composer > summary').click();
  await p.locator('#comment-form [name=body]').fill('入力保持');
  await p.locator('#comment-form [name=body]').press('ArrowRight');
  assert.equal(await activeDate(),'2026-10-29');
  await p.locator('#comment-form [type=submit]').click();
  assert.ok(writes.some(w=>w.path==='/api/blog/posts/day1/comments'));
  await p.locator('#diary-reader').focus();await p.keyboard.press('ArrowRight');await expectDate('2025-01-01');
  assert.equal(await p.locator('a[data-diary-step="1"]').count(),0);
  await p.keyboard.press('ArrowLeft');await expectDate('2026-10-29');
  const swipe=async(dx,dy)=>{
    await p.locator('#diary-reader').scrollIntoViewIfNeeded();
    const rect=await p.locator('#diary-reader').boundingBox();
    const x=dx<0?300:80,y=Math.max(140,Math.min(400,rect.y+80));
    const cdp=await context.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
  };
  await swipe(-180,0);await expectDate('2025-01-01');
  await swipe(180,0);await expectDate('2026-10-29');
  const before=p.url();await swipe(0,-100);await p.waitForTimeout(350);assert.equal(p.url(),before);
  await p.goBack();await p.waitForFunction(()=>!document.querySelector('.diary-track').classList.contains('to-older')&&!document.querySelector('.diary-track').classList.contains('to-newer'));
  await p.setViewportSize({width:1280,height:900});await open();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:'.local/review/diary-carousel-1280.png'});
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.locator('[data-diary-step="1"]').click();await expectDate('2026-10-29');
  const noJs=await browser.newContext({javaScriptEnabled:false});
  const fallback=await noJs.newPage();await fallback.goto(origin+'/diary/');
  await fallback.locator('[data-diary-step="1"]').click();
  assert.ok(fallback.url().includes('/diary/2026-10-29/'));
  await noJs.close();
  console.log('PASS: arrows, keyboard, native touch swipes, vertical scroll, boundaries, Latest, browser history, reduced motion, correct per-day reactions and input keys');
}finally{
  await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
