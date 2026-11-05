// Production photo controls keep their target across repeated clicks and delayed chooser completion.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-listing-photo-identity');await mkdir(out,{recursive:true});
const baseline=process.env.PHOTO_IDENTITY_BASELINE==='1',origin='http://127.0.0.1:4243';
const cases=['cover-double','support-double','replacement-shift','target-removed','limit'];
const selectedCase=process.env.PHOTO_IDENTITY_CASE;
assert.equal(!selectedCase||cases.includes(selectedCase),true,'Unknown photo identity case');
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.PHOTO_IDENTITY_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4243,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of cases.filter(value=>!selectedCase||value===selectedCase)){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{
   const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),live=new Map(),all=[];let created=0,revoked=0;
   URL.createObjectURL=file=>{const url=create(file);if(file instanceof File&&file.name.startsWith('qa-')){created++;live.set(url,file);all.push(file)}return url};
   URL.revokeObjectURL=url=>{if(live.delete(url))revoked++;revoke(url)};
   window.qaPhotoName=url=>live.get(url)?.name;window.qaNamedPhotoCount=name=>[...live.values()].filter(file=>file.name===name).length;
   window.qaPhotoResources=()=>({created,revoked,live:live.size});
   window.qaExpectedPhotoHashes=async()=>Promise.all([all.filter(f=>f.name==='qa-cover.png')[1],all.find(f=>f.name==='qa-replacement.png'),all.find(f=>f.name==='qa-support-b.png')].map(async f=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')));
   const toBlob=HTMLCanvasElement.prototype.toBlob;window.qaPhotoGates=[];
   HTMLCanvasElement.prototype.toBlob=function(callback,...args){return toBlob.call(this,blob=>{if(window.qaHoldPhotoCrop)window.qaPhotoGates.push(()=>callback(blob));else callback(blob)},...args)};
  });
  const page=await context.newPage(),errors=[],uploadHashes=[];page.on('pageerror',e=>errors.push(e.message));let publishing=false;
  const counts={catalog:0,draft:0,media:0,bytes:0,finalize:0,save:0,submit:0};
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,m=request.method(),receipt=(entityId,version=1)=>route.fulfill({json:{entityId,version}});
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   if(p.startsWith('/api/v1/')&&m!=='GET')assert.equal(publishing,true,'Only the explicit final publication may write to fixtures');
   if(p==='/api/v1/catalog/requests'&&m==='POST'){counts.catalog++;return receipt(id(12));}
   if(p==='/api/v1/listings'&&m==='POST'){counts.draft++;return receipt(id(10));}
   if(p===`/api/v1/listings/${id(10)}/media`&&m==='POST'){counts.media++;uploadHashes.push(request.postDataJSON().sha256);return receipt(id(100+counts.media));}
   if(p.endsWith('/upload-ticket'))return route.fulfill({json:{path:'/qa-upload/'+p.split('/').at(-2),headers:{}}});
   if(p.startsWith('/api/v1/qa-upload/')&&m==='PUT'){counts.bytes++;return route.fulfill({json:null});}
   if(p.endsWith('/finalize')&&m==='POST'){counts.finalize++;return receipt(p.split('/').at(-2));}
   if(p.endsWith('/draft')&&m==='PUT'){counts.save++;return receipt(id(10),2);}
   if(p.endsWith('/submit')&&m==='POST'){counts.submit++;return receipt(id(10),3);}
   assert.equal(m,'GET','No unrelated commands');
   if(/^\/api\/v1\/me\/listings\/[^/]+\/media\/[^/]+$/.test(p))return route.fulfill({json:{id:p.split('/').at(-1),version:1,status:'Ready'}});
   if(p==='/api/v1/me/listings')return route.fulfill({json:{items:[],nextCursor:null}});
   if(p==='/api/v1/me/addresses')return route.fulfill({json:{version:0,items:[]}});
   if(p==='/api/v1/service-areas')return route.fulfill({json:{code:'HCM-DEMO-v1',localities:[]}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fmy-books');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Kệ sách đang trống',exact:true})).toBeVisible();await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await page.locator('main').getByRole('link',{name:'Đăng sách',exact:true}).click();const step=name=>page.getByRole('navigation',{name:'Các bước đăng sách',exact:true}).getByRole('button',{name});
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();await page.getByLabel('Tên sách',{exact:true}).fill('Sách QA định danh ảnh');await page.getByLabel('Tác giả',{exact:true}).fill('Tác giả QA');
  await page.getByRole('combobox',{name:'Danh mục sách',exact:true}).selectOption({label:'Sách khác'});await step(/Ảnh bản sách/).click();
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=90;return c.toDataURL('image/png').split(',')[1]}),'base64');
  const file=name=>({name,mimeType:'image/png',buffer:png}),support=page.getByRole('group',{name:'Ảnh phụ',exact:true});
  const names=()=>support.getByRole('img').evaluateAll(imgs=>imgs.map(img=>window.qaPhotoName(img.getAttribute('src'))));
  if(mode!=='replacement-shift'){await page.locator('#cover-file').setInputFiles(file('qa-cover.png'));await expect(page.getByRole('img',{name:'Ảnh bìa gốc đã chọn',exact:true})).toBeVisible();}
  if(mode==='limit'){
   const files=Array.from({length:8},(_,i)=>file('qa-support-'+i+'.png'));
   await page.locator('#support-images').setInputFiles(files);await expect(page.getByRole('alert').filter({hasText:/Tối đa 8 ảnh/})).toBeVisible();
   assert.equal((await page.evaluate(()=>window.qaPhotoResources())).created,2,'Rejected over-limit batch allocates no preview');
   await page.locator('#support-images').setInputFiles(files.slice(0,7));await expect(support.getByRole('img')).toHaveCount(7);
   await expect(page.getByLabel('Tệp ảnh phụ',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Thêm ảnh phụ',exact:true})).toHaveCount(0);
  }else{
   await page.locator('#support-images').setInputFiles([file('qa-support-a.png'),file('qa-support-b.png')]);await expect(support.getByRole('img')).toHaveCount(2);
   if(mode==='cover-double'||mode==='support-double'){
    const remove=page.getByRole('button',{name:mode==='cover-double'?'Xóa ảnh bìa':'Xóa ảnh phụ 1',exact:true});await remove.evaluate(button=>{button.click();button.click()});
    await expect.poll(names).toEqual(mode==='cover-double'?(baseline?['qa-support-b.png']:['qa-support-a.png','qa-support-b.png']):(baseline?[]:['qa-support-b.png']));
   }else{
    if(mode==='replacement-shift'){
     await page.evaluate(()=>{window.qaHoldPhotoCrop=true});await page.locator('#cover-file').setInputFiles(file('qa-cover.png'));await expect.poll(()=>page.evaluate(()=>window.qaPhotoGates.length)).toBe(1);
    }
    const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Thay ảnh phụ 1',exact:true}).click();const chooser=await chooserPromise;
    if(mode==='replacement-shift'){
     await page.evaluate(()=>window.qaPhotoGates[0]());await expect(page.getByRole('img',{name:'Ảnh bìa gốc đã chọn',exact:true})).toBeVisible();
    }else await page.getByRole('button',{name:'Xóa ảnh phụ 1',exact:true}).click();
    await chooser.setFiles(file('qa-replacement.png'));
    await expect.poll(names).toEqual(mode==='replacement-shift'?(baseline?['qa-support-a.png','qa-support-b.png']:['qa-replacement.png','qa-support-b.png']):(baseline?['qa-replacement.png']:['qa-support-b.png']));
    if(mode==='target-removed'&&!baseline){
     const error=page.getByRole('alert').filter({hasText:'Ảnh cần thay không còn trong bản nháp. Chọn lại ảnh muốn thay.'});
     await expect(error).toBeVisible();await error.screenshot({path:path.join(out,`after-target-removed-${width}.png`)});
    }
    if(mode==='replacement-shift'){
     assert.equal(await page.evaluate(()=>window.qaNamedPhotoCount('qa-cover.png')),baseline?1:2,'Replacing a shifted support photo must retain both cover URLs');
     const expected=await page.evaluate(()=>window.qaExpectedPhotoHashes());publishing=true;
     await step(/Tình trạng/).click();for(const label of ['Ruột sách','Bìa và gáy','Ghi chú, đánh dấu','Phụ kiện'])await page.getByLabel(label,{exact:true}).fill('Thông tin QA');
     await page.getByLabel('Mô tả chung',{exact:true}).fill('Mô tả QA đầy đủ cho sách kiểm ảnh đúng sau khi thay và đổi thứ tự.');
     for(const [key,index]of [['readable',0],['hasMissingPages',1],['missingEssentialContent',1]])await page.locator('input[name='+key+']').nth(index).locator('..').click();
     await step(/Bán hoặc đổi/).click();await page.getByRole('radio',{name:'Đổi sách',exact:true}).locator('..').click();await page.getByLabel('Giá trị đổi (VNĐ)',{exact:true}).fill('50000');
     await step(/Kiểm tra/).click();await page.getByLabel('Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.',{exact:true}).check();await page.getByRole('button',{name:'Gửi duyệt',exact:true}).click();
     await expect(page.getByRole('heading',{name:'Đã gửi duyệt',exact:true})).toBeVisible();assert.equal(uploadHashes.length===3&&uploadHashes.every((hash,i)=>hash===expected[i]),!baseline,'Uploaded bytes/order must match the cover and intended replacement');
    }
   }
  }
  await page.goBack();const leave=page.getByRole('dialog',{name:'Rời bàn đăng sách?',exact:true});if(await leave.isVisible())await leave.getByRole('button',{name:'Rời trang',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Kệ sách đang trống',exact:true})).toBeVisible();const resources=await page.evaluate(()=>window.qaPhotoResources());
  assert.equal(resources.live,baseline&&mode.endsWith('double')?1:0,'All remaining accepted previews release on leave');assert.deepEqual(errors,[]);
  checks.push({width,mode,resources,correctTarget:!baseline||mode==='limit',counts});await context.close();
 }
 await writeFile(path.join(out,(baseline?'before':'after')+(selectedCase?'-'+selectedCase:'')+'.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
