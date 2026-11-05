// Production /sell with deferred canvas responses, no upload or provider traffic.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-cover-crop-lifecycle');await mkdir(out,{recursive:true});
const baseline=process.env.COVER_LIFECYCLE_BASELINE==='1',origin='http://127.0.0.1:4237';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.COVER_LIFECYCLE_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4237,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['replacement','position','removed','unmounted']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{
   const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),live=new Map();let created=0,revoked=0;
   URL.createObjectURL=file=>{const url=create(file);if(file instanceof File&&file.name.startsWith('qa-')){created++;live.set(url,file.name)}return url};
   URL.revokeObjectURL=url=>{if(live.delete(url))revoked++;revoke(url)};
   window.qaCoverResources=()=>({created,revoked,live:live.size});window.qaCoverName=url=>live.get(url);
   window.qaCropGates=[];const toBlob=HTMLCanvasElement.prototype.toBlob;
   HTMLCanvasElement.prototype.toBlob=function(callback,...args){
    return toBlob.call(this,blob=>{if(window.qaHoldCrop)window.qaCropGates.push(()=>callback(blob));else callback(blob)},...args);
   };
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','Cover lifecycle never writes or uploads');
   if(p==='/api/v1/me/listings')return route.fulfill({json:{items:[],nextCursor:null}});
   if(p==='/api/v1/me/addresses')return route.fulfill({json:{version:0,items:[]}});
   if(p==='/api/v1/service-areas')return route.fulfill({json:{code:'HCM-DEMO-v1',localities:[]}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fmy-books');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('heading',{name:'Kệ sách đang trống',exact:true})).toBeVisible();
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await page.locator('main').getByRole('link',{name:'Đăng sách',exact:true}).click();
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();await page.getByLabel('Tên sách',{exact:true}).fill('Tên QA giữ khi crop chậm');
  await page.getByLabel('Tác giả',{exact:true}).fill('Tác giả QA');await page.getByRole('combobox',{name:'Danh mục sách',exact:true}).selectOption({label:'Sách khác'});
  await page.getByRole('navigation',{name:'Các bước đăng sách',exact:true}).getByRole('button',{name:/Ảnh bản sách/}).click();
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=90;return c.toDataURL('image/png').split(',')[1]}),'base64');
  const input=page.locator('#cover-file'),original=page.getByRole('img',{name:'Ảnh bìa gốc đã chọn',exact:true});
  const select=name=>input.setInputFiles({name,mimeType:'image/png',buffer:png});
  if(['position','removed'].includes(mode)){await select('qa-initial.png');await expect(original).toBeVisible();}
  await page.evaluate(()=>{window.qaHoldCrop=true});
  if(mode==='position'){
   await page.getByRole('button',{name:'Trái',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.qaCropGates.length)).toBe(1);
   await page.getByRole('button',{name:'Phải',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.qaCropGates.length)).toBe(2);
  }else{
   await select('qa-first.png');await expect.poll(()=>page.evaluate(()=>window.qaCropGates.length)).toBe(1);
   if(mode==='replacement'){await select('qa-latest.png');await expect.poll(()=>page.evaluate(()=>window.qaCropGates.length)).toBe(2);}
  }
  if(mode==='replacement'||mode==='position'){
   await page.evaluate(()=>window.qaCropGates[1]());
   if(mode==='replacement')await expect.poll(()=>original.getAttribute('src').then(url=>page.evaluate(url=>window.qaCoverName(url),url))).toBe('qa-latest.png');
   else await expect(page.getByRole('slider',{name:'Kéo tùy chỉnh vị trí cắt',exact:true})).toHaveValue('100');
   await page.evaluate(()=>window.qaCropGates[0]());
   if(mode==='replacement')await expect.poll(()=>original.getAttribute('src').then(url=>page.evaluate(url=>window.qaCoverName(url),url))).toBe(baseline?'qa-first.png':'qa-latest.png');
   else await expect(page.getByRole('slider',{name:'Kéo tùy chỉnh vị trí cắt',exact:true})).toHaveValue(baseline?'0':'100');
  }else if(mode==='removed'){
   await page.getByRole('button',{name:'Xóa ảnh bìa',exact:true}).click();await expect(original).toHaveCount(0);
   await page.evaluate(()=>window.qaCropGates[0]());await expect(original).toHaveCount(baseline?1:0);
  }else{
   await page.goBack();await expect(page.getByRole('dialog',{name:'Rời bàn đăng sách?',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Rời trang',exact:true}).click();await expect(page.getByRole('heading',{name:'Kệ sách đang trống',exact:true})).toBeVisible();
   await page.evaluate(()=>window.qaCropGates[0]());
  }
  const live=baseline?mode==='replacement'?4:mode==='position'?3:2:mode==='replacement'||mode==='position'?2:0;
  await expect.poll(async()=> (await page.evaluate(()=>window.qaCoverResources())).live).toBe(live);
  const resources=await page.evaluate(()=>window.qaCoverResources());assert.deepEqual(errors,[]);
  checks.push({width,mode,resources,latestIntentPreserved:!baseline});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
