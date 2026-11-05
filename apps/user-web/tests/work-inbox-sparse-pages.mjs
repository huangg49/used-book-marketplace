// Empty source pages are not the end of an inbox while nextCursor exists.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-work-inbox-sparse-pages');await mkdir(out,{recursive:true});
const baseline=process.env.WORK_SPARSE_BASELINE==='1',origin='http://127.0.0.1:4247';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.WORK_SPARSE_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4247,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['sparse','sparse-error','complete-empty','empty-after-refresh']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],reads=[];page.on('pageerror',e=>errors.push(e.message));let fail=mode==='sparse-error',empty=false;
  const item={id:id(100),target:'DirectOrder',targetId:id(200),sourceState:'Preparing',version:1,title:'Đơn việc QA',reason:'Chuẩn bị sách QA',attention:'Action',dueAt:null};
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No commands in sparse inbox fixture');
   if(p==='/api/v1/me/work-items'){
    const cursor=url.searchParams.get('cursor');reads.push(cursor);assert.equal(url.searchParams.get('lane'),'DirectOrders');assert.equal(url.searchParams.get('limit'),'5');
    if(fail&&cursor)return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
    const complete=mode==='complete-empty'||empty;
    return route.fulfill({json:{items:complete?[]:mode==='empty-after-refresh'||cursor===id(102)?[item]:[],nextCursor:complete||cursor===id(102)?null:cursor===id(101)?id(102):id(101),lane:'DirectOrders',serverTime:new Date().toISOString()}});
   }
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Faccount%2Fwork');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const inbox=page.getByRole('region',{name:'Việc đang chờ',exact:true}),more=inbox.getByRole('button',{name:'Xem thêm việc trong nhóm',exact:true}),finished=inbox.getByText(/^Chưa có việc trong nhóm này/);
  await expect(inbox).toBeVisible();await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});await expect.poll(()=>reads.length).toBe(1);
  if(mode==='empty-after-refresh'){
   await expect(inbox.locator('li')).toHaveCount(1);empty=true;await inbox.getByRole('button',{name:'Cập nhật',exact:true}).click();
   await expect(inbox.locator('li')).toHaveCount(0);await expect(finished).toBeVisible();await expect(more).toHaveCount(0);
  }else if(mode==='complete-empty'){
   await expect(finished).toBeVisible();await expect(more).toHaveCount(0);assert.equal(reads.length,1);
  }else{
   await expect(more).toBeVisible();await expect(finished).toHaveCount(baseline?1:0);
   if(!baseline)await expect(inbox.getByText('Chưa thấy việc trong dữ liệu đã tải. Bấm “Xem thêm việc trong nhóm” để kiểm tra những trang còn lại.',{exact:true})).toBeVisible();
   await inbox.screenshot({path:path.join(out,`${baseline?'before':'after'}-${mode}-${width}.png`)});
   assert.equal(reads.length,1,'Do not auto-scan or change the existing user-driven pagination');await more.click();
   if(mode==='sparse-error'){
    await expect(inbox.getByRole('alert')).toBeVisible();await expect(finished).toHaveCount(0);fail=false;
    await inbox.getByRole('button',{name:'Thử lại',exact:true}).click();
   }
   await expect.poll(()=>reads.length).toBe(mode==='sparse-error'?3:2);await expect(inbox.getByRole('alert')).toHaveCount(0);
   await expect(finished).toHaveCount(baseline?1:0);await expect(more).toBeVisible();await more.click();
   await expect(inbox.locator('li')).toHaveCount(1);await expect(finished).toHaveCount(0);await expect(more).toHaveCount(0);
   assert.equal(reads.at(-1),id(102));if(mode==='sparse-error')assert.equal(reads[1]===reads[2],true,'Sparse-page retry uses the same cursor');
  }
  assert.deepEqual(errors,[]);checks.push({width,mode,reads:reads.length,sparseScopeAccurate:!baseline||!mode.startsWith('sparse'),readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
