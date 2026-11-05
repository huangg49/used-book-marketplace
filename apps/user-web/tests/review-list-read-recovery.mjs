// Production review transaction list: denied reads stay scoped; no review commands.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-review-list-read-recovery');await mkdir(out,{recursive:true});
const baseline=process.env.REVIEW_LIST_BASELINE==='1',origin='http://127.0.0.1:4257';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.REVIEW_LIST_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4257,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['initial','refresh','next-page'])for(const failure of [403,503]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],cursors=[];page.on('pageerror',error=>errors.push(error.message));let status=mode==='initial'?failure:200;
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No create/edit/delete/reply review commands');
   if(p==='/api/v1/me/review-transactions'){
    const cursor=url.searchParams.get('cursor');cursors.push(cursor);assert.equal(url.searchParams.get('limit'),'10');if(cursor)assert.equal(cursor,id(109));
    const type=url.searchParams.get('type');assert.ok(['Exchange','DirectOrder','PointOrder'].includes(type));
    return route.fulfill(status!==200?{status,json:{code:'QA_REVIEW_READ_FAILURE'}}:{json:{items:Array.from({length:cursor?1:10},(_,i)=>({transactionType:type,transactionId:id((cursor?110:100)+i),partnerId:id(50),partnerName:'Đối tác QA '+i,completedAt:new Date().toISOString()})),nextCursor:cursor?null:id(109),serverTime:new Date().toISOString()}});
   }
   if(p==='/api/v1/members/'+user.id+'/reputation')return route.fulfill({json:{userId:user.id,displayName:user.displayName,completedTransactions:0,verifiedViolations:0,reviewCount:0,partnerRatingCount:0,bookRatingCount:0,partnerRating:null,bookRating:null,items:[],nextCursor:null,serverTime:new Date().toISOString()}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/')||p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl='+encodeURIComponent('/reviews?tab=pending&type=Exchange'));await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const items=page.locator('#review-transaction-results article'),pager=page.getByRole('navigation',{name:'Điều hướng phân trang',exact:true}),tabs=page.getByRole('tablist',{name:'Chế độ xem đánh giá',exact:true});
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  if(mode!=='initial'){
   await expect(items).toHaveCount(10);status=failure;
   if(mode==='next-page')await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();
   else{await page.clock.setFixedTime(new Date(Date.now()+20000));await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));}
  }
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(items).toHaveCount(failure===403||mode==='initial'?0:10);
  await expect(tabs).toHaveCount(baseline&&failure===403?0:1);
  if(failure===403){
   await expect(pager).toHaveCount(0);
   if(baseline){
    await expect(page.getByRole('button',{name:'Thử lại',exact:true})).toHaveCount(0);
    if(width===390)await page.getByRole('button',{name:/Menu: Đánh giá của tôi/}).click();
    await page.getByRole('link',{name:'Đánh giá của tôi',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Phiên làm việc đã thay đổi',exact:true})).toBeVisible();await expect(tabs).toHaveCount(0);
   }else{
    await expect(page.getByRole('heading',{name:'Quyền xem giao dịch đã thay đổi',exact:true})).toBeVisible();
    await tabs.getByRole('tab',{name:/Hồ sơ uy tín của tôi/}).click();
    await expect(page.getByRole('heading',{name:user.displayName,exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(tabs.getByRole('tab',{name:/Hồ sơ uy tín của tôi/})).toHaveAttribute('aria-selected','true');
    await tabs.getByRole('tab',{name:'Giao dịch cần đánh giá',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(tabs.getByRole('tab',{name:'Giao dịch cần đánh giá',exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.getByRole('button',{name:'Thử lại',exact:true})).toBeEnabled();
    await expect(tabs.getByRole('tab',{name:'Giao dịch cần đánh giá',exact:true})).toHaveCSS('font-weight','800');
   }
  }
  if(width===390&&mode==='next-page'&&failure===403)await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${width}.png`)});
  if(width===1440&&mode==='next-page'&&failure===403)await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${width}.png`)});
  if(!(baseline&&failure===403)){
   status=200;const before=cursors.length,rootRetry=failure===403||mode!=='next-page';
   if(rootRetry)await page.getByRole('button',{name:'Thử lại',exact:true}).click();else await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();
   await expect(page.getByRole('alert')).toHaveCount(0);await expect(items).toHaveCount(rootRetry?10:1);assert.equal(cursors[before],rootRetry?null:id(109));
   if(rootRetry){await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(items).toHaveCount(1);}
   await page.getByRole('link',{name:'Đơn mua trực tiếp',exact:true}).click();await expect(items).toHaveCount(10);assert.equal(new URL(page.url()).searchParams.get('type'),'DirectOrder');
  }
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks.push({width,mode,failure,deniedScopedAndRecoverable:failure!==403||!baseline,readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
