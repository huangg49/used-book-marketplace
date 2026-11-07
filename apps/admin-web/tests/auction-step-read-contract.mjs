// Production Staff/Admin auction queues. All-origin read fixtures, no commands or DB.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/operations-web-auction-step-read-contract');await mkdir(out,{recursive:true});
const baseline=process.env.OPERATIONS_STEP_BASELINE==='1',origin='http://127.0.0.1:4254';
const server=await preview({configFile:false,root:path.join(root,'apps/admin-web'),build:{outDir:path.resolve(root,process.env.OPERATIONS_STEP_BUILD??'apps/admin-web/dist')},preview:{host:'127.0.0.1',port:4254,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const group of ['legacy','custom'])for(const queue of ['intakes','auctions']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));let reads=0;
  const user={id:id(1),displayName:'Vận hành QA',email:'operator@example.test',roles:[queue==='intakes'?'STAFF':'ADMIN'],status:'ACTIVE'};
  const now=new Date().toISOString(),steps=group==='legacy'?[10000,50000]:[1000,20000,37000,100000,10000000,10000,50000];
  const items=steps.map((step,i)=>queue==='auctions'?{id:id(100+i),version:1,title:'Phiên QA bước '+step,state:'Active',startPrice:100000,step,currentPrice:null,bidderCount:0,startAt:now,endAt:new Date(Date.now()+86400000).toISOString(),pointName:'Điểm QA'}:{id:id(200+i),contextId:id(300+i),listingId:id(400+i),listingRevisionId:id(500+i),title:'Lần gửi QA bước '+step,pointId:id(20),startPrice:100000,step,buyNowPrice:null,protectiveValue:100000,state:'AwaitingDropoff',version:1,createdAt:now,dropoffDeadline:now,receivedAt:null,shelfCode:null,inspectedAt:null,inspectionOutcome:null,inspectionNote:null,auctionId:null,reclaimReason:null,closedAt:null,evidenceRequestedBy:null,evidenceDeadline:null,evidenceNote:null,evidenceSubmittedAt:null,reclaimRequiredAt:null,inspectionDueAt:null,reclaimDueAt:null,reports:[]});
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No Staff/Admin receive, inspection or cancel commands');
   if(p==='/api/v1/auth/me')return route.fulfill({json:user});
   if(p==='/api/v1/operations/'+(queue==='intakes'?'auction-intakes':'auctions')){reads++;return route.fulfill({json:{items,serverTime:now}});}
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/operations/'+queue);await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.getByRole('heading',{name:queue==='intakes'?'Sách gửi đấu giá.':'Phiên đang mở hoặc tạm giữ.',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Cập nhật danh sách',exact:true})).toBeEnabled();
  const rejected=baseline&&group==='custom';await expect(page.locator('article.queue-row')).toHaveCount(rejected?0:steps.length);
  await expect(page.getByRole('alert')).toHaveCount(rejected?1:0);
  if(!rejected){
   await expect(page.locator('article.queue-row').first()).toContainText(steps[0].toLocaleString('vi-VN'));
   await expect(page.getByRole('button',{name:queue==='intakes'?'Nhận sách':'Hủy phiên',exact:true})).toHaveCount(steps.length);
   await page.getByRole('button',{name:'Cập nhật danh sách',exact:true}).click();await expect.poll(()=>reads).toBe(2);await expect(page.locator('article.queue-row')).toHaveCount(steps.length);
  }
  if(group==='custom')await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${queue}-${width}.png`)});
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks.push({width,group,queue,role:user.roles[0],contractAccepted:!rejected,readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
