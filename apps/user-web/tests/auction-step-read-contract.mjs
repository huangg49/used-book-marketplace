// Production auction reads with ADR0068 legacy/preset/custom steps; no auction commands.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-auction-step-read-contract');await mkdir(out,{recursive:true});
const baseline=process.env.AUCTION_STEP_BASELINE==='1',origin='http://127.0.0.1:4253';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.AUCTION_STEP_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4253,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const group of ['legacy','custom'])for(const journey of ['shelf','detail','mine','focus']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],reads=[];page.on('pageerror',error=>errors.push(error.message));
  const now=new Date().toISOString(),steps=group==='legacy'?[10000,50000]:[1000,20000,37000,100000,10000000,10000,50000];
  const auctions=steps.map((step,i)=>({id:id(100+i),listingId:id(200+i),title:'Phiên QA bước '+step,state:'Active',startPrice:100000,step,buyNowPrice:null,currentPrice:null,minimumBid:100000,bidderCount:0,startAt:now,endAt:new Date(Date.now()+86400000).toISOString(),pointName:'Điểm QA',demoOnly:true,book:null}));
  const intakes=steps.map((step,i)=>({id:id(300+i),auctionId:null,state:'AwaitingDropoff',version:1,listingId:id(400+i),title:'Lần gửi QA bước '+step,pointId:id(20),startPrice:100000,step,buyNowPrice:null,protectiveValue:100000,createdAt:now,dropoffDeadline:new Date(Date.now()+259200000).toISOString(),receivedAt:null,inspectedAt:null,inspectionOutcome:null,inspectionNote:null,reclaimReason:null,closedAt:null,evidenceDeadline:null,evidenceNote:null,evidenceSubmittedAt:null}));
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','Only synthetic login and auction reads; no bid/intake/payment commands');
   reads.push(p);
   if(p==='/api/v1/auctions')return route.fulfill({json:{items:url.searchParams.get('phase')==='upcoming'?[]:auctions,serverTime:now}});
   if(p==='/api/v1/auctions/'+id(100))return route.fulfill({json:{auction:auctions[0],history:[],leaderAlias:null,serverTime:now}});
   if(p==='/api/v1/me/auctions')return route.fulfill({json:{items:auctions.map(auction=>({auction,role:'Seller',leading:false,won:false,needsPayment:false,paymentDeadline:null})),nextCursor:null,serverTime:now}});
   if(p==='/api/v1/me/auction-intakes')return route.fulfill({json:{items:intakes}});
   if(p==='/api/v1/me/auction-intakes/'+id(300))return route.fulfill({json:intakes[0]});
   if(p==='/api/v1/handover-points')return route.fulfill({json:{items:[]}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   if(p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_NO_REALTIME'}});
   return url.origin===origin?route.continue():route.abort();
  });
  const target=journey==='shelf'?'/auctions':journey==='detail'?'/auctions/'+id(100):'/my-auctions'+(journey==='focus'?'?intakeId='+id(300):'');
  if(journey==='mine'||journey==='focus'){
   await page.goto(origin+'/login?returnUrl='+encodeURIComponent(target));await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  }else await page.goto(origin+target);
  const rejected=baseline&&group==='custom';
  if(journey==='shelf'){
   await expect(page.locator('article[data-auction-id]')).toHaveCount(rejected?0:steps.length);
   await expect(page.getByRole('heading',{name:'Chưa tải được danh sách phiên',exact:true})).toHaveCount(rejected?1:0);
  }else if(journey==='detail'){
   await expect(page.getByRole('heading',{name:rejected?'Chưa tải được phiên đấu giá':auctions[0].title,exact:true})).toBeVisible();
   if(!rejected)await expect(page.locator('dt').filter({hasText:'Bước giá'}).locator('..')).toContainText(steps[0].toLocaleString('vi-VN'));
  }else{
   await expect(page.locator('#my-auction-results article')).toHaveCount(rejected?0:steps.length);
   await expect(page.getByText('Chưa tải được sách đang chờ mở phiên.',{exact:true})).toHaveCount(rejected?1:0);
   if(!rejected){
    const region=page.getByRole('region',{name:journey==='focus'?'Lần gửi sách của bạn':'Sách chờ đăng phiên',exact:true});
    await expect(region.locator('li')).toHaveCount(journey==='focus'?1:steps.length);
    await expect(region).toContainText('Lần gửi QA bước '+steps[0]);
    await expect(region).toContainText(steps[0].toLocaleString('vi-VN'));
   }
  }
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  if(group==='custom'&&(journey==='shelf'||journey==='focus'))await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${journey}-${width}.png`)});
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks.push({width,group,journey,contractAccepted:!rejected,readOnly:true,readCount:reads.filter(p=>p.startsWith('/api/v1/')).length});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
