// Contract enum URL boundaries in the production support form; all requests are fixtures.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');
const {preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-support-route-params');await mkdir(out,{recursive:true});
const baseline=process.env.SUPPORT_ROUTE_BASELINE==='1',origin='http://127.0.0.1:4251';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.SUPPORT_ROUTE_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4251,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const invalid=['constructor','__proto__','toString','unknown'];
const kinds=['Feedback','Bug','Violation','TransactionIssue'];
const types=['DirectOrder','Exchange','PointOrder','Auction','Listing','Review','Member'];
const destinations={Auction:'/auctions',Listing:'/books',Review:'/account',Member:'/books'};
const cases=[...invalid.map(value=>({field:'kind',value})),...invalid.map(value=>({field:'type',value})),...types.map((value,i)=>({field:'valid',value,kind:kinds[i%kinds.length]}))];
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const sample of cases){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],posts=[],targetReads=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   if(p==='/api/v1/me/support-cases'&&request.method()==='POST'){
    assert.equal(sample.field,'kind','Only enum-kind fixture submits a synthetic support request');
    assert.ok(request.headers()['idempotency-key']);posts.push(request.postDataJSON());
    return route.fulfill({status:503,json:{code:'QA_SUPPORT_UNAVAILABLE'}});
   }
   assert.equal(request.method(),'GET','No real writes or other fixture commands');
   if(p==='/api/v1/me/support-targets'){
    targetReads.push(url.searchParams.get('type'));
    return route.fulfill({json:{items:[],nextCursor:null,serverTime:new Date().toISOString()}});
   }
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  const params=new URLSearchParams(sample.field==='valid'?{type:sample.value,kind:sample.kind}:{[sample.field]:sample.value});
  await page.goto(origin+'/login?returnUrl='+encodeURIComponent('/support/new?'+params));
  await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.getByLabel('Tiêu đề',{exact:true})).toBeVisible();
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  const picker=page.getByRole('region',{name:'Chọn nội dung liên quan',exact:true});
  if(sample.field==='kind'){
   await expect(picker).toHaveCount(0);
   await page.getByLabel('Tiêu đề',{exact:true}).fill('Yêu cầu hỗ trợ QA');
   await page.getByLabel('Nội dung',{exact:true}).fill('Nội dung QA kiểm tra tham số loại yêu cầu.');
   await page.getByRole('button',{name:'Gửi yêu cầu',exact:true}).click();
   await expect.poll(()=>posts.length).toBe(1);
   assert.equal(posts[0].kind,baseline&&sample.value!=='unknown'?sample.value:'Feedback');
   assert.equal(posts[0].target,null);
   await expect(page.getByLabel('Tiêu đề',{exact:true})).toHaveValue('Yêu cầu hỗ trợ QA');
   await expect(page.getByLabel('Nội dung',{exact:true})).toHaveValue('Nội dung QA kiểm tra tham số loại yêu cầu.');
  }else if(sample.field==='type'){
   await expect(page.getByLabel('Đối tượng liên quan',{exact:true})).toHaveValue('');
   await expect(picker).toHaveCount(baseline&&sample.value!=='unknown'?1:0);
   assert.deepEqual(targetReads,[]);
  }else{
   await expect(page.getByLabel('Loại yêu cầu',{exact:true})).toHaveValue(sample.kind);
   await expect(page.getByLabel('Đối tượng liên quan',{exact:true})).toHaveValue(sample.value);
   await expect(picker).toBeVisible();
   if(['DirectOrder','Exchange','PointOrder'].includes(sample.value)){
    await expect(picker.getByText('Bạn chưa có giao dịch thuộc loại này. Chọn loại khác hoặc gửi góp ý không gắn giao dịch.',{exact:true})).toBeVisible();
    assert.deepEqual(targetReads,[sample.value]);
   }else await expect(picker.getByRole('link')).toHaveAttribute('href',destinations[sample.value]);
   assert.equal(posts.length,0);
  }
  if(sample.field==='type'&&sample.value==='constructor')await page.locator('main form').screenshot({path:path.join(out,`${baseline?'before':'after'}-${width}.png`)});
  assert.deepEqual(errors,[]);checks.push({width,...sample,enumBoundaryCorrect:sample.field==='valid'||sample.value==='unknown'||!baseline});
  await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));
 console.log(JSON.stringify({baseline,profiles:checks.length,enumBoundariesCorrect:checks.every(check=>check.enumBoundaryCorrect),fixtureOnly:true}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
