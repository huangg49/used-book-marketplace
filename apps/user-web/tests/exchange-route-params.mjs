// Actual /exchange/mine handles untrusted URL tab values without a phantom tab.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-exchange-route-params');await mkdir(out,{recursive:true});
const baseline=process.env.EXCHANGE_ROUTE_BASELINE==='1',origin='http://127.0.0.1:4248';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),
 build:{outDir:path.resolve(root,process.env.EXCHANGE_ROUTE_BUILD??'apps/user-web/dist')},
 preview:{host:'127.0.0.1',port:4248,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const cases=['constructor','__proto__','toString','unknown','sent','received','active','done'];
const labels={sent:'Đề nghị đã gửi',received:'Đề nghị nhận được',active:'Đang thực hiện',done:'Hoàn tất'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const tab of cases){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  await context.routeWebSocket('**/*',socket=>socket.close());const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));let reads=0;
  const row=(n,status='Proposed',received=false)=>({id:id(n),initiatorId:received?id(2):user.id,recipientId:received?user.id:id(2),
   initiatorListingId:id(200+n),recipientListingId:id(300+n),status,revision:1,
   initiatorDeposit:50000,recipientDeposit:50000,diffAmount:0,diffPayerId:null,
   createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  const rows=[...Array.from({length:7},(_,i)=>row(10+i)),row(30,'Proposed',true),row(31,'Preparing'),row(32,'Completed')];
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','Route parsing must not mutate exchanges or open commands');
   if(p==='/api/v1/exchanges'){reads++;return route.fulfill({json:{items:rows,nextCursor:null}});}
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  const target='/exchange/mine?tab='+encodeURIComponent(tab);
  await page.goto(origin+'/login?returnUrl='+encodeURIComponent(target));
  await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const panel=page.getByRole('tabpanel'),tabs=page.getByRole('tablist',{name:'Các nhóm giao dịch trao đổi',exact:true});
  await expect(panel).toBeVisible();await expect.poll(()=>reads).toBeGreaterThan(0);
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  const phantom=baseline&&['constructor','__proto__','toString'].includes(tab);
  const expected=['sent','received','active','done'].includes(tab)?tab:'sent';
  await expect(tabs.locator('[aria-selected="true"]')).toHaveCount(phantom?0:1);
  await expect(panel).toHaveAttribute('id','panel-'+(phantom?tab:expected));
  await expect(panel.locator('article')).toHaveCount(phantom?0:expected==='sent'?5:1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  if(!phantom){
   const active=tabs.getByRole('tab',{name:new RegExp('^'+labels[expected])});
   await expect(active).toHaveAttribute('tabindex','0');await expect(active).toHaveAttribute('aria-selected','true');
   if(expected==='sent'){
    const pager=page.getByRole('navigation',{name:'Phân trang trao đổi',exact:true});
    await pager.getByRole('button',{name:'Trang 2',exact:true}).click();await expect(panel.locator('article')).toHaveCount(2);
    await page.goBack();await expect(panel.locator('article')).toHaveCount(5);
   }
   await active.press('ArrowRight');const next={sent:'received',received:'active',active:'done',done:'sent'}[expected];
   await expect(tabs.getByRole('tab',{name:new RegExp('^'+labels[next])})).toBeFocused();
   await expect(page.getByRole('tabpanel')).toHaveAttribute('id','panel-'+next);
  }
  assert.deepEqual(errors,[]);checks.push({width,tab,phantomTab:phantom,validRoute:!phantom,readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
