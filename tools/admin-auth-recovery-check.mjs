import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {page as renderPage,adminPage,article,diary} from '../worker/pages.mjs';
const template=await readFile('blog/index.html','utf8');
const posts=[{id:'blog',kind:'blog',title:'記事',slug:'article',body:'保存済み',status:'draft',updated_at:1},{id:'diary',kind:'diary',title:'2026-11-04',slug:'day',entry_date:'2026-11-04',body:'保存済み',status:'draft',updated_at:1}];
let authorized=true,csrf=1,outage=false,writes=0,origin;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/admin/'){
   if(!authorized){authorized=true;csrf++;}
   const response=await renderPage({SITE_ORIGIN:origin,ASSETS:{fetch:async()=>new Response(template)}},new Request(url),adminPage(),{script:'admin'});
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(await response.text());
  }
  if(url.pathname==='/api/blog/session'){
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({isAdmin:authorized,csrf:String(csrf)}));
  }
  if(url.pathname.startsWith('/api/admin/')){
   if(!authorized||outage)return req.socket.destroy();
   res.setHeader('Content-Type','application/json');
   if(req.method==='GET')return res.end(JSON.stringify(url.pathname.endsWith('/comments')?[]:posts));
   let raw='';for await(const part of req)raw+=part;
   const body=JSON.parse(raw);
   if(req.headers['x-csrf-token']!==String(csrf)){res.writeHead(403);return res.end(JSON.stringify({error:'stale CSRF'}));}
   if(url.pathname.endsWith('/preview')){
    const p={...body,entry_date:body.date};const response=await renderPage({SITE_ORIGIN:origin,ASSETS:{fetch:async()=>new Response(template)}},new Request(url),body.kind==='diary'?diary(p,[],true):article(p,true),{preview:true});
    return res.end(JSON.stringify({html:await response.text()}));
   }
   const current=posts.find(p=>p.id===url.pathname.split('/').at(-1));
   if(!current)throw Error('unexpected post');
   Object.assign(current,{body:body.body,status:body.status,updated_at:current.updated_at+1});writes++;
   return res.end(JSON.stringify({id:current.id}));
  }
  if(/^\/(?:css|js|blog-ui)\/[a-z-]+\.(css|js)$/.test(url.pathname)){
   res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(await readFile('.'+url.pathname));
  }
  res.writeHead(404);res.end();
 }catch(error){res.writeHead(500);res.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext();const p=await context.newPage();p.setDefaultTimeout(6000);
 await p.goto(origin+'/admin/');await p.locator('#preview:not([disabled])').waitFor();
 const login=async()=>{const opened=context.waitForEvent('page');await p.locator('#save-notice .reauth-link').click();const tab=await opened;await tab.waitForLoadState();await tab.close();};
 for(const kind of ['blog','diary']){
  await p.locator(`[data-tab=${kind}]`).click();await p.locator('.admin-row').first().click();
  const text=kind+'の未保存原稿';await p.locator('[name=body]').fill(text);
  authorized=false;const before=writes;
  await p.getByRole('button',{name:'保存',exact:true}).click();
  await p.locator('#save-notice .reauth-link').waitFor();
  assert.equal(await p.locator('[name=body]').inputValue(),text);assert.equal(writes,before);
  if(kind==='blog'){
    await p.locator('.editor-actions').scrollIntoViewIfNeeded();
    await p.screenshot({path:'.local/review/admin-auth-expired.png'});
  }
  await login();await p.getByRole('button',{name:'保存',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#save-notice').textContent==='保存しました。');
  assert.equal(posts.find(x=>x.id===kind).body,text);assert.equal(writes,before+1);
  authorized=false;
  const opened=context.waitForEvent('page');await p.locator('#preview').click();const failed=await opened;
  await p.locator('#save-notice .reauth-link').waitFor();assert.equal(failed.isClosed(),true);
  assert.equal(await p.locator('[name=body]').inputValue(),text);
  await login();
  const previewed=context.waitForEvent('page');await p.locator('#preview').click();const preview=await previewed;
  await preview.getByText(text,{exact:true}).waitFor();await preview.close();
  assert.equal(await p.locator('[name=body]').inputValue(),text);
  console.log('PASS '+kind+': expired login detected, original input retained, login in a separate tab, fresh CSRF, save/preview retry without reload');
 }
 outage=true;await p.locator('[name=body]').fill('通信障害でも保持');await p.getByRole('button',{name:'保存',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('#save-notice').textContent.length>0);
 assert.equal(await p.locator('#save-notice .reauth-link').count(),0);
 assert.equal(await p.locator('[name=body]').inputValue(),'通信障害でも保持');
 outage=false;await p.getByRole('button',{name:'保存',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('#save-notice').textContent==='保存しました。');
 console.log('PASS: ordinary network outage does not falsely request login and retry retains input');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
