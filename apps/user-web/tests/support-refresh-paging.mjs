// Production support refresh after failed pagination. Isolated HTTP reads, no mutations.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-support-refresh-paging');await mkdir(out,{recursive:true});
const baseline=process.env.SUPPORT_REFRESH_BASELINE==='1',port=baseline?4267:4268,origin='http://127.0.0.1:'+port;
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.SUPPORT_REFRESH_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['terminal','more','retry-failed','filter-change']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],cursors=[];page.on('pageerror',error=>errors.push(error.message));let refresh=false,rootError=false,oldRefreshed=false,release;const held=new Promise(resolve=>{release=resolve;});
  const row=n=>({id:id(n),kind:'Bug',title:'Yêu cầu mới QA '+n,reporterId:user.id,reporterName:user.displayName,target:null,assigneeId:null,state:'Open',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No support commands in refresh fixture');
   if(p==='/api/v1/me/support-cases'){
    const cursor=url.searchParams.get('cursor');cursors.push(cursor);assert.equal(url.searchParams.get('state'),'Open');assert.ok(['Bug','Feedback'].includes(url.searchParams.get('kind')));
    if(mode==='filter-change'){
     if(url.searchParams.get('kind')==='Feedback')return route.fulfill(cursor?{status:503,json:{code:'QA_NEW_CURSOR_FAILURE'}}:{json:{items:[row(200),row(201)],nextCursor:id(219),serverTime:new Date().toISOString()}});
     if(refresh&&!cursor){await held;await route.fulfill({json:{items:[row(200),row(201)],nextCursor:null,serverTime:new Date().toISOString()}});oldRefreshed=true;return;}
    }
    if(cursor===id(119)||rootError)return route.fulfill({status:503,json:{code:'QA_PAGE_FAILURE'}});
    if(cursor)assert.equal(cursor,id(219));
    return route.fulfill({json:{items:refresh?(cursor?[row(202)]:[row(200),row(201)]):Array.from({length:20},(_,i)=>row(100+i)),nextCursor:!refresh?id(119):mode==='more'&&!cursor?id(219):null,serverTime:new Date().toISOString()}});
   }
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/')||p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl='+encodeURIComponent('/support?state=Open&kind=Bug'));await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const items=page.locator('main article'),pager=page.getByRole('navigation',{name:'Điều hướng phân trang',exact:true}),update=page.getByRole('button',{name:'Cập nhật',exact:true});
  await expect(items).toHaveCount(10);await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await pager.getByRole('button',{name:'Trang 2',exact:true}).click();await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(items).toHaveCount(10);
  if(mode==='retry-failed'){
   rootError=true;await update.click();await expect(page.getByRole('alert')).toHaveCount(2);await expect(items).toHaveCount(10);rootError=false;
  }
  refresh=true;const before=cursors.length;await update.click();
  if(mode==='filter-change'){
   await expect(update).toBeDisabled();await page.getByLabel('Loại yêu cầu',{exact:true}).selectOption('Feedback');
   await expect(items).toHaveCount(2);await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(1);
   release();await expect.poll(()=>oldRefreshed).toBe(true);await page.waitForTimeout(100);
   await expect(page.getByRole('alert')).toHaveCount(1);await expect(page.getByLabel('Loại yêu cầu',{exact:true})).toHaveValue('Feedback');
   assert.deepEqual(errors,[]);checks.push({width,mode,oldRefreshDoesNotClearNewScopeError:true,readOnly:true});await context.close();continue;
  }
  await expect(items).toHaveCount(2);await expect(items.first()).toContainText('Yêu cầu mới QA 200');assert.equal(cursors[before],null);
  await expect(page.getByRole('alert')).toHaveCount(baseline?1:0);
  await expect(pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}))[mode==='more'?'toBeEnabled':'toBeDisabled']();
  if(mode==='terminal')await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${width}.png`)});
  if(mode==='more'){await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(items).toHaveCount(3);assert.equal(cursors.at(-1),id(219));await expect(page.getByRole('alert')).toHaveCount(0);}
  await expect(page.getByLabel('Trạng thái',{exact:true})).toHaveValue('Open');await expect(page.getByLabel('Loại yêu cầu',{exact:true})).toHaveValue('Bug');
  assert.deepEqual(errors,[]);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  checks.push({width,mode,stalePagingErrorCleared:!baseline,rootFailureStillReported:mode==='retry-failed',filtersPreserved:true,readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
