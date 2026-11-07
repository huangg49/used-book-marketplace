// Actual keyboard crop controls: failed optimistic positioning, retry, unrelated error ownership.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-cover-position-recovery');await mkdir(out,{recursive:true});
const baseline=process.env.COVER_POSITION_BASELINE==='1',origin='http://127.0.0.1:4242';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.COVER_POSITION_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4242,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const failure of ['decode','context','blob']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{
   const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),live=new Set();let created=0,revoked=0;
   URL.createObjectURL=file=>{const url=create(file);if(file instanceof File&&file.name.startsWith('qa-')){created++;live.add(url)}return url};
   URL.revokeObjectURL=url=>{if(live.delete(url))revoked++;revoke(url)};window.qaPositionResources=()=>({created,revoked,live:live.size});
   const decode=HTMLImageElement.prototype.decode,get=HTMLCanvasElement.prototype.getContext,toBlob=HTMLCanvasElement.prototype.toBlob;
   HTMLImageElement.prototype.decode=function(){if(window.qaPositionFailure==='decode')return Promise.reject(new Error('QA decode'));return decode.call(this)};
   HTMLCanvasElement.prototype.getContext=function(...args){if(window.qaPositionFailure==='context')return null;return get.apply(this,args)};
   HTMLCanvasElement.prototype.toBlob=function(callback,...args){if(window.qaPositionFailure==='blob'){callback(null);return}return toBlob.call(this,callback,...args)};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','Position recovery never uploads, saves or submits');
   if(p==='/api/v1/me/addresses')return route.fulfill({json:{version:0,items:[]}});
   if(p==='/api/v1/service-areas')return route.fulfill({json:{code:'HCM-DEMO-v1',localities:[]}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fsell');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const step=name=>page.getByRole('navigation',{name:'Các bước đăng sách',exact:true}).getByRole('button',{name});await expect(step(/Thông tin sách/)).toBeVisible();await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();await page.getByLabel('Tên sách',{exact:true}).fill('Tên giữ nguyên QA');await page.getByLabel('Tác giả',{exact:true}).fill('Tác giả QA');
  await page.getByRole('combobox',{name:'Danh mục sách',exact:true}).selectOption({label:'Sách khác'});await step(/Ảnh bản sách/).click();
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=90;return c.toDataURL('image/png').split(',')[1]}),'base64');
  const input=page.locator('#cover-file');await input.setInputFiles({name:'qa-cover.png',mimeType:'image/png',buffer:png});
  const original=page.getByRole('img',{name:'Ảnh bìa gốc đã chọn',exact:true});await expect(original).toBeVisible();const raw=await original.getAttribute('src');
  const slider=page.getByRole('slider',{name:'Kéo tùy chỉnh vị trí cắt',exact:true});await expect(slider).toHaveValue('50');
  await page.evaluate(mode=>{window.qaPositionFailure=mode},failure);await slider.press('End');
  const error=page.getByRole('alert').filter({hasText:failure==='decode'?/Không đọc được ảnh bìa/:failure==='context'?/Canvas 2D/:/tệp ảnh sau khi cắt/});
  await expect(error).toBeVisible();await expect(slider).toHaveValue(baseline?'100':'50');
  assert.equal(await original.getAttribute('src')===raw,true,'A failed reposition retains its original preview');
  assert.deepEqual(await page.evaluate(()=>window.qaPositionResources()),{created:2,revoked:0,live:2});
  await error.screenshot({path:path.join(out,`${baseline?'before':'after'}-${failure}-${width}.png`)});
  await page.evaluate(()=>{window.qaPositionFailure=undefined});await slider.press('Home');
  await expect.poll(async()=> (await page.evaluate(()=>window.qaPositionResources())).created).toBe(3);
  await slider.press('End');await expect.poll(async()=> (await page.evaluate(()=>window.qaPositionResources())).created).toBe(4);
  await expect(slider).toHaveValue('100');await expect(error).toHaveCount(baseline?1:0);
  // A later crop retry must not dismiss a different validation error.
  await input.setInputFiles({name:'qa-invalid.txt',mimeType:'text/plain',buffer:Buffer.from('QA')});
  const other=page.getByRole('alert').filter({hasText:/Ảnh cần là JPEG/});await expect(other).toBeVisible();
  await slider.press('Home');await expect.poll(async()=> (await page.evaluate(()=>window.qaPositionResources())).created).toBe(5);
  await expect(other).toBeVisible();await expect(slider).toHaveValue('0');
  const resources=await page.evaluate(()=>window.qaPositionResources());assert.deepEqual(resources,{created:5,revoked:3,live:2});
  assert.deepEqual(errors,[]);checks.push({width,failure,rolledBack:!baseline,retryClearsOwnError:!baseline,unrelatedErrorPreserved:true,resources});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
