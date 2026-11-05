// Production exchange list/count queries recover together; all backend reads synthetic.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-exchange-count-recovery');await mkdir(out,{recursive:true});
const baseline=process.env.EXCHANGE_COUNT_BASELINE==='1',origin='http://127.0.0.1:4249';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.EXCHANGE_COUNT_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4249,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['initial-503','cached-403','cached-503','counts-only','zero']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let reads=0,status=mode==='initial-503'?503:200,fresh=false;
  const row=(n,state='Proposed',received=false)=>({id:id(n),initiatorId:received?id(2):user.id,recipientId:received?user.id:id(2),initiatorListingId:id(n+100),recipientListingId:id(n+200),status:state,
   revision:1,initiatorDeposit:50000,recipientDeposit:50000,diffAmount:0,diffPayerId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','Exchange count recovery must not send commands');
   if(p==='/api/v1/exchanges'){
    reads++;const failed=status!==200||(mode==='counts-only'&&reads===1);
    if(failed)return route.fulfill({status:status===200?503:status,json:{code:'QA_READ_FAILURE'}});
    const items=mode==='zero'?[]:fresh?[row(10),row(11)]:[...Array.from({length:7},(_,i)=>row(10+i)),row(30,'Proposed',true),row(31,'Preparing'),row(32,'Completed')];
    return route.fulfill({json:{items,nextCursor:null}});
   }
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fexchange%2Fmine%3Ftab%3Dsent');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();const tabs=page.getByRole('tablist',{name:'Các nhóm giao dịch trao đổi',exact:true});
  const badges=tabs.locator('span[class*="tabBadge"]'),panel=page.getByRole('tabpanel');await expect(tabs).toBeVisible();
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});await expect.poll(()=>reads).toBe(2);
  if(mode==='zero'){
   await expect(badges).toHaveText(['0','0','0','0']);await expect(panel.getByText('Bạn chưa gửi đề nghị nào',{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  }else{
   if(mode.startsWith('cached')){
    await expect(badges).toHaveText(['7','1','1','1']);await expect(panel.locator('article')).toHaveCount(5);
    status=Number(mode.slice(-3));const before=reads;await page.clock.setFixedTime(new Date(Date.now()+20000));
    await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>reads).toBe(before+2);
   }
   if(mode!=='counts-only'||!baseline)await expect(page.getByRole('alert')).toBeVisible();
   const oldCounts=mode.startsWith('cached')?['7','1','1','1']:['—','—','—','—'];
   await expect(badges).toHaveText(baseline?oldCounts:['—','—','—','—']);
   await expect(panel.locator('article')).toHaveCount(mode==='counts-only'?5:0);
   if(mode==='counts-only'&&baseline)await expect(page.getByRole('alert')).toHaveCount(0);
   if(!baseline&&mode==='cached-403')await expect(page.getByText('Quyền xem trao đổi đã thay đổi. Kiểm tra phiên đăng nhập và thử lại.',{exact:true})).toBeVisible();
   await tabs.locator('..').screenshot({path:path.join(out,`${baseline?'before':'after'}-${mode}-${width}.png`)});
   fresh=true;status=200;
   if(mode!=='counts-only'||!baseline){
    const before=reads;await page.getByRole('button',{name:mode==='counts-only'?'Tải lại số lượng và danh sách':'Thử tải lại',exact:true}).click();
    await expect(panel.locator('article')).toHaveCount(2);await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(badges).toHaveText(baseline?oldCounts:['2','0','0','0']);assert.equal(reads-before,baseline?1:2,'Retry refreshes both independent queries');
    if(!baseline){
     await tabs.getByRole('tab',{name:/^Đề nghị nhận được/}).click();await expect(panel.getByText('Chưa có đề nghị nào gửi đến bạn',{exact:true})).toBeVisible();
     await expect(badges).toHaveText(['2','0','0','0']);
    }
   }
  }
  assert.deepEqual(errors,[]);checks.push({width,mode,countsCurrent:mode==='zero'||!baseline,confirmedZeroPreserved:mode==='zero',readOnly:true,reads});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
