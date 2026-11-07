// Production owner shelf pagination read access; all-origin synthetic read fixtures.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-owner-shelf-read-access');await mkdir(out,{recursive:true});
const baseline=process.env.OWNER_SHELF_BASELINE==='1',port=baseline?4261:4262,origin='http://127.0.0.1:'+port;
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.OWNER_SHELF_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const row=n=>({id:id(n),version:1,channel:'Marketplace',catalogStatus:'Confirmed',state:{moderation:'Approved',visibility:'Visible',trade:'Available'},currentRevision:{id:id(n+1000),content:{title:'Sách chủ kệ QA '+n,author:'Tác giả QA',mode:'Sale',condition:'Good',salePrice:50000,exchangeValue:null,mediaIds:[]}}});
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['initial-cursor','cached-cursor','cached-root'])for(const failure of [403,503]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],cursors=[];page.on('pageerror',error=>errors.push(error.message));let status=mode==='initial-cursor'?failure:200;
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No visibility/archive/publish/edit mutations');
   if(p==='/api/v1/me/listings'){
    const cursor=url.searchParams.get('cursor');cursors.push(cursor);if(cursor)assert.equal(cursor,id(119));
    assert.equal(url.searchParams.get('moderation'),'Approved');assert.equal(url.searchParams.get('limit'),'20');assert.equal(url.searchParams.get('channel'),'Marketplace');
    return route.fulfill(status!==200?{status,json:{code:'QA_OWNER_SHELF_FAILURE'}}:{json:{items:cursor?[row(120)]:[row(100),row(101)],nextCursor:cursor?null:id(119)}});
   }
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/')||p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  const target='/my-books?moderation=Approved'+(mode==='initial-cursor'?'&cursor='+id(119):'');
  await page.goto(origin+'/login?returnUrl='+encodeURIComponent(target));await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const results=page.locator('#owner-shelf-results'),cards=results.locator('li'),pager=page.getByRole('navigation',{name:'Trang kệ sách',exact:true});
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  if(mode!=='initial-cursor'){
   await expect(cards).toHaveCount(2);if(mode==='cached-cursor'){await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(cards).toHaveCount(1);}
   status=failure;await page.clock.setFixedTime(new Date(Date.now()+20000));await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  }
  await expect(results.getByRole('alert')).toBeVisible();await expect(cards).toHaveCount(0);
  await expect(pager).toHaveCount(mode==='cached-root'||!baseline&&failure===403?0:1);
  if(!baseline&&failure===403)await expect(results.getByRole('alert')).toContainText('Quyền xem kệ sách của bạn đã thay đổi.');
  if(mode==='cached-cursor'&&failure===403){await results.getByRole('alert').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${width}.png`)});}
  status=200;const before=cursors.length;await results.getByRole('button',{name:'Thử lại',exact:true}).click();
  await expect(results.getByRole('alert')).toHaveCount(0);await expect(cards).toHaveCount(mode==='cached-root'?2:1);
  assert.equal(cursors[before],mode==='cached-root'?null:id(119));await expect(pager).toBeVisible();
  assert.equal(new URL(page.url()).searchParams.get('moderation'),'Approved');
  if(mode==='initial-cursor')await pager.getByRole('button',{name:'Về trang đầu',exact:true}).click();
  else if(mode==='cached-cursor')await pager.getByRole('button',{name:'Đến trang trước',exact:true}).click();
  else await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();
  await expect(cards).toHaveCount(mode==='cached-root'?1:2);await page.goBack();await expect(cards).toHaveCount(mode==='cached-root'?2:1);
  assert.deepEqual(errors,[]);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  checks.push({width,mode,failure,deniedPagerHidden:mode==='cached-root'||failure!==403||!baseline,currentCursorRetry:true,filtersAndBackPreserved:true,readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
