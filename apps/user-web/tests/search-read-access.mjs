// Production search cached access and validation failures. All requests are read fixtures.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-search-read-access');await mkdir(out,{recursive:true});
const baseline=process.env.SEARCH_ACCESS_BASELINE==='1',origin='http://127.0.0.1:4258';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.SEARCH_ACCESS_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4258,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const book=n=>({id:id(n),revisionId:id(1000+n),version:1,book:{id:id(2000+n),title:'Sách đọc QA '+n,authors:['Tác giả QA'],publisher:null,publicationYear:null,language:'vi',edition:null,category:'Văn học',isbn:null},mode:'Sale',condition:'Good',pages:'',coverNote:'',notes:'',accessories:'',readable:true,hasMissingPages:false,missingEssentialContent:false,description:'Sách QA',salePrice:50000,exchangeValue:null,seller:{id:id(50),displayName:'Người bán QA'},photos:[],publishedAt:new Date().toISOString(),fulfillment:null,purchaseAvailability:{status:'Available',expiresAt:null}});
const scenarios=[...['initial','root-refresh','cursor-refresh'].flatMap(mode=>[403,503].map(failure=>({mode,failure}))),...[400,422].map(failure=>({mode:'initial',failure}))];
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const sample of scenarios){
  const {mode,failure}=sample,context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],cursors=[];page.on('pageerror',error=>errors.push(error.message));let status=mode==='initial'?failure:200;
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;assert.equal(request.method(),'GET','No catalog/cart/order commands');
   if(p==='/api/v1/listings'){
    const cursor=url.searchParams.get('cursor');cursors.push(cursor);if(cursor)assert.equal(cursor,id(200));assert.equal(url.searchParams.get('q'),'doc-qa');assert.equal(url.searchParams.get('mode'),'Sale');
    return route.fulfill(status!==200?{status,json:{code:'QA_SEARCH_READ_FAILURE'}}:{json:{items:cursor?[book(102)]:[book(100),book(101)],nextCursor:cursor?null:id(200),serverTime:new Date().toISOString()}});
   }
   if(p.startsWith('/api/v1/')||p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/books?data=live&q=doc-qa&mode=Sale');const cards=page.locator('main article'),pager=page.getByRole('navigation',{name:'Phân trang sách',exact:true});
  if(mode!=='initial'){
   await expect(cards).toHaveCount(2);
   if(mode==='cursor-refresh'){await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(cards).toHaveCount(1);}
   status=failure;await page.clock.setFixedTime(new Date(Date.now()+40000));await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  }
  await expect(page.getByRole('alert')).toHaveCount(1);await expect(page.getByRole('button',{name:'Thử lại',exact:true})).toBeEnabled();
  const denied=!baseline&&failure===403,kept=mode!=='initial'&&!denied,rows=mode==='cursor-refresh'?1:2;
  await expect(cards).toHaveCount(kept?rows:0);await expect(page.getByRole('heading',{name:'Chưa có cuốn sách nào phù hợp.',exact:true})).toHaveCount(0);
  const summary=page.locator('#catalog-results').locator('..');await expect(summary).toContainText(kept?rows+' tin đăng trên trang này':baseline&&mode!=='initial'?rows+' tin đăng trên trang này':/Ảnh, tình trạng|Chưa xác nhận được quyền/);
  if(mode==='cursor-refresh')await expect(pager).toHaveCount(denied?0:1);
  if(!baseline&&failure===403)await expect(page.getByRole('alert')).toContainText('Bạn hiện không có quyền xem kệ sách này.');
  if(!baseline&&[400,422].includes(failure))await expect(page.getByRole('alert')).toContainText('Từ khóa, bộ lọc hoặc trang đang xem chưa hợp lệ.');
  if(mode==='cursor-refresh'&&failure===403){await page.getByRole('alert').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${width}.png`)});}
  status=200;const before=cursors.length;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(cards).toHaveCount(rows);
  assert.equal(cursors[before],mode==='cursor-refresh'?id(200):null,'Recover the current search page without dropping cursor or filters');
  assert.equal(new URL(page.url()).searchParams.get('q'),'doc-qa');assert.equal(new URL(page.url()).searchParams.get('mode'),'Sale');
  if(mode==='cursor-refresh'){await expect(pager).toBeVisible();await pager.getByRole('button',{name:'Đến trang trước',exact:true}).click();await expect(cards).toHaveCount(2);await page.goBack();await expect(cards).toHaveCount(1);}
  assert.deepEqual(errors,[]);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),{timeout:5000}).toBe(false);checks.push({width,...sample,deniedCacheHidden:failure!==403||!baseline,readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
