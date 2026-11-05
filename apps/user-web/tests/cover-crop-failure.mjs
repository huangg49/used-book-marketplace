// Actual /sell cover input: decode/Canvas/encoding failure, then recovery.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');const {preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-cover-crop-failure');await mkdir(out,{recursive:true});
const baseline=process.env.COVER_CROP_BASELINE==='1',origin='http://127.0.0.1:4236';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.COVER_CROP_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4236,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const failure of ['decode','context','blob']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{
   const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),live=new Set();let created=0,revoked=0;
   URL.createObjectURL=file=>{const url=create(file);if(file instanceof File&&file.name.startsWith('qa-')){created++;live.add(url)}return url};
   URL.revokeObjectURL=url=>{if(live.delete(url))revoked++;revoke(url)};window.qaCropResources=()=>({created,revoked,live:live.size});
   const get=HTMLCanvasElement.prototype.getContext,toBlob=HTMLCanvasElement.prototype.toBlob;
   HTMLCanvasElement.prototype.getContext=function(...args){if(window.qaCropFailure==='context')return null;return get.apply(this,args)};
   HTMLCanvasElement.prototype.toBlob=function(callback,...args){if(window.qaCropFailure==='blob'){callback(null);return}return toBlob.call(this,callback,...args)};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No upload/catalog/draft/AI commands for cover input');
   if(p==='/api/v1/me/addresses')return route.fulfill({json:{version:0,items:[]}});
   if(p==='/api/v1/service-areas')return route.fulfill({json:{code:'HCM-DEMO-v1',localities:[]}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fsell');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('navigation',{name:'Các bước đăng sách',exact:true})).toBeVisible();
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();await page.getByLabel('Tên sách',{exact:true}).fill('Tên bìa đang nhập QA');
  await page.getByLabel('Tác giả',{exact:true}).fill('Tác giả QA');await page.getByRole('combobox',{name:'Danh mục sách',exact:true}).selectOption({label:'Sách khác'});
  await page.getByRole('navigation',{name:'Các bước đăng sách',exact:true}).getByRole('button',{name:/Ảnh bản sách/}).click();
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=120;return c.toDataURL('image/png').split(',')[1]}),'base64');
  await page.evaluate(mode=>{window.qaCropFailure=mode},failure);
  await page.locator('#cover-file').setInputFiles({name:'qa-bad-cover.png',mimeType:'image/png',buffer:failure==='decode'?Buffer.from('QA corrupt image'):png});
  const error=page.getByRole('alert').filter({hasText:failure==='decode'?(baseline?/decoded/:/Không đọc được ảnh bìa/):failure==='context'?/Canvas 2D/:/tệp ảnh sau khi cắt/});
  await expect(error).toBeVisible();
  await expect.poll(async()=> (await page.evaluate(()=>window.qaCropResources())).live).toBe(baseline?1:0);
  await error.screenshot({path:path.join(out,`${baseline?'before':'after'}-${failure}-${width}.png`)});
  await page.evaluate(()=>{window.qaCropFailure=undefined});
  await page.locator('#cover-file').setInputFiles({name:'qa-good-cover.png',mimeType:'image/png',buffer:png});
  await expect(page.getByRole('button',{name:'Xóa ảnh bìa',exact:true})).toBeVisible();await expect(error).toHaveCount(0);
  await page.getByRole('button',{name:'Xóa ảnh bìa',exact:true}).click();
  await expect.poll(async()=> (await page.evaluate(()=>window.qaCropResources())).live).toBe(baseline?1:0);
  const resources=await page.evaluate(()=>window.qaCropResources());assert.equal(resources.created,3);assert.equal(resources.revoked,baseline?2:3);
  await page.getByRole('navigation',{name:'Các bước đăng sách',exact:true}).getByRole('button',{name:/Thông tin sách/}).click();
  await expect(page.getByLabel('Tên sách',{exact:true})).toHaveValue('Tên bìa đang nhập QA');
  assert.deepEqual(errors,[]);checks.push({width,failure,resources,recovery:true,draftPreserved:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
