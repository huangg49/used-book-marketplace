// Actual inbox; fail the public book read without breaking the conversation itself.
import assert from 'node:assert/strict';import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-chat-listing-read-recovery');await mkdir(out,{recursive:true});
const baseline=process.env.CHAT_LISTING_BASELINE==='1',origin='http://127.0.0.1:4245';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.CHAT_LISTING_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4245,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),now=new Date().toISOString();
const buyer={id:id(1),displayName:'Bạn mua QA'},seller={id:id(2),displayName:'Bạn bán QA'};
const room={id:id(10),listingId:id(100),buyer,seller,version:1,status:'Active',expiresAt:null,hasQuote:false,quotePreview:null,orderId:null,
 createdAt:now,closedAt:null,terms:{mode:'Negotiation',pendingProposal:null,agreedPrice:null,agreedListingRevisionId:null,activeExchangeId:null,exchangeIds:[],locked:false}};
const book={id:id(100),revisionId:id(200),version:1,book:{id:id(300),title:'Sách hội thoại QA',authors:['Tác giả QA'],publisher:null,
 publicationYear:null,language:'vi',edition:null,category:'Văn học',isbn:null},mode:'Sale',condition:'Good',pages:'',coverNote:'',notes:'',accessories:'',readable:true,
 hasMissingPages:false,missingEssentialContent:false,description:'Dữ liệu QA',salePrice:50000,exchangeValue:null,seller,photos:[],publishedAt:now,fulfillment:null,purchaseAvailability:{status:'Available',expiresAt:null}};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['initial-503','initial-404','cached-403','cached-503']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let status=mode.startsWith('initial')?Number(mode.slice(-3)):200,reads=0;
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user:{...buyer,email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'}}});
   assert.equal(request.method(),'GET','Only synthetic login and reads permitted');
   if(p==='/api/v1/me/purchase-conversations')return route.fulfill({json:[room]});
   if(p===`/api/v1/me/purchase-conversations/${room.id}`)return route.fulfill({json:room});
   if(p.endsWith('/messages/history'))return route.fulfill({json:{items:[],olderCursor:null}});
   if(p.endsWith('/events'))return route.fulfill({json:[]});
   if(p==='/api/v1/exchanges')return route.fulfill({json:{items:[],nextCursor:null}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p===`/api/v1/listings/${room.listingId}`){reads++;return route.fulfill(status===200?{json:book}:{status,json:{code:'QA_PUBLIC_READ_FAILURE'}});}
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fchat');await page.getByLabel(/^Email/).fill('reader@example.test');await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const card=page.locator(`[data-room-id="${room.id}"]`),heading=card.getByRole('heading');await expect(card).toBeVisible();
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});await expect.poll(()=>reads).toBe(1);
  if(mode.startsWith('cached')){
   await expect(heading).toHaveText('Sách hội thoại QA');status=Number(mode.slice(-3));const before=reads;
   await page.clock.setFixedTime(new Date(Date.now()+61000));await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>reads).toBeGreaterThan(before);
  }
  const unavailable=status===403||status===404;
  const expected=baseline?(mode.startsWith('cached')?'Sách hội thoại QA':'Bài đăng không còn công khai'):
   unavailable?'Bài đăng không còn công khai':mode.startsWith('cached')?'Sách hội thoại QA':'Chưa tải được tên sách';
  await expect(heading).toHaveText(expected);
  if(!baseline)await expect(card.getByRole('alert')).toBeVisible();
  await card.screenshot({path:path.join(out,`${baseline?'before':'after'}-${mode}-${width}.png`)});
  status=200;
  if(!baseline){
   await card.getByRole('button',{name:'Tải lại thông tin sách',exact:true}).click();await expect(heading).toHaveText('Sách hội thoại QA');await expect(card.getByRole('alert')).toHaveCount(0);
  }
  await card.getByRole('link',{name:'Mở cuộc trao đổi',exact:true}).click();await expect(page).toHaveURL(origin+'/chat/'+room.id);
  await expect(page.getByRole('heading',{name:'Thỏa thuận giao dịch',exact:true})).toBeVisible();
  assert.deepEqual(errors,[]);checks.push({width,mode,readStateAccurate:!baseline,conversationStillOpens:true,reads});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
