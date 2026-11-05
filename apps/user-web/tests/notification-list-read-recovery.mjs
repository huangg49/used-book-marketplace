// Production notification paging recovery; all HTTP read fixtures, no mark-read writes.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-notification-list-read-recovery');await mkdir(out,{recursive:true});
const baseline=process.env.NOTIFICATION_LIST_BASELINE==='1',port=baseline?4259:4260,origin='http://127.0.0.1:'+port;
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.NOTIFICATION_LIST_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const samples=[...['refresh','next-page'].flatMap(mode=>[403,404,503].map(failure=>({mode,failure}))),{mode:'sparse',failure:0}];
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const sample of samples){
  const {mode,failure}=sample,context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],cursors=[];page.on('pageerror',error=>errors.push(error.message));let status=200;
  const now=new Date().toISOString(),rows=(start,count)=>Array.from({length:count},(_,i)=>({id:id(start+i),kind:'SupportUpdated',title:'Thông báo QA '+(start+i),body:'Nội dung thông báo QA',targetType:'SupportCase',targetId:id(50),createdAt:now,readAt:mode==='sparse'&&start===100?now:null}));
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No mark-read or support mutation commands');
   if(p==='/api/v1/me/notifications'){
    if(url.searchParams.get('limit')==='8')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:mode==='sparse'?1:31}});
    assert.equal(url.searchParams.get('limit'),'30');const cursor=url.searchParams.get('cursor');cursors.push(cursor);if(cursor)assert.equal(cursor,id(129));
    return route.fulfill(status!==200?{status,json:{code:'QA_NOTIFICATION_READ_FAILURE'}}:{json:{items:cursor?rows(130,1):rows(100,30),nextCursor:cursor?null:id(129),unreadCount:mode==='sparse'?1:31}});
   }
   if(p.startsWith('/api/v1/')||p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fnotifications');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const items=page.locator('#notification-results > li'),pager=page.getByRole('navigation',{name:'Điều hướng phân trang',exact:true});await expect(items).toHaveCount(10);await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  if(mode==='sparse'){
   await page.getByRole('tab',{name:/^Chưa đọc/}).click();await expect(items).toHaveCount(0);
   await expect(page.getByRole('heading',{name:'Chưa thấy thông báo phù hợp trong dữ liệu đã tải',exact:true})).toBeVisible();
   await expect(page.getByRole('heading',{name:'Không có thông báo chưa đọc',exact:true})).toHaveCount(0);
   await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(items).toHaveCount(1);
   await expect(page.getByRole('heading',{name:'Thông báo QA 130',exact:true})).toBeVisible();
  }else{
   await pager.getByRole('button',{name:'Trang 3',exact:true}).click();await expect(items.first()).toContainText('Thông báo QA 120');status=failure;
   if(mode==='next-page')await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();
   else await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
   await expect(page.getByRole('alert')).toHaveCount(1);const denied=failure!==503;
   await expect(items).toHaveCount(denied?0:10);await expect(pager).toHaveCount(denied?0:1);
   if(!baseline&&denied)await expect(page.getByRole('alert')).toContainText('Kiểm tra phiên đăng nhập hoặc thử lại sau.');
   if(mode==='next-page'&&failure===403)await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${width}.png`)});
   status=200;const before=cursors.length,rootRetry=denied||mode==='refresh';
   if(rootRetry)await page.getByRole('button',{name:'Thử tải lại',exact:true}).click();else await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();
   await expect(items).toHaveCount(rootRetry?10:1);await expect(pager).toBeVisible();
   await expect(page.getByRole('alert')).toHaveCount(baseline&&denied&&mode==='next-page'?1:0);
   assert.equal(cursors[before],rootRetry?null:id(129));
   if(rootRetry){await expect(items.first()).toContainText('Thông báo QA 120');await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(items).toHaveCount(1);}
   await expect(page.getByRole('alert')).toHaveCount(0);
  }
  assert.deepEqual(errors,[]);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  checks.push({width,...sample,readRecoveryCorrect:!baseline||mode!=='next-page'||failure===503,sparseCopyUnchanged:mode==='sparse',readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
