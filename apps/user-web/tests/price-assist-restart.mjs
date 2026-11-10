// Publish a book with ready/pending AI assistance, restart, then explicitly ask for the new book.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-price-assist-restart');await mkdir(out,{recursive:true});
const baseline=process.env.PRICE_RESTART_BASELINE==='1',origin='http://127.0.0.1:4240';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.PRICE_RESTART_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4240,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['ready','pending']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const counts={catalog:0,draft:0,media:0,bytes:0,finalize:0,save:0,submit:0,reference:0,ai:0};let releaseOld,releaseNew;
  const value=(listingId,low,status)=>({id:id(99),listingId,bookId:listingId===id(10)?id(12):id(32),inputFingerprint:'qa',status,evidenceLevel:'Limited',rules:[],
   range:{low,high:low+20000},factors:[],sources:[],missing:[],dataAsOf:null,generatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),model:'QA',cached:false});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,m=request.method();const receipt=(entityId,version=1)=>route.fulfill({json:{entityId,version}});
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   if(p==='/api/v1/catalog/requests'&&m==='POST'){counts.catalog++;return receipt(counts.catalog===1?id(12):id(32));}
   if(p==='/api/v1/listings'&&m==='POST'){counts.draft++;return receipt(counts.draft===1?id(10):id(30));}
   const listing=p.split('/')[4];
   if(/^\/api\/v1\/listings\/[^/]+\/media$/.test(p)&&m==='POST'){counts.media++;return receipt(listing===id(10)?id(13):id(33));}
   if(p.endsWith('/upload-ticket'))return route.fulfill({json:{path:'/qa-upload',headers:{}}});
   if(p==='/api/v1/qa-upload'&&m==='PUT'){counts.bytes++;return route.fulfill({json:null});}
   if(p.endsWith('/finalize')&&m==='POST'){counts.finalize++;return receipt(p.split('/').at(-2));}
   if(p.endsWith('/price-reference')&&m==='POST'){counts.reference++;return route.fulfill({json:value(listing,listing===id(10)?30000:65000,'Ready')});}
   if(p.endsWith('/price-suggestions')&&m==='POST'){
    const at=++counts.ai;if(mode==='pending'&&at===1)await new Promise(resolve=>{releaseOld=resolve});
    if(mode==='pending'&&at===2&&!baseline)await new Promise(resolve=>{releaseNew=resolve});
    return route.fulfill({json:value(listing,at===1?40000:70000,'Suggested')});
   }
   if(p.endsWith('/draft')&&m==='PUT'){counts.save++;return receipt(listing,2);}
   if(p.endsWith('/submit')&&m==='POST'){counts.submit++;return receipt(listing,3);}
   assert.equal(m,'GET','Only existing synthetic listing/assist commands permitted');
   if(/^\/api\/v1\/me\/listings\/[^/]+\/media\/[^/]+$/.test(p))return route.fulfill({json:{id:p.split('/').at(-1),version:1,status:'Ready'}});
   if(p==='/api/v1/me/addresses')return route.fulfill({json:{version:0,items:[]}});
   if(p==='/api/v1/service-areas')return route.fulfill({json:{code:'HCM-DEMO-v1',localities:[]}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fsell');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const step=name=>page.getByRole('navigation',{name:'Các bước đăng sách',exact:true}).getByRole('button',{name});await expect(step(/Thông tin sách/)).toBeVisible();
  await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=120;return c.toDataURL('image/png').split(',')[1]}),'base64');
  async function prepare(name){
   await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();await page.getByLabel('Tên sách',{exact:true}).fill(name);await page.getByLabel('Tác giả',{exact:true}).fill('Tác giả QA');
   await page.getByRole('combobox',{name:'Danh mục sách',exact:true}).selectOption({label:'Sách khác'});await step(/Ảnh bản sách/).click();
   await page.locator('#cover-file').setInputFiles({name:'qa-cover.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('img',{name:'Ảnh bìa gốc đã chọn',exact:true})).toBeVisible();
   await step(/Tình trạng/).click();for(const label of ['Ruột sách','Bìa và gáy','Ghi chú, đánh dấu','Phụ kiện'])await page.getByLabel(label,{exact:true}).fill('Thông tin QA');
   await page.getByLabel('Mô tả chung',{exact:true}).fill('Mô tả QA đầy đủ cho sách kiểm reset trợ lý giá sau khi gửi duyệt.');
   for(const [key,index]of [['readable',0],['hasMissingPages',1],['missingEssentialContent',1]])await page.locator('input[name='+key+']').nth(index).locator('..').click();
   await step(/Bán hoặc đổi/).click();await page.getByLabel('Giá bán (VNĐ)',{exact:true}).fill('50000');
  }
  await prepare('Sách trước QA');const ask=page.getByRole('button',{name:'Lưu đầu sách và kiểm tra giá',exact:true});await ask.click();
  const oldRange=page.locator('p').filter({hasText:/^40\.000.*60\.000/});
  if(mode==='ready')await expect(oldRange).toBeVisible();else{
   await expect.poll(()=>typeof releaseOld).toBe('function');
   await expect(page.getByRole('region',{name:'Gợi ý giá bán',exact:true}).getByRole('status'))
    .toHaveText('Đang kiểm tra nguồn giá…');
  }
  await page.getByRole('radio',{name:'Đổi sách',exact:true}).locator('..').click();await page.getByLabel('Giá trị đổi (VNĐ)',{exact:true}).fill('50000');await step(/Kiểm tra/).click();
  await page.getByLabel('Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.',{exact:true}).check();await page.getByRole('button',{name:'Gửi duyệt',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Đã gửi duyệt',exact:true})).toBeVisible();await page.getByRole('button',{name:'Đăng cuốn khác',exact:true}).click();
  await prepare('Sách tiếp theo QA');
  if(mode==='pending'){
   if(baseline)await expect(page.getByRole('button',{name:'Đang lấy gợi ý…',exact:true})).toBeDisabled();else{
    await expect(ask).toBeEnabled();await ask.click();await expect.poll(()=>typeof releaseNew).toBe('function');
   }
   const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/price-suggestions'));releaseOld();await response;
   await page.waitForTimeout(100);
  }
  await expect(oldRange).toHaveCount(baseline?1:0);
  if(mode==='pending'&&!baseline){await expect(page.getByRole('button',{name:'Đang lấy gợi ý…',exact:true})).toBeDisabled();releaseNew();}else await ask.click();
  await expect(page.locator('p').filter({hasText:/^70\.000.*90\.000/})).toBeVisible();await expect(oldRange).toHaveCount(0);
  assert.equal(counts.ai,2);for(const stage of ['catalog','draft','media','bytes','finalize'])assert.equal(counts[stage],2,'An explicit new-book request uses fresh preparation stages');
  assert.equal(counts.save,1);assert.equal(counts.submit,1);assert.deepEqual(errors,[]);checks.push({width,mode,counts,oldSuggestionCleared:!baseline});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
