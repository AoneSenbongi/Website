import { chromium } from "playwright";
import assert from "node:assert/strict";
const base=process.env.BLOG_PREVIEW_URL || 'http://127.0.0.1:4205';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Local checks only');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const owner=await browser.newContext(),reader=await browser.newContext();
 const p=await owner.newPage();p.setDefaultTimeout(6000);
 await p.goto(base+'/__preview/');await p.getByRole('button',{name:'管理画面を試す'}).click();await p.waitForURL('**/admin/');
 const nonce=Date.now();
 for(const kind of ['blog','diary']){
   await p.locator(`[data-tab=${kind}]`).click();
   const title='非公開操作の確認 '+nonce,slug='unpublish-'+nonce,date=`${4000+nonce%1000}-11-03`;
   if(kind==='blog'){
     await p.locator('[name=title]').fill(title);
     await p.locator('.url-setting summary').click();await p.locator('[name=slug]').fill(slug);
   }else{
     await p.locator('[name=date]').fill(date);
     await p.locator('#music-fields').evaluate(e=>e.open=true);
     await p.locator('[name=music]').fill('https://example.com/song');await p.locator('[name=song]').fill('曲名');
   }
   await p.locator('[name=body]').fill('公開する本文');
   await p.locator('#photo').setInputFiles('images/profile-photo.jpg');
   await p.waitForFunction(()=>document.querySelector('#photo-state').textContent==='profile-photo.jpg');
   await p.getByRole('button',{name:'公開',exact:true}).click();
   await p.waitForFunction(()=>document.querySelector('#save-notice').textContent==='公開しました。');
   const url=kind==='blog'?'/blog/'+slug+'/':'/diary/'+date+'/';
   assert.equal((await reader.request.get(base+url)).status(),200);
   const posts=async()=>p.evaluate(async()=>await(await fetch('/api/admin/posts')).json());
   const original=(await posts()).find(e=>e.kind===kind && (kind==='blog'?e.slug===slug:e.entry_date===date));
   await p.getByRole('button',{name:'非公開',exact:true}).waitFor();
   await p.locator('[name=body]').fill('公開状態を保って保存');
   await p.getByRole('button',{name:'保存',exact:true}).click();
   await p.waitForFunction(()=>document.querySelector('#save-notice').textContent==='保存しました。');
   assert.ok((await(await reader.request.get(base+url)).text()).includes('公開状態を保って保存'));
   await p.locator('[name=body]').fill('非公開にして残す編集中の本文');
   p.once('dialog',d=>d.dismiss());await p.getByRole('button',{name:'非公開',exact:true}).click();
   assert.equal((await reader.request.get(base+url)).status(),200);
   assert.equal(await p.locator('[name=body]').inputValue(),'非公開にして残す編集中の本文');
   p.once('dialog',async d=>{assert.ok(d.message().includes(kind==='diary'?'日記':'記事'));await d.accept();});
   await p.getByRole('button',{name:'非公開',exact:true}).click();
   await p.waitForFunction(()=>document.querySelector('#save-notice').textContent==='非公開にしました。');
   assert.equal((await reader.request.get(base+url)).status(),404);
   assert.equal((await reader.request.get(base+'/api/blog/posts/'+original.slug)).status(),404);
   assert.equal((await reader.request.get(base+'/media/'+original.photo)).status(),404);
   assert.equal(await p.locator('#editor-state').textContent(),'下書き');
   const hidden=(await posts()).find(e=>e.id===original.id);
   assert.equal(hidden.status,'draft');assert.equal(hidden.body,'非公開にして残す編集中の本文');assert.equal(hidden.photo,original.photo);assert.equal(hidden.music,original.music);assert.equal(hidden.published_at,original.published_at);
   assert.equal(await p.getByRole('button',{name:'非公開',exact:true}).count(),0);
   await p.reload();await p.locator(`[data-tab=${kind}]`).click();
   await p.locator('.admin-row').filter({hasText:kind==='blog'?title:date}).click();
   assert.equal(await p.locator('[name=body]').inputValue(),hidden.body);
   await p.getByRole('button',{name:'公開',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#save-notice').textContent==='公開しました。');
   assert.equal((await reader.request.get(base+url)).status(),200);assert.equal((await reader.request.get(base+'/media/'+original.photo)).status(),200);
   assert.equal((await posts()).find(e=>e.id===original.id).published_at,original.published_at);
   console.log('PASS '+kind+': explicit unpublish, cancellation, private URL/API/photo, retained content, reload and republish');
 }
}finally{await browser.close();}
