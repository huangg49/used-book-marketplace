// Production support list read recovery. All-origin fixtures; no support mutations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');
const {preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-support-list-read-access');await mkdir(out,{recursive:true});
const baseline=process.env.SUPPORT_LIST_BASELINE==='1',origin='http://127.0.0.1:4252';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.SUPPORT_LIST_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4252,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const rows=(start,count)=>Array.from({length:count},(_,i)=>({id:id(start+i),kind:'Bug',title:'Yêu cầu QA '+(start+i),reporterId:user.id,reporterName:user.displayName,target:null,assigneeId:null,state:'Open',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['refresh','next-page'])for(const failure of [403,503]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],cursors=[];let status=200;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No support mutations in list fixture');
   if(p==='/api/v1/me/support-cases'){
    const cursor=url.searchParams.get('cursor');cursors.push(cursor);if(cursor)assert.equal(cursor,id(119));
    assert.equal(url.searchParams.get('limit'),'20');assert.equal(url.searchParams.get('state'),'Open');assert.equal(url.searchParams.get('kind'),'Bug');
    return route.fulfill(status===200?{json:{items:cursor?rows(120,1):rows(100,20),nextCursor:cursor?null:id(119),serverTime:new Date().toISOString()}}:{status,json:{code:'QA_SUPPORT_LIST_FAILURE'}});
   }
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl='+encodeURIComponent('/support?state=Open&kind=Bug'));
  await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const main=page.locator('main'),items=main.locator('article'),pager=page.getByRole('navigation',{name:'Điều hướng phân trang',exact:true});
  await expect(items).toHaveCount(10);await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await pager.getByRole('button',{name:'Trang 2',exact:true}).click();await expect(items.first()).toContainText('Yêu cầu QA 110');
  status=failure;
  if(mode==='refresh')await page.getByRole('button',{name:'Cập nhật',exact:true}).click();
  else await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();
  await expect.poll(()=>cursors.length).toBe(2);
  await expect(page.getByRole('button',{name:'Cập nhật',exact:true})).toBeEnabled();
  await expect(items).toHaveCount(failure===403?0:10);await expect(pager).toHaveCount(failure===403?0:1);
  const oldSilent=baseline&&failure===403&&mode==='next-page';
  await expect(page.getByRole('alert')).toHaveCount(oldSilent?0:1);
  if(!baseline&&failure===403)await expect(page.getByRole('alert')).toContainText('Quyền xem yêu cầu hỗ trợ đã thay đổi.');
  await expect(page.getByRole('heading',{name:'Chưa có yêu cầu trong mục này',exact:true})).toHaveCount(0);
  await page.getByRole('heading',{name:'Hỗ trợ & phản ánh',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${mode}-${failure}-${width}.png`)});
  status=200;const before=cursors.length;
  if(failure===403||mode==='refresh')await page.getByRole('button',{name:'Cập nhật',exact:true}).click();
  else await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();
  const rootRetry=failure===403||mode==='refresh';
  await expect(items).toHaveCount(rootRetry?10:1);await expect(pager).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(baseline&&failure===403&&mode==='next-page'?1:0);
  assert.equal(cursors[before],rootRetry?null:id(119));
  if(rootRetry){await expect(items.first()).toContainText('Yêu cầu QA 110');await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(items).toHaveCount(1);await expect(page.getByRole('alert')).toHaveCount(0);}
  await expect(page.getByLabel('Trạng thái',{exact:true})).toHaveValue('Open');await expect(page.getByLabel('Loại yêu cầu',{exact:true})).toHaveValue('Bug');
  await expect(items.getByRole('link')).toHaveAttribute('href','/support/'+id(120)+'?state=Open&kind=Bug');
  await pager.getByRole('button',{name:'Trang 2',exact:true}).click();await expect(items).toHaveCount(10);
  await page.goBack();await expect(items).toHaveCount(1);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks.push({width,mode,failure,readRecoveryCorrect:!baseline||failure===503||mode==='refresh',rootOrCursorRetryCorrect:true,filtersAndBackPreserved:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
