// Production publishing -> post another. All commands/storage are synthetic fixtures.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-listing-restart-previews');await mkdir(out,{recursive:true});
const baseline=process.env.LISTING_RESTART_BASELINE==='1',origin='http://127.0.0.1:4239';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.LISTING_RESTART_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4239,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['success','lost-ack','pending-crop']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{
   const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),live=new Set();let created=0,revoked=0;
   URL.createObjectURL=file=>{const url=create(file);if(file instanceof File&&file.name.startsWith('qa-')){created++;live.add(url)}return url};
   URL.revokeObjectURL=url=>{if(live.delete(url))revoked++;revoke(url)};window.qaRestartResources=()=>({created,revoked,live:live.size});
   const toBlob=HTMLCanvasElement.prototype.toBlob;window.qaRestartGates=[];
   HTMLCanvasElement.prototype.toBlob=function(callback,...args){return toBlob.call(this,blob=>{if(window.qaHoldRestartCrop)window.qaRestartGates.push(()=>callback(blob));else callback(blob)},...args)};
  });
  const page=await context.newPage(),errors=[],submissions=[];page.on('pageerror',e=>errors.push(e.message));
  const counts={catalog:0,draft:0,media:0,bytes:0,finalize:0,save:0};
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,m=request.method();
   const receipt=(entityId,version=1)=>route.fulfill({json:{entityId,version}});
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   if(p==='/api/v1/catalog/requests'&&m==='POST'){counts.catalog++;return receipt(id(12));}
   if(p==='/api/v1/listings'&&m==='POST'){counts.draft++;return receipt(id(10));}
   if(p===`/api/v1/listings/${id(10)}/media`&&m==='POST'){counts.media++;return receipt(id(13));}
   if(p.endsWith(`/media/${id(13)}/upload-ticket`))return route.fulfill({json:{path:'/qa-upload',headers:{}}});
   if(p==='/api/v1/qa-upload'&&m==='PUT'){counts.bytes++;return route.fulfill({json:null});}
   if(p.endsWith(`/media/${id(13)}/finalize`)&&m==='POST'){counts.finalize++;return receipt(id(13));}
   if(p===`/api/v1/listings/${id(10)}/draft`&&m==='PUT'){counts.save++;return receipt(id(10),2);}
   if(p===`/api/v1/listings/${id(10)}/submit`&&m==='POST'){
    submissions.push({key:request.headers()['idempotency-key'],body:request.postData()});
    if(mode==='lost-ack'&&submissions.length===1)return route.abort('failed');return receipt(id(10),3);
   }
   assert.equal(m,'GET','Only current synthetic publishing commands are permitted');
   if(p===`/api/v1/me/listings/${id(10)}/media/${id(13)}`)return route.fulfill({json:{id:id(13),version:1,status:'Ready'}});
   if(p==='/api/v1/me/addresses')return route.fulfill({json:{version:0,items:[]}});
   if(p==='/api/v1/service-areas')return route.fulfill({json:{code:'HCM-DEMO-v1',localities:[]}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fsell');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();const step=name=>page.getByRole('navigation',{name:'Các bước đăng sách',exact:true}).getByRole('button',{name});
  await expect(step(/Thông tin sách/)).toBeVisible();await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();await page.getByLabel('Tên sách',{exact:true}).fill('Sách QA reset ảnh');await page.getByLabel('Tác giả',{exact:true}).fill('Tác giả QA');
  await page.getByRole('combobox',{name:'Danh mục sách',exact:true}).selectOption({label:'Sách khác'});await step(/Ảnh bản sách/).click();
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=120;return c.toDataURL('image/png').split(',')[1]}),'base64');
  await page.locator('#cover-file').setInputFiles({name:'qa-cover.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('img',{name:'Ảnh bìa gốc đã chọn',exact:true})).toBeVisible();
  if(mode==='pending-crop'){
   await page.evaluate(()=>{window.qaHoldRestartCrop=true});await page.locator('#cover-file').setInputFiles({name:'qa-pending.png',mimeType:'image/png',buffer:png});
   await expect.poll(()=>page.evaluate(()=>window.qaRestartGates.length)).toBe(1);
   if(!baseline){
    // Current work must settle before submit. Keep an older crop pending instead.
    await page.locator('#cover-file').setInputFiles({name:'qa-latest.png',mimeType:'image/png',buffer:png});
    await expect.poll(()=>page.evaluate(()=>window.qaRestartGates.length)).toBe(2);
    await page.evaluate(()=>window.qaRestartGates[1]());
   }
  }
  await step(/Tình trạng/).click();for(const label of ['Ruột sách','Bìa và gáy','Ghi chú, đánh dấu','Phụ kiện'])await page.getByLabel(label,{exact:true}).fill('Thông tin QA');
  await page.getByLabel('Mô tả chung',{exact:true}).fill('Mô tả QA đầy đủ cho sách kiểm reset ảnh sau khi gửi duyệt.');
  for(const [name,index]of [['readable',0],['hasMissingPages',1],['missingEssentialContent',1]])await page.locator('input[name='+name+']').nth(index).locator('..').click();
  await step(/Bán hoặc đổi/).click();await page.getByRole('radio',{name:'Đổi sách',exact:true}).locator('..').click();await page.getByLabel('Giá trị đổi (VNĐ)',{exact:true}).fill('50000');
  await step(/Kiểm tra/).click();await page.getByLabel('Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.',{exact:true}).check();await page.getByRole('button',{name:'Gửi duyệt',exact:true}).click();
  if(mode==='lost-ack'){
   await expect(page.getByRole('button',{name:'Thử gửi lại',exact:true})).toBeVisible();await page.getByRole('button',{name:'Thử gửi lại',exact:true}).click();
   assert.equal(submissions.length,2);assert.equal(Boolean(submissions[0].key)&&submissions[0].key===submissions[1].key&&submissions[0].body===submissions[1].body,true,'Submit retry keeps exact intent');
  }
  await expect(page.getByRole('heading',{name:'Đã gửi duyệt',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Đăng cuốn khác',exact:true}).click();await expect(step(/Thông tin sách/)).toBeVisible();
  if(mode==='pending-crop')await page.evaluate(()=>window.qaRestartGates[0]());
  await expect.poll(async()=> (await page.evaluate(()=>window.qaRestartResources())).live).toBe(baseline?(mode==='pending-crop'?2:1):0);
  const resources=await page.evaluate(()=>window.qaRestartResources());
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();await expect(page.getByLabel('Tên sách',{exact:true})).toHaveValue('');
  for(const stage of Object.keys(counts))assert.equal(counts[stage],1,'Restart does not repeat the previous publishing stages');
  assert.deepEqual(errors,[]);checks.push({width,mode,resources,counts,restartedClean:!baseline});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
