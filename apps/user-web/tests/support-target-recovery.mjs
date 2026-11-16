// Production support form target picker: cursor failure, permission refusal and sparse pages.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-support-target-recovery');await mkdir(out,{recursive:true});
const baseline=process.env.SUPPORT_TARGET_BASELINE==='1',origin='http://127.0.0.1:4250';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.SUPPORT_TARGET_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4250,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),displayName:'Bạn đọc QA',email:'reader@example.test',roles:['MEMBER'],status:'ACTIVE'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 const recoveries = [390, 1440].flatMap(width =>
  ['next-503', 'next-403', 'sparse', 'complete-empty'].map(mode => ({width, mode})));
 const scenarios = baseline ? recoveries : [
  ...recoveries,
  {width:320, mode:'exchange'},
  {width:390, mode:'exchange'},
 ];
 for(const {width, mode} of scenarios){
  const exchange = mode === 'exchange';
  const type = exchange ? 'Exchange' : 'DirectOrder';
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],cursors=[];page.on('pageerror',e=>errors.push(e.message));let fail=mode.startsWith('next');
  const longTitle = 'Biên niên sử những chuyến tàu xuyên qua miền đất của các thư viện';
  const option=n=>({
   target:{type,id:exchange ? id(n).replace('00000000', `ab45${n.toString(16).padStart(4,'0')}`) : id(n)},
   label:'Giao dịch QA '+n,
   description:'Sách QA cho hồ sơ hỗ trợ',
   partnerName:exchange ? `Bạn đọc ${n}` : 'Đối tác QA',
   createdAt:'2026-11-16T01:30:00.000Z',
   state:exchange && n===101 ? 'ResolutionPending' : 'Preparing',
   ...(exchange ? {
    booksToGive:n===101 ? [longTitle,'Truyện Kiều'] : ['Truyện Kiều'],
    booksToReceive:['The Wonderful Wizard of Oz'],
   } : {}),
  });
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(p==='/api/v1/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'f'.repeat(43),expiresIn:900,user}});
   assert.equal(request.method(),'GET','No support-case create/reply or transaction commands in picker fixture');
   if(p==='/api/v1/me/support-targets'){
    const cursor=url.searchParams.get('cursor');cursors.push(cursor);assert.equal(url.searchParams.get('type'),type);assert.equal(url.searchParams.get('limit'),baseline?'10':'6');
    if(cursor)assert.equal(cursor,id(150));
    if(cursor&&fail)return route.fulfill({status:mode==='next-403'?403:503,json:{code:'QA_TARGET_READ_FAILURE'}});
    const history = url.searchParams.get('view') === 'History';
    const query = url.searchParams.get('q');
    const emptyPage = mode === 'complete-empty' || history;
    const items=emptyPage?[]:query?[option(101)]:cursor?(mode==='sparse'?[option(100),option(101)]:[option(102)]):mode==='sparse'?[]:[option(100),option(101)];
    return route.fulfill({json:{items,nextCursor:emptyPage||cursor||query?null:id(150),serverTime:new Date().toISOString()}});
   }
   if(p.startsWith(`/api/v1/me/support-targets/${type}/`))return route.fulfill({json:option(Number(p.slice(-3)))});
   if(p==='/api/v1/me/notifications')return route.fulfill({json:{items:[],nextCursor:null,unreadCount:0}});
   if(p.startsWith('/api/v1/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  const target=`/support/new?kind=TransactionIssue&type=${type}`;await page.goto(origin+'/login?returnUrl='+encodeURIComponent(target));
  await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('fixture-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const picker=page.getByRole('region',{name:'Chọn nội dung liên quan',exact:true}),more=picker.getByRole('button',{name:'Xem thêm giao dịch',exact:true});
  const emptyMessage = baseline
   ? 'Bạn chưa có giao dịch thuộc loại này. Chọn loại khác hoặc gửi góp ý không gắn giao dịch.'
   : 'Bạn chưa có giao dịch đang diễn ra.';
  const empty=picker.getByText(emptyMessage,{exact:true});
  await expect(picker).toBeVisible();await page.waitForFunction(()=>!document.querySelector('[data-paper-storm]'),undefined,{timeout:15000});
  const title=page.getByLabel('Tiêu đề',{exact:true}),description=page.getByLabel('Nội dung',{exact:true});
  await title.fill('Tiêu đề hỗ trợ QA giữ nguyên');await description.fill('Nội dung hỗ trợ QA được giữ khi tải giao dịch lỗi.');
  if(exchange){
   if(width===320) await page.addStyleTag({content:'html{font-size:130% !important}'});
   const history=picker.getByRole('button',{name:'Lịch sử',exact:true});
   const current=picker.getByRole('button',{name:'Đang diễn ra',exact:true});
   const input=picker.getByRole('searchbox');
   const search=picker.getByRole('button',{name:'Tìm giao dịch',exact:true});
   const radios=picker.getByRole('radio');
   await expect(radios).toHaveCount(2);
   const inputBox=await input.boundingBox(), searchBox=await search.boundingBox();
   assert.equal(inputBox.y,searchBox.y,'Search stays on one row on mobile');
   assert(searchBox.height>=44 && searchBox.width>=44);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert(await picker.evaluate(el=>el.scrollWidth<=el.clientWidth));
   await expect(picker.getByText(longTitle+' · Truyện Kiều',{exact:true}).first()).toBeVisible();
   await picker.screenshot({path:path.join(out,`exchange-list-${width}.png`)});
   await more.click();await expect(radios).toHaveCount(3);
   await history.click();await expect(history).toHaveAttribute('aria-pressed','true');
   await expect(picker.getByText('Bạn chưa có giao dịch đã đóng thuộc loại này.',{exact:true})).toBeVisible();
   await current.click();await expect(radios).toHaveCount(3);
   await input.fill('#AB450065');
   const request=page.waitForRequest(url=>new URL(url.url()).searchParams.get('q')==='#AB450065');
   await input.press('Enter');await request;
   await expect(radios).toHaveCount(1);
   const target=radios.first();
   await target.focus();await target.press('Space');
   const change=picker.getByRole('button',{name:'Đổi giao dịch',exact:true});
   await expect(change).toBeFocused();
   await expect(picker.getByText('#AB450065',{exact:true})).toBeVisible();
   await expect(picker.getByRole('link',{name:'Xem giao dịch'})).toHaveAttribute('href',`/exchange/${option(101).target.id}`);
   await expect(picker.getByText('Chờ giải quyết tranh chấp',{exact:true})).toBeVisible();
   await picker.screenshot({path:path.join(out,`exchange-selected-${width}.png`)});
   await change.click();await expect(input).toBeFocused();await expect(input).toHaveValue('');
   await picker.getByRole('button',{name:'Giữ giao dịch hiện tại'}).click();
   await expect(change).toBeFocused();
  }else if(mode==='complete-empty'){
   await expect(empty).toBeVisible();await expect(more).toHaveCount(0);assert.equal(cursors.length,1);
  }else{
   await expect(more).toBeVisible();await expect(picker.getByRole('radio')).toHaveCount(mode==='sparse'?0:2);
   if(mode==='sparse')await expect(empty).toHaveCount(baseline?1:0);
   await more.click();
   if(mode.startsWith('next')){
    await expect(picker.getByRole('alert')).toBeVisible();
    await expect(picker.getByRole('radio')).toHaveCount(!baseline&&mode==='next-503'?2:0);
    await expect(more).toHaveCount(!baseline&&mode==='next-403'?0:1);
    await picker.screenshot({path:path.join(out,`${baseline?'before':'after'}-${mode}-${width}.png`)});
    fail=false;const before=cursors.length;await picker.getByRole('button',{name:'Tải lại giao dịch',exact:true}).click();
    const cursorRetry=!baseline&&mode==='next-503';
    await expect(picker.getByRole('alert')).toHaveCount(0);await expect(picker.getByRole('radio')).toHaveCount(cursorRetry?3:2);
    assert.equal(cursors[before],cursorRetry?id(150):null,'Temporary page failure retries cursor; denied read refetches root');
    if(!cursorRetry){await more.click();await expect(picker.getByRole('radio')).toHaveCount(3);}
   }else{
    await expect(picker.getByRole('radio')).toHaveCount(2);await expect(empty).toHaveCount(baseline?1:0);
    await picker.screenshot({path:path.join(out,`${baseline?'before':'after'}-${mode}-${width}.png`)});
   }
   await expect(more).toHaveCount(0);await picker.getByRole('radio',{name:/Giao dịch QA 101/}).locator('..').click();
   await expect(picker.getByText('Giao dịch QA 101',{exact:true})).toBeVisible();
   const changeLabel = baseline ? 'Chọn giao dịch khác' : 'Đổi giao dịch';
   await expect(picker.getByRole('button',{name:changeLabel,exact:true})).toBeFocused();
  }
  await expect(title).toHaveValue('Tiêu đề hỗ trợ QA giữ nguyên');await expect(description).toHaveValue('Nội dung hỗ trợ QA được giữ khi tải giao dịch lỗi.');
  assert.deepEqual(errors,[]);checks.push({width,mode,cursors:cursors.length,draftPreserved:true,readRecoveryCorrect:mode==='complete-empty'||!baseline,readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
