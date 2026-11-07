// Production notification-to-review routing; isolated HTTP, no review or mark-read commands.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-review-notification-target');await mkdir(out,{recursive:true});
const baseline=process.env.REVIEW_TARGET_BASELINE==='1',port=baseline?4265:4266,origin='http://127.0.0.1:'+port;
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.REVIEW_TARGET_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const samples=['Exchange','DirectOrder','PointOrder','403','404','503','bad-type','bad-id','malformed-link','leave','revisit-denied'];const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of samples){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],resolved=[],transactions=[];page.on('pageerror',error=>errors.push(error.message));
  const isNotice=['Exchange','DirectOrder','PointOrder','revisit-denied'].includes(mode),type=['Exchange','DirectOrder','PointOrder'].includes(mode)?mode:'Exchange',reviewId=mode==='malformed-link'?'not-a-review-id':id(100),target=id(200);
  let failing=!isNotice&&mode!=='leave',revisitDenied=false,release;const deferred=new Promise(resolve=>{release=resolve;});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,now=new Date().toISOString();
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No review create/edit/delete/reply or mark-read commands');
   if(p==='/api/v1/me/transaction-reviews/'+id(100)+'/target'){
    resolved.push(p);if(mode==='leave'||revisitDenied)await deferred;
    if(revisitDenied)return route.fulfill({status:403,json:{code:'QA_TARGET_REVOKED'}});
    if(failing&&['403','404','503'].includes(mode))return route.fulfill({status:Number(mode),json:{code:'QA_TARGET_UNAVAILABLE'}});
    return route.fulfill({json:{type:failing&&mode==='bad-type'?'constructor':type,id:failing&&mode==='bad-id'?'invalid':target}});
   }
   if(p.startsWith('/api/v1/transactions/')){
    assert.equal(p,'/api/v1/transactions/'+type+'/'+target+'/reviews','Review ID must never be mistaken for a transaction ID');transactions.push(p);
    return route.fulfill({json:{partnerId:id(2),canReview:false,canEdit:false,canDelete:false,canReply:false,bookRatingRequired:type==='Exchange',deadline:null,serverTime:now,myReview:null,partnerReview:null}});
   }
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[{id:id(10),kind:'ReviewModerated',title:'Đánh giá QA có kết quả kiểm duyệt',body:'Mở đúng giao dịch QA',targetType:'TransactionReview',targetId:id(100),createdAt:now,readAt:now}],nextCursor:null,unreadCount:0}});
   if(p==='/api/v1/members/'+user.id+'/reputation')return route.fulfill({json:{userId:user.id,displayName:user.displayName,completedTransactions:0,verifiedViolations:0,reviewCount:0,partnerRatingCount:0,bookRatingCount:0,partnerRating:null,bookRating:null,items:[],nextCursor:null,serverTime:now}});
   if(p==='/api/v1/me/review-transactions')return route.fulfill({json:{items:[],nextCursor:null,serverTime:now}});
   if(p==='/api/v1/listings')return route.fulfill({json:{items:[],nextCursor:null,serverTime:now}});
   if(p.startsWith('/api/v1/')||p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  const entry=isNotice?'/notifications':'/reviews?reviewId='+encodeURIComponent(reviewId);
  await page.goto(origin+'/login?returnUrl='+encodeURIComponent(entry));await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  if(isNotice)await page.getByRole('button',{name:'Đánh giá QA có kết quả kiểm duyệt: Mở đúng giao dịch QA',exact:true}).click();
  if(baseline){
   await expect(page.getByRole('heading',{name:user.displayName,exact:true})).toBeVisible();assert.equal(resolved.length,0);assert.equal(transactions.length,0);
   assert.equal(new URL(page.url()).searchParams.get('reviewId'),reviewId);
  }else if(mode==='malformed-link'){
   await expect(page.getByRole('alert')).toContainText('Liên kết đánh giá chưa hợp lệ.');assert.equal(resolved.length,0);assert.equal(transactions.length,0);
  }else if(mode==='leave'){
   await expect(page.getByText('Đang xác minh đánh giá từ thông báo…',{exact:true})).toBeVisible();await expect.poll(()=>resolved.length).toBe(1);
   await page.getByRole('link',{name:'Về thông báo',exact:true}).click();await expect(page).toHaveURL(origin+'/notifications');release();
   await page.waitForTimeout(150);await expect(page).toHaveURL(origin+'/notifications');assert.equal(transactions.length,0);
  }else{
   if(failing){
    await expect(page.getByRole('alert')).toBeVisible();assert.equal(transactions.length,0);assert.equal(new URL(page.url()).searchParams.get('reviewId'),reviewId);
    if(mode==='403'||mode==='404')await expect(page.getByRole('alert')).toContainText('Đánh giá không còn khả dụng hoặc bạn không có quyền xem.');
    if(mode==='503')await page.screenshot({path:path.join(out,`after-error-${width}.png`)});
    failing=false;await page.getByRole('button',{name:'Thử mở lại đánh giá',exact:true}).click();
   }
   await expect(page.getByRole('region',{name:'Đánh giá giao dịch',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Chi tiết đánh giá giao dịch',exact:true})).toBeVisible();
   assert.equal(new URL(page.url()).searchParams.get('type'),type);assert.equal(new URL(page.url()).searchParams.get('transaction'),target);assert.equal(new URL(page.url()).searchParams.has('reviewId'),false);
   assert.equal(transactions.length,1);assert.equal(resolved.length,isNotice?1:2);
   if(isNotice){
    await page.goBack();await expect(page).toHaveURL(origin+'/notifications');
    if(mode==='revisit-denied'){
     revisitDenied=true;
     await page.getByRole('button',{name:'Đánh giá QA có kết quả kiểm duyệt: Mở đúng giao dịch QA',exact:true}).click();
     await expect.poll(()=>resolved.length).toBe(2);
     await expect(page.getByText('Đang xác minh đánh giá từ thông báo…',{exact:true})).toBeVisible();
     assert.equal(new URL(page.url()).searchParams.get('reviewId'),reviewId);assert.equal(transactions.length,1);
     release();await expect(page.getByRole('alert')).toContainText('Đánh giá không còn khả dụng hoặc bạn không có quyền xem.');assert.equal(transactions.length,1);
    }
   }
   else{await page.getByRole('link',{name:'Quay lại danh sách giao dịch',exact:true}).click();await expect(page.getByRole('heading',{name:'Chưa có giao dịch đủ điều kiện đánh giá ở mục này',exact:true})).toBeVisible();assert.equal(new URL(page.url()).searchParams.get('type'),type);}
  }
  release();assert.deepEqual(errors,[]);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  checks.push({width,mode,targetConnected:!baseline,readOnly:true,resolveReads:resolved.length,transactionReads:transactions.length});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
