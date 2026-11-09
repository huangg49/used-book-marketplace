// Actual /sell entry with synthetic upload/ISBN/AI HTTP. Never call a provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');
const {preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-autofill-read-lock');await mkdir(out,{recursive:true});
const baseline=process.env.AUTOFILL_LOCK_BASELINE==='1',origin='http://127.0.0.1:4234';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),
 build:{outDir:path.resolve(root,process.env.AUTOFILL_LOCK_BUILD??'apps/user-web/dist')},
 preview:{host:'127.0.0.1',port:4234,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const mode of ['isbn','lookup-fail','ai-lost-ack',...baseline?[]:['lookup-ai-bypass']]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],gates=[],aiGates=[],intents=[];
  const counts={draft:0,media:0,bytes:0,finalize:0,isbn:0,ai:0};
  page.on('pageerror',e=>errors.push(e.message));let holdIsbn=true,failIsbn=mode==='lookup-fail'||mode==='lookup-ai-bypass',holdAi=mode!=='lookup-ai-bypass';
  let searchedTitle;
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,m=request.method();
   const receipt=entityId=>route.fulfill({json:{entityId,version:1}});
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   if(p==='/api/v1/listings'&&m==='POST'){counts.draft++;return receipt(id(10));}
   if(p===`/api/v1/listings/${id(10)}/media`&&m==='POST'){counts.media++;return receipt(id(13));}
   if(p.endsWith(`/media/${id(13)}/upload-ticket`))return route.fulfill({json:{path:'/qa-upload',headers:{}}});
   if(p==='/api/v1/qa-upload'&&m==='PUT'){counts.bytes++;return route.fulfill({json:null});}
   if(p.endsWith(`/media/${id(13)}/finalize`)&&m==='POST'){counts.finalize++;return receipt(id(13));}
   if(p===`/api/v1/me/listings/${id(10)}/media/${id(13)}`)return route.fulfill({json:{id:id(13),version:1,status:'Ready'}});
   if(p.endsWith('/isbn-matches')&&m==='POST'){
    counts.isbn++;if(holdIsbn)await new Promise(resolve=>gates.push(resolve));
    if(failIsbn)return route.fulfill({status:503,json:{code:'QA_LOOKUP_FAILED',message:'Chưa đọc được ISBN QA.'}});
    return route.fulfill({json:{listingId:id(10),status:'Ambiguous',isbns:['9786041000001','9786041000018'],catalog:null,serverTime:new Date().toISOString()}});
   }
   if(p.endsWith('/autofill-suggestions')&&m==='POST'){
    const at=++counts.ai;intents.push({key:request.headers()['idempotency-key'],body:request.postData()});
    if(holdAi)await new Promise(resolve=>aiGates.push(resolve));
    if(at===1&&mode==='ai-lost-ack')return route.abort('failed');
    return route.fulfill({json:{id:id(20),status:'Suggested',fields:{title:'Tên đọc từ ảnh QA',authors:[],publisher:null,
     publicationYear:null,language:null,edition:null,isbn:null},matches:[],missing:[],cached:mode==='lookup-ai-bypass'&&at>1}});
   }
   if(p.endsWith('/catalog-matches')&&m==='POST'){
    searchedTitle=request.postDataJSON().title;
    return route.fulfill({json:{items:[],truncated:false,serverTime:new Date().toISOString()}});
   }
   assert.equal(m,'GET','No submit/save/provider commands in autofill fixture');
   if(p==='/api/v1/me/addresses')return route.fulfill({json:{version:0,items:[]}});
   if(p==='/api/v1/service-areas')return route.fulfill({json:{code:'HCM-DEMO-v1',localities:[]}});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/login?returnUrl=%2Fsell');
  await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const panel=page.locator('section[aria-labelledby="photo-autofill-title"]');
  await expect(panel).toBeVisible();await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();
  const title=page.getByLabel('Tên sách',{exact:true});await title.fill('Tên đang nhập QA');
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=120;return c.toDataURL('image/png').split(',')[1]}),'base64');
  await panel.locator('input[type=file]').setInputFiles({name:'qa-book.png',mimeType:'image/png',buffer:png});
  await panel.getByRole('button',{name:'Đọc thông tin',exact:true}).evaluate(button=>{button.click();button.click()});
  await expect.poll(()=>counts.isbn).toBe(baseline?2:1);
  await expect(panel.getByRole('button',{name:'Đang đọc…',exact:true})).toBeDisabled();
  holdIsbn=false;gates.forEach(release=>release());
  if(mode==='lookup-fail'){
   await expect(panel.getByRole('alert')).toBeVisible();await expect(title).toHaveValue('Tên đang nhập QA');
   await expect(panel.getByRole('img',{name:'Ảnh để đọc 1',exact:true})).toBeVisible();
   failIsbn=false;await panel.getByRole('button',{name:'Đọc thông tin',exact:true}).click();
  }
  assert.equal(counts.ai,0,'ISBN results never call AI automatically');
  if(mode==='lookup-ai-bypass'){
   await expect(panel.getByRole('alert')).toBeVisible();
   await panel.getByRole('button',{name:'Đọc chữ bằng AI',exact:true}).click();
   await expect(panel.getByRole('button',{name:'Dùng Tên sách',exact:true})).toBeVisible();
   await panel.getByText(/Chưa tìm thấy đầu sách phù hợp/).waitFor();
   const corrected='Tựa QA đã bổ sung phần còn thiếu';
   await panel.getByLabel('Tên sách để tìm').fill(corrected);
   await panel.getByRole('button',{name:'Tìm lại trong danh mục'}).click();
   await expect.poll(()=>searchedTitle).toBe(corrected);
   await panel.getByRole('button',{name:'Đọc lại',exact:true}).click();
   await expect(panel.getByText(/Đã dùng lại kết quả/)).toBeVisible();
   await expect(panel.getByLabel('Tên sách để tìm')).toHaveValue(corrected);
   await expect(title).toHaveValue('Tên đang nhập QA');
   await panel.getByRole('button',{name:'Dùng thông tin đã sửa',exact:true}).click();
   await page.getByRole('button',{name:'Dùng gợi ý đã chọn',exact:true}).click();
   await expect(title).toHaveValue(corrected);
   assert.equal(counts.ai,2,'The same photos can return cached results without losing edits');
  }else {
   await expect(panel.getByRole('heading',{name:'Đối chiếu từ mã vạch ISBN',exact:true})).toBeVisible();
  }
  if(mode==='ai-lost-ack'){
   await panel.getByRole('button',{name:'Đọc chữ bằng AI',exact:true}).evaluate(button=>{button.click();button.click()});
   await expect.poll(()=>counts.ai).toBe(1);holdAi=false;aiGates.forEach(release=>release());
   await expect(panel.getByRole('alert')).toBeVisible();
   await panel.getByRole('button',{name:'Đọc thông tin',exact:true}).click();
   await expect(panel.getByRole('button',{name:'Dùng Tên sách',exact:true})).toBeVisible();
   assert.equal(counts.ai,2);assert.equal(Boolean(intents[0].key)&&intents[0].key===intents[1].key&&intents[0].body===intents[1].body,true,'Lost ACK retries exact intent');
   await expect(title).toHaveValue('Tên đang nhập QA');
   await panel.getByRole('button',{name:'Dùng Tên sách',exact:true}).click();
   await expect(page.getByRole('dialog')).toBeVisible();
   await page.getByRole('button',{name:'Dùng gợi ý đã chọn',exact:true}).click();await expect(title).toHaveValue('Tên đọc từ ảnh QA');
  }else if(mode!=='lookup-ai-bypass') await expect(title).toHaveValue('Tên đang nhập QA');
  assert.equal(counts.isbn,(baseline?2:1)+(mode==='lookup-fail'?1:0));
  for(const stage of ['draft','media','bytes','finalize'])assert.equal(counts[stage],1,'Acknowledged upload stages reused');
  await panel.screenshot({path:path.join(out,`${baseline?'before':'after'}-${mode}-${width}.png`)});
  assert.deepEqual(errors,[]);checks.push({width,mode,counts,readLock:!baseline,manualDraftPreserved:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
