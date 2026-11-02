import test from "node:test";
import assert from "node:assert/strict";
import { page, shareMetadata } from "../worker/pages.mjs";
import { readFile } from "node:fs/promises";
const origin="https://yamachikaseiya.com";
test("Preview styles bypass cached CSS on every opening", async () => {
 const template=await readFile(new URL('../blog/index.html',import.meta.url),'utf8');
 const env={SITE_ORIGIN:origin,ASSETS:{fetch:async()=>new Response(template)}};
 const render=async()=> (await page(env,new Request(origin+'/api/admin/preview'),'<main>preview</main>',{preview:true})).text();
 const first=await render(),second=await render();
 const styles=html=>[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
 assert.ok(styles(first).length>=2);
 for (const href of styles(first)) assert.ok(new URL(href,origin).searchParams.has('preview'),href);
 assert.notDeepEqual(styles(first),styles(second));
});
test("Blog share metadata removes Markdown and chooses a published photo",()=>{
 const meta=shareMetadata({body:'## 見出し\n\n**大事**な[文章](https://example.com)\n\n![写真](/images/example.jpg)',photo:'a'.repeat(32)+'.jpg'},origin);
 assert.equal(meta.description,'見出し 大事な文章');
 assert.equal(meta.image,origin+'/media/'+'a'.repeat(32)+'.jpg');
 assert.equal(meta.type,'article');
});
test("Markdown site images are used with a safe default when absent",()=>{
 assert.equal(shareMetadata({body:'![写真](/images/blog/photo.jpg)'},origin).image,origin+'/images/blog/photo.jpg');
 for(const body of ['本文','![画像](data:image/png;base64,abc)','![画像](/admin/private.jpg)','![画像](https://other.example/img.png)'])assert.equal(shareMetadata({body},origin).image,origin+'/images/og-card.png');
});
test("The real HTML template emits consistent escaped Open Graph and X cards",async()=>{
 const template=await readFile(new URL('../blog/index.html',import.meta.url),'utf8');
 const env={SITE_ORIGIN:origin,ASSETS:{fetch:async()=>new Response(template)}};
 const response=await page(env,new Request(origin+'/blog/example/'),'<main>本文</main>',{title:'タイトル "引用" $&',slug:'example',...shareMetadata({body:'**本文**です。',photo:null},origin)});
 const html=await response.text();
 for(const [attr,key,value] of [['property','og:type','article'],['property','og:title','タイトル &quot;引用&quot; $&amp; | 山近晴也'],['property','og:description','本文です。'],['name','twitter:title','タイトル &quot;引用&quot; $&amp; | 山近晴也'],['name','twitter:description','本文です。'],['name','twitter:image',origin+'/images/og-card.png'],['name','twitter:card','summary_large_image']]){
  const tags=[...html.matchAll(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`,'g'))];
  assert.equal(tags.length,1,key);assert.equal(tags[0][1],value,key);
 }
 assert.ok(html.includes('<meta property="og:url" content="'+origin+'/blog/example/">'));
});
