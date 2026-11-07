// Production /sell: do not upload a previous crop while the current one is pending.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-cover-crop-submit-guard');await mkdir(out,{recursive:true});
const baseline=process.env.CROP_SUBMIT_BASELINE==='1',origin='http://127.0.0.1:4241';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.CROP_SUBMIT_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4241,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['replace','position','obsolete-pending','current-failure']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{
   let latest;const create=URL.createObjectURL.bind(URL);URL.createObjectURL=file=>{if(file instanceof File&&file.name.startsWith('qa-'))latest=file;return create(file)};
   window.qaLatestCropHash=async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await latest.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
   const toBlob=HTMLCanvasElement.prototype.toBlob;window.qaSubmitCropGates=[];
   HTMLCanvasElement.prototype.toBlob=function(callback,...args){return toBlob.call(this,blob=>{if(window.qaHoldSubmitCrop)window.qaSubmitCropGates.push((fail=false)=>callback(fail?null:blob));else callback(blob)},...args)};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let reservedHash;
  const counts={catalog:0,draft:0,media:0,bytes:0,finalize:0,save:0,submit:0};
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,m=request.method(),receipt=(entityId,version=1)=>route.fulfill({json:{entityId,version}});
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   if(p==='/api/v1/catalog/requests'&&m==='POST'){counts.catalog++;return receipt(id(12));}
   if(p==='/api/v1/listings'&&m==='POST'){counts.draft++;return receipt(id(10));}
   if(p===`/api/v1/listings/${id(10)}/media`&&m==='POST'){counts.media++;reservedHash=request.postDataJSON().sha256;return receipt(id(13));}
   if(p.endsWith('/upload-ticket'))return route.fulfill({json:{path:'/qa-upload',headers:{}}});
   if(p==='/api/v1/qa-upload'&&m==='PUT'){counts.bytes++;return route.fulfill({json:null});}
   if(p.endsWith('/finalize')&&m==='POST'){counts.finalize++;return receipt(id(13));}
   if(p.endsWith('/draft')&&m==='PUT'){counts.save++;return receipt(id(10),2);}
   if(p.endsWith('/submit')&&m==='POST'){counts.submit++;return receipt(id(10),3);}
   assert.equal(m,'GET','Only current synthetic publishing commands permitted');
   if(p===`/api/v1/me/listings/${id(10)}/media/${id(13)}`)return route.fulfill({json:{id:id(13),version:1,status:'Ready'}});
   if(p==='/api/v1/me/addresses')return route.fulfill({json:{version:0,items:[]}});
   if(p==='/api/v1/service-areas')return route.fulfill({json:{code:'HCM-DEMO-v1',localities:[]}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fsell');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const step=name=>page.getByRole('navigation',{name:'Các bước đăng sách',exact:true}).getByRole('button',{name});await expect(step(/Thông tin sách/)).toBeVisible();await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();await page.getByLabel('Tên sách',{exact:true}).fill('Sách QA chờ crop');await page.getByLabel('Tác giả',{exact:true}).fill('Tác giả QA');
  await page.getByRole('combobox',{name:'Danh mục sách',exact:true}).selectOption({label:'Sách khác'});await step(/Ảnh bản sách/).click();
  const png=async variant=>Buffer.from(await page.evaluate(variant=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,160,0);g.addColorStop(0,variant?'red':'black');g.addColorStop(1,variant?'green':'blue');x.fillStyle=g;x.fillRect(0,0,160,90);return c.toDataURL('image/png').split(',')[1]},variant),'base64');
  const oldPng=await png(0),newPng=await png(1),input=page.locator('#cover-file');
  await input.setInputFiles({name:'qa-original.png',mimeType:'image/png',buffer:oldPng});await expect(page.getByRole('img',{name:'Ảnh bìa gốc đã chọn',exact:true})).toBeVisible();
  let expectedHash=await page.evaluate(()=>window.qaLatestCropHash());
  await page.evaluate(()=>{window.qaHoldSubmitCrop=true});
  if(mode==='position')await page.getByRole('button',{name:'Phải',exact:true}).click();else await input.setInputFiles({name:'qa-current.png',mimeType:'image/png',buffer:newPng});
  await expect.poll(()=>page.evaluate(()=>window.qaSubmitCropGates.length)).toBe(1);
  if(mode==='obsolete-pending'){
   await input.setInputFiles({name:'qa-latest.png',mimeType:'image/png',buffer:oldPng});await expect.poll(()=>page.evaluate(()=>window.qaSubmitCropGates.length)).toBe(2);
   await page.evaluate(()=>window.qaSubmitCropGates[1]());await page.waitForTimeout(100);expectedHash=await page.evaluate(()=>window.qaLatestCropHash());
  }
  await step(/Tình trạng/).click();for(const label of ['Ruột sách','Bìa và gáy','Ghi chú, đánh dấu','Phụ kiện'])await page.getByLabel(label,{exact:true}).fill('Thông tin QA');
  await page.getByLabel('Mô tả chung',{exact:true}).fill('Mô tả QA đầy đủ cho sách kiểm gửi đúng ảnh cắt sau khi xử lý.');
  for(const [key,index]of [['readable',0],['hasMissingPages',1],['missingEssentialContent',1]])await page.locator('input[name='+key+']').nth(index).locator('..').click();
  await step(/Bán hoặc đổi/).click();await page.getByRole('radio',{name:'Đổi sách',exact:true}).locator('..').click();await page.getByLabel('Giá trị đổi (VNĐ)',{exact:true}).fill('50000');
  await step(/Kiểm tra/).click();await page.getByLabel('Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.',{exact:true}).check();const submit=page.getByRole('button',{name:'Gửi duyệt',exact:true});
  if(!baseline&&mode!=='obsolete-pending'){
   await expect(submit).toBeDisabled();await expect(page.getByText('Đang xử lý ảnh bìa. Chờ ảnh hoàn tất rồi kiểm tra lại trước khi gửi.',{exact:true})).toBeVisible();
   if(mode==='replace')await page.getByText('Đang xử lý ảnh bìa. Chờ ảnh hoàn tất rồi kiểm tra lại trước khi gửi.',{exact:true}).screenshot({path:path.join(out,`after-pending-${width}.png`)});
   await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   assert.equal(Object.values(counts).every(count=>count===0),true,'A pending current crop must not create publishing commands');
  }else await expect(submit).toBeEnabled();
  if(baseline||mode==='obsolete-pending'){
   await submit.click();await expect(page.getByRole('heading',{name:'Đã gửi duyệt',exact:true})).toBeVisible();
  }
  await page.evaluate(fail=>window.qaSubmitCropGates[0](fail),mode==='current-failure');
  await page.waitForTimeout(100);
  if(mode==='replace'||mode==='position')expectedHash=await page.evaluate(()=>window.qaLatestCropHash());
  if(!baseline&&mode!=='obsolete-pending'){
   await expect(submit).toBeEnabled();await submit.click();await expect(page.getByRole('heading',{name:'Đã gửi duyệt',exact:true})).toBeVisible();
  }
  const correct=reservedHash===expectedHash;assert.equal(correct,!baseline||['obsolete-pending','current-failure'].includes(mode),'Publishing must use the current accepted crop bytes');
  for(const stage of Object.keys(counts))assert.equal(counts[stage],1,'One publishing attempt after crop settles');
  assert.deepEqual(errors,[]);checks.push({width,mode,publishedCurrentCrop:correct,guarded:!baseline,counts});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
