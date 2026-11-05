// Production Member auction list read access. All-origin synthetic reads, no auction commands.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-my-auctions-read-access');await mkdir(out,{recursive:true});
const baseline=process.env.MY_AUCTIONS_BASELINE==='1',port=baseline?4263:4264,origin='http://127.0.0.1:'+port;
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.MY_AUCTIONS_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['initial-cursor','cached-cursor','cached-root'])for(const failure of [403,503]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],cursors=[];page.on('pageerror',error=>errors.push(error.message));let status=mode==='initial-cursor'?failure:200;
  const now=new Date().toISOString(),row=n=>({auction:{id:id(n),listingId:id(n+1000),title:'Phiên của tôi QA '+n,state:'Active',startPrice:100000,step:37000,buyNowPrice:null,currentPrice:null,minimumBid:100000,bidderCount:0,startAt:now,endAt:new Date(Date.now()+86400000).toISOString(),pointName:'Điểm QA',demoOnly:true,book:null},role:'Bidder',leading:false,won:false,needsPayment:false,paymentDeadline:null});
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No bid/cancel/pay/receive/intake commands');
   if(p==='/api/v1/me/auctions'){
    const cursor=url.searchParams.get('cursor');cursors.push(cursor);if(cursor)assert.equal(cursor,id(119));
    assert.equal(url.searchParams.get('limit'),'12');assert.equal(url.searchParams.get('view'),'active');
    return route.fulfill(status!==200?{status,json:{code:'QA_MY_AUCTIONS_FAILURE'}}:{json:{items:cursor?[row(120)]:[row(100),row(101)],nextCursor:cursor?null:id(119),serverTime:now}});
   }
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/')||p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  const target='/my-auctions?view=active'+(mode==='initial-cursor'?'&cursor='+id(119):'');
  await page.goto(origin+'/login?returnUrl='+encodeURIComponent(target));await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const results=page.locator('#my-auction-results'),cards=results.locator('article'),pager=page.getByRole('navigation',{name:'Trang đấu giá của tôi',exact:true});
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  if(mode!=='initial-cursor'){
   await expect(cards).toHaveCount(2);if(mode==='cached-cursor'){await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(cards).toHaveCount(1);}
   status=failure;await page.clock.setFixedTime(new Date(Date.now()+20000));await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  }
  await expect(results.getByRole('alert')).toBeVisible();const retained=failure===503&&mode!=='initial-cursor';
  await expect(cards).toHaveCount(retained?(mode==='cached-root'?2:1):0);
  await expect(pager).toHaveCount(mode==='cached-root'||!baseline&&failure===403?0:1);
  if(retained)await expect(results.getByRole('heading',{name:'Chưa làm mới được các phiên',exact:true})).toBeVisible();
  if(mode==='cached-cursor'&&failure===403){await results.getByRole('alert').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${width}.png`)});}
  status=200;const before=cursors.length;await results.getByRole('button',{name:'Thử lại',exact:true}).click();await expect(results.getByRole('alert')).toHaveCount(0);
  await expect(cards).toHaveCount(mode==='cached-root'?2:1);assert.equal(cursors[before],mode==='cached-root'?null:id(119));await expect(pager).toBeVisible();assert.equal(new URL(page.url()).searchParams.get('view'),'active');
  await pager.getByRole('button',{name:mode==='initial-cursor'?'Về trang đầu':mode==='cached-cursor'?'Đến trang trước':'Đến trang tiếp theo',exact:true}).click();
  await expect(cards).toHaveCount(mode==='cached-root'?1:2);await page.goBack();await expect(cards).toHaveCount(mode==='cached-root'?2:1);
  assert.deepEqual(errors,[]);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  checks.push({width,mode,failure,deniedPagerHidden:mode==='cached-root'||failure!==403||!baseline,temporaryCacheRetained:retained,currentCursorRetry:true,filterAndBackPreserved:true,readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
