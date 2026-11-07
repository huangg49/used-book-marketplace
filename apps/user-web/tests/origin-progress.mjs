// Production /sell progress follows origin edits and successful reference-data refetches.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-origin-progress');await mkdir(out,{recursive:true});
const baseline=process.env.ORIGIN_PROGRESS_BASELINE==='1',origin='http://127.0.0.1:4238';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.ORIGIN_PROGRESS_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4238,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['saved','manual','address-refetch','area-refetch']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let keepAddress=true,keepArea=true,addressReads=0,areaReads=0;
  const address={id:id(20),version:1,recipientName:'Người gửi QA',phone:'0900000000',serviceAreaCode:'HCM-DEMO-v1',localityCode:'HCM-QA',detail:'Địa chỉ mô phỏng QA',isDefault:true};
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','Origin progress never saves addresses or listings');
   if(p==='/api/v1/me/addresses'){addressReads++;return route.fulfill({json:{version:1,items:keepAddress?[address]:[]}});}
   if(p==='/api/v1/service-areas'){areaReads++;return route.fulfill({json:{code:'HCM-DEMO-v1',localities:keepArea?[{code:'HCM-QA',label:'Khu vực QA'}]:[]}});}
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fsell');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('navigation',{name:'Các bước đăng sách',exact:true})).toBeVisible();
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();await page.getByLabel('Tên sách',{exact:true}).fill('Tên giữ nguyên QA');
  await page.getByLabel('Tác giả',{exact:true}).fill('Tác giả QA');await page.getByRole('combobox',{name:'Danh mục sách',exact:true}).selectOption({label:'Sách khác'});
  await page.getByRole('navigation',{name:'Các bước đăng sách',exact:true}).getByRole('button',{name:/Bán hoặc đổi/}).click();
  const price=page.getByLabel('Giá bán (VNĐ)',{exact:true});await price.fill('50000');
  const progress=page.getByRole('progressbar',{name:/^Tiến độ hoàn thiện/});
  const count=async()=>Number((await progress.getAttribute('aria-label')).match(/\((\d+) trên/)[1]);
  const initial=await count();await page.getByRole('button',{name:'Thêm nơi gửi sách',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Nơi gửi sách',exact:true});await expect(dialog).toBeVisible();
  if(mode==='saved'||mode==='address-refetch')await dialog.getByLabel('Địa chỉ đã lưu',{exact:true}).selectOption(id(20));
  else{
   await dialog.getByLabel('Họ tên người gửi',{exact:true}).fill('Người gửi QA');await dialog.getByLabel('Số điện thoại người gửi',{exact:true}).fill('0900000000');
   await dialog.getByLabel('Khu vực luân chuyển sách',{exact:true}).selectOption('HCM-QA');await dialog.getByLabel('Địa chỉ chi tiết',{exact:true}).fill('Địa chỉ mô phỏng QA');
  }
  await expect.poll(count).toBe(initial+(baseline?0:1));
  if(mode==='manual'){
   await dialog.getByLabel('Số điện thoại người gửi',{exact:true}).fill('09');await expect.poll(count).toBe(initial);
   await dialog.getByLabel('Số điện thoại người gửi',{exact:true}).fill('0900000000');await expect.poll(count).toBe(initial+(baseline?0:1));
  }
  await dialog.getByRole('button',{name:'Dùng nơi gửi này',exact:true}).click();await expect(dialog).not.toBeVisible();
  if(mode.endsWith('refetch')){
   // Establish an up-to-date memo on both builds, then change server data only.
   await price.fill('51000');await expect.poll(count).toBe(initial+1);
   const before=mode==='address-refetch'?addressReads:areaReads;
   if(mode==='address-refetch')keepAddress=false;else keepArea=false;
   await page.clock.setFixedTime(new Date(Date.now()+20000));
   await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
   await expect.poll(()=>mode==='address-refetch'?addressReads:areaReads).toBeGreaterThan(before);
   await expect(page.getByRole('button',{name:'Thêm nơi gửi sách',exact:true})).toBeVisible();
   await expect.poll(count).toBe(initial+(baseline?1:0));
  }else if(mode==='saved'){
   await page.getByRole('button',{name:'Đổi nơi gửi sách',exact:true}).click();await dialog.getByLabel('Địa chỉ đã lưu',{exact:true}).selectOption('');
   await expect.poll(count).toBe(initial);
  }
  assert.deepEqual(errors,[]);checks.push({width,mode,initial,final:await count(),progressCurrent:!baseline,addressReads,areaReads});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
