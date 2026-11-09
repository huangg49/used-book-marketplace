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
 const modes = ['isbn', 'lookup-fail', 'ai-lost-ack', ...baseline ? [] : ['lookup-ai-bypass', 'ai-direct', 'catalog-match', 'step-one']];
 const viewports = baseline ? [390, 1440] : [320, 390, 1440];
 for (const width of viewports) for (const mode of width === 320 ? ['step-one'] : modes) {
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],gates=[],aiGates=[],intents=[];
  const counts={draft:0,media:0,bytes:0,finalize:0,isbn:0,ai:0};
  const directAi = mode === 'ai-direct' || mode === 'catalog-match';
  page.on('pageerror',e=>errors.push(e.message));let holdIsbn=true,failIsbn=mode==='lookup-fail'||mode==='lookup-ai-bypass',holdAi=mode!=='lookup-ai-bypass'&&!directAi;
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
     publicationYear:null,language:directAi?'vi':null,edition:null,isbn:null},matches:[],missing:[],cached:mode==='lookup-ai-bypass'&&at>1}});
   }
   if(p.endsWith('/catalog-matches')&&m==='POST'){
    searchedTitle=request.postDataJSON().title;
    const items = mode === 'catalog-match' ? [{
      book: { id: id(22), title: 'Tên đọc từ ảnh QA', authors: ['Tác giả danh mục QA'],
        publisher: null, publicationYear: null, language: 'vi', edition: null, category: 'Sách khác', isbn: null },
      matchedBy: 'SimilarTitle', pending: false, warnings: ['CheckEdition'],
    }] : [];
    return route.fulfill({json:{items,truncated:false,serverTime:new Date().toISOString()}});
   }
   assert.equal(m,'GET','No submit/save/provider commands in autofill fixture');
   if (p === '/api/v1/catalog/books' && mode === 'step-one') {
    return route.fulfill({ json: { items: [], nextCursor: null } });
   }
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
  if (mode === 'step-one') {
   const next = page.getByRole('button', { name: 'Tiếp tục', exact: true });
   const search = page.getByRole('searchbox', { name: 'Tìm trong danh mục' });
   const manual = page.getByRole('button', { name: 'Tự nhập thông tin', exact: true });
   const title = page.getByLabel('Tên sách', { exact: true });
   const author = page.getByLabel('Tác giả', { exact: true });
   const category = page.getByRole('combobox', { name: 'Danh mục sách', exact: true });
   const edition = page.locator('summary').filter({ hasText: 'Thông tin ấn bản' });
   const year = page.getByLabel('Năm xuất bản', { exact: true });
   const form = next.locator('xpath=ancestor::form');
   await expect(panel.getByRole('button', { name: 'Đọc thông tin', exact: true })).toHaveCount(0);
   await expect(search).toBeVisible();
   await form.screenshot({ path: path.join(out, `step-one-catalog-${width}.png`) });
   await manual.click();
   await title.focus();
   await page.keyboard.press('Tab');
   await expect(author).toBeFocused();
   await expect(title).not.toHaveAttribute('aria-invalid', 'true');
   await form.screenshot({ path: path.join(out, `step-one-manual-${width}.png`) });
   await page.getByRole('button', { name: 'Tìm sách có sẵn', exact: true }).click();
   await search.fill('QA không có kết quả');
   await expect(page.getByText('Chưa tìm thấy sách phù hợp.')).toBeVisible();
   await next.click();
   await expect(search).toBeFocused();
   await expect(search).toHaveAccessibleDescription('Chọn một kết quả hoặc chuyển sang Tự nhập thông tin.');
   await page.getByRole('button', { name: 'Không thấy sách? Tự nhập theo bìa' }).click();
   await expect(title).toBeFocused();
   await title.fill('Tên đầu sách QA');
   await next.click();
   await expect(author).toBeFocused();
   await expect(author).toHaveAccessibleDescription('Nhập tên tác giả.');
   await expect(page.getByText('Nhập tên tác giả.', { exact: true })).toHaveCount(1);
   await form.screenshot({ path: path.join(out, `step-one-errors-${width}.png`) });
   await author.fill('Tác giả QA');
   await next.click();
   await expect(category).toBeFocused();
   await expect(category).toHaveAccessibleDescription('Chọn danh mục sách.');
   await category.selectOption({ index: 1 });
   await expect(year).toBeHidden();
   await edition.focus();
   await page.keyboard.press('Enter');
   await year.fill('195');
   await edition.click();
   await next.click();
   await expect(year).toBeFocused();
   await expect(year).toHaveAttribute('aria-invalid', 'true');
   await year.fill('1963');
   await expect(year).not.toHaveAttribute('aria-invalid', 'true');
   await next.click();
   await expect(page.getByRole('heading', { name: 'Ảnh bản sách', exact: true })).toBeFocused();
   await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
   await expect(title).toHaveValue('Tên đầu sách QA');
   await expect(year).toHaveValue('1963');
   const policy = page.getByText('Giới hạn đăng bài', { exact: true });
   await expect(page.getByText(/Đăng bài miễn phí/)).toBeHidden();
   await policy.click();
   await expect(page.getByText(/Đăng bài miễn phí/)).toBeVisible();
   await page.getByRole('button', { name: 'Bộ sách', exact: true }).click();
   await expect(page.getByRole('heading', { name: 'Đầu sách đại diện' })).toBeVisible();
   await next.click();
   await expect(page.locator('#bundle')).toBeFocused();
   await page.getByLabel('Tên bộ sách', { exact: true }).fill('Bộ QA');
   await page.getByRole('button', { name: 'Sách lẻ', exact: true }).click();
   await expect(title).toHaveValue('Tên đầu sách QA');
   await page.getByRole('button', { name: 'Bộ sách', exact: true }).click();
   await expect(page.getByLabel('Tên bộ sách', { exact: true })).toHaveValue('Bộ QA');
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
   assert.equal(await form.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
   assert.equal(await manual.getAttribute('aria-pressed'), 'true');
   assert.deepEqual(errors, []);
   assert.ok(Object.values(counts).every(count => count === 0));
   checks.push({ width, mode, inlineErrors: true, draftPreserved: true, fitsViewport: true });
   await context.close();
   continue;
  }
  if (mode === 'ai-direct') {
   await panel.screenshot({path:path.join(out,`step-one-empty-${width}.png`)});
  }
  await page.getByRole('button',{name:'Tự nhập thông tin',exact:true}).click();
  const title=page.getByLabel('Tên sách',{exact:true});await title.fill('Tên đang nhập QA');
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=120;return c.toDataURL('image/png').split(',')[1]}),'base64');
  await panel.locator('input[type=file]').setInputFiles({name:'qa-book.png',mimeType:'image/png',buffer:png});
  if(directAi){
   await panel.getByRole('button',{name:'Đọc chữ bằng AI',exact:true}).evaluate(button=>{button.click();button.click()});
   await expect(panel.getByRole('button',{name:'Dùng Tên sách',exact:true})).toBeVisible();
   await expect(title).toHaveValue('Tên đang nhập QA');
   const result = panel.getByRole('region', { name: 'Thông tin đọc từ ảnh' });
   const suggestionTitle = result.getByLabel('Tên sách từ ảnh', { exact: true });
   await expect(suggestionTitle).toHaveValue('Tên đọc từ ảnh QA');
   await expect(result.getByRole('combobox', { name: 'Ngôn ngữ từ ảnh' }).locator('option:checked')).toHaveText('Tiếng Việt');
   assert.equal(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'No horizontal clipping in the reading panel');
   if (mode === 'catalog-match') {
    const candidate = panel.getByRole('button', { name: 'Chọn đầu sách: Tên đọc từ ảnh QA' });
    await expect(candidate).toBeVisible();
    await suggestionTitle.fill('Tên khác để đối chiếu');
    await expect(candidate).toHaveCount(0);
    await suggestionTitle.fill('Tên đọc từ ảnh QA');
    await candidate.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Xác nhận chọn đầu sách' }).click();
    await expect(page.locator('#sell-selected-title')).toHaveText('Tên đọc từ ảnh QA');
    await expect(page.locator('#sell-selected-title')).toBeFocused();
   } else {
    await expect(result.getByText('2/7 mục đọc được')).toBeVisible();
    await panel.getByText(/Chưa tìm thấy đầu sách phù hợp/).waitFor();
    await panel.screenshot({path:path.join(out,`after-ai-direct-${width}.png`)});
    const more = result.locator('summary').filter({ hasText: 'Bổ sung 5 mục chưa đọc được' });
    await more.focus();
    await page.keyboard.press('Enter');
    const author = result.getByLabel('Tác giả từ ảnh', { exact: true });
    await expect(author).toBeVisible();
    await author.fill('Tác giả bổ sung QA');
    const year = result.getByLabel('Năm xuất bản từ ảnh', { exact: true });
    await year.fill('195');
    await expect(year).toHaveAttribute('aria-invalid', 'true');
    const apply = result.getByRole('button', { name: 'Dùng tất cả thông tin đã rà soát' });
    await expect(apply).toBeDisabled();
    await year.fill('1963');
    await apply.click();
    await page.getByRole('button', { name: 'Dùng gợi ý đã chọn', exact: true }).click();
    await expect(page.getByLabel('Tác giả', { exact: true })).toHaveValue('Tác giả bổ sung QA');
    await expect(page.getByLabel('Năm xuất bản', { exact: true })).toHaveValue('1963');
    await panel.getByRole('button', { name: 'Bỏ ảnh để đọc 1' }).click();
    await expect(panel.getByText(/Ảnh đã đổi/)).toBeVisible();
    await expect(suggestionTitle).toBeDisabled();
   }
   assert.deepEqual(counts,{draft:1,media:1,bytes:1,finalize:1,isbn:0,ai:1});
   assert.deepEqual(errors,[]);
   checks.push({width,mode,counts,manualDraftPreserved:true});
   await context.close();
   continue;
  }
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
   await panel.getByLabel('Tên sách từ ảnh', { exact: true }).fill(corrected);
   await panel.getByRole('button',{name:'Tìm lại trong danh mục'}).click();
   await expect.poll(()=>searchedTitle).toBe(corrected);
   await panel.getByRole('button',{name:'Đọc lại',exact:true}).click();
   await expect(panel.getByText(/Đã dùng lại kết quả/)).toBeVisible();
   await expect(panel.getByLabel('Tên sách từ ảnh', { exact: true })).toHaveValue(corrected);
   await expect(title).toHaveValue('Tên đang nhập QA');
   await panel.getByRole('button',{name:'Dùng tất cả thông tin đã rà soát',exact:true}).click();
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
