// Actual Member work inbox, synthetic read-only backend and no obligation commands.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-work-inbox-read-access');await mkdir(out,{recursive:true});
const baseline=process.env.WORK_INBOX_BASELINE==='1',origin='http://127.0.0.1:4246';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.WORK_INBOX_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4246,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['refresh','next-page'])for(const failure of [403,503]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],reads=[];page.on('pageerror',e=>errors.push(e.message));let status=200;
  const item=(n,version=1)=>({id:id(n),target:'DirectOrder',targetId:id(n+100),sourceState:'Preparing',version,title:'Đơn việc QA '+n,reason:'Chờ chuẩn bị sách QA',attention:'Action',dueAt:null});
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','Only synthetic login and reads permitted');
   if(p==='/api/v1/me/work-items'){
    const cursor=url.searchParams.get('cursor');reads.push(cursor);assert.equal(url.searchParams.get('lane'),'DirectOrders');assert.equal(url.searchParams.get('limit'),'5');
    if(cursor)assert.equal(cursor,id(104));if(status!==200)return route.fulfill({status,json:{code:'QA_WORK_READ_FAILURE'}});
    return route.fulfill({json:{items:cursor?[item(104,2),item(105)]:Array.from({length:5},(_,i)=>item(100+i)),nextCursor:cursor?null:id(104),lane:'DirectOrders',serverTime:new Date().toISOString()}});
   }
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Faccount%2Fwork');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const inbox=page.getByRole('region',{name:'Việc đang chờ',exact:true}),more=inbox.getByRole('button',{name:'Xem thêm việc trong nhóm',exact:true});
  await expect(inbox.locator('li')).toHaveCount(5);await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  status=failure;
  if(mode==='refresh')await inbox.getByRole('button',{name:'Cập nhật',exact:true}).click();else await more.click();
  await expect(inbox.getByRole('alert')).toBeVisible();
  await expect(inbox.locator('li')).toHaveCount(failure===403?0:5);
  const denied=!baseline&&failure===403;
  await expect(more).toHaveCount(denied?0:1);await expect(inbox.getByText(/Theo trạng thái lúc/)).toHaveCount(denied?0:1);
  await expect(inbox.getByText(/^Chưa có việc trong nhóm này/)).toHaveCount(0);
  if(denied)await expect(inbox.getByText('Quyền xem nhóm việc đã thay đổi. Kiểm tra phiên đăng nhập và thử lại.',{exact:true})).toBeVisible();
  await inbox.screenshot({path:path.join(out,`${baseline?'before':'after'}-${mode}-${failure}-${width}.png`)});
  const before=reads.length;status=200;await inbox.getByRole('button',{name:'Thử lại',exact:true}).click();
  await expect(inbox.getByRole('alert')).toHaveCount(0);await expect(inbox.locator('li')).toHaveCount(mode==='next-page'&&!denied?6:5);
  if(mode==='next-page')assert.equal(reads[before],denied?null:id(104),'Denied recovery refetches root instead of continuing the old cursor');
  if(mode==='refresh'||denied){await more.click();await expect(inbox.locator('li')).toHaveCount(6);}
  await expect(more).toHaveCount(0);await expect(inbox.getByText(/Theo trạng thái lúc/)).toBeVisible();
  const first=inbox.getByRole('link',{name:'Mở Đơn việc QA 100',exact:true});await expect(first).toHaveAttribute('href','/orders/'+id(200));
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks.push({width,mode,failure,deniedMetadataHidden:denied,retryRoot:mode==='next-page'&&denied,deduped:true,readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
