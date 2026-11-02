// Frontend HTTP fixtures only. Never writes accounts, profiles or reviews to Mongo.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../../',import.meta.url)), appRoot=path.join(root,'apps/user-web');
const require=createRequire(new URL('../../admin-web/package.json',import.meta.url)), webRequire=createRequire(new URL('../package.json',import.meta.url));
const{chromium}=require('playwright');
const origin='http://127.0.0.1:5184';process.env.VITE_API_BASE_URL=origin+'/api/v1';
const a={id:randomUUID(),email:'a@profile-qa.test',displayName:'Bạn đọc QA',status:'ACTIVE',roles:['MEMBER']};
const b={...a,id:randomUUID(),email:'b@profile-qa.test',displayName:'Người đọc QA mới'};
const now=new Date().toISOString();
const avatarId=randomUUID();
const review=(index)=>({id:randomUUID(),transactionType:'Exchange',transactionId:randomUUID(),authorId:b.id,authorName:b.displayName,targetUserId:a.id,
  bookRating:index?5:4,partnerRating:5,tags:[],comment:'HTTP fixture cho kiểm tra giao diện, không phải giao dịch thật.',version:1,status:'Published',createdAt:now,updatedAt:now,editDeadline:now,publishedAt:now,evidenceHeld:false,legacyDisclosed:false,reply:null});
const scored={userId:a.id,displayName:a.displayName,completedTransactions:2,verifiedViolations:0,reviewCount:2,partnerRatingCount:2,bookRatingCount:2,partnerRating:5,bookRating:4.5,items:[review(0),review(1)],nextCursor:null,serverTime:now};
const empty={...scored,userId:b.id,displayName:b.displayName,completedTransactions:0,reviewCount:0,partnerRatingCount:0,bookRatingCount:0,partnerRating:null,bookRating:null,items:[]};
let server,browser,page,current=a,mode='normal',gate=null;
const artifacts=path.join(root,'apps/user-web/test-results/profile-reputation');
const capture=!process.argv.includes('--no-captures');
try{
  await mkdir(artifacts,{recursive:true});
  const{createServer}=await import(pathToFileURL(webRequire.resolve('vite')).href);process.chdir(appRoot);
  server=await createServer({root:appRoot,server:{host:'127.0.0.1',port:5184,strictPort:true},logLevel:'error'});await server.listen();
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'}), errors=[], writes=[];
  await context.routeWebSocket(/\/socket\.io\//,socket=>socket.close());
  await context.route(origin+'/qa-avatar.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#fcf8db"/><text x="15" y="50" font-size="28" fill="#5c0202">QA</text></svg>'}));
  await context.route('**/socket.io/**',r=>r.fulfill({status:503,json:{message:'Frontend QA has no realtime server'}}));
  await context.route(origin+'/api/v1/**',async route=>{
    const request=route.request(), url=new URL(request.url()), endpoint=url.pathname.replace('/api/v1','');
    if(request.method()!=='GET'&&endpoint!=='/auth/login')writes.push(endpoint);
    if(endpoint==='/auth/login')return route.fulfill({json:{accessToken:'fixture-access',refreshToken:'q'.repeat(43),expiresIn:900,user:current}});
    if(endpoint==='/auth/me')return route.fulfill({json:current});
    if(endpoint==='/me/profile')return route.fulfill({json:{id:current.id,version:1,displayName:current.displayName,email:current.email,contactPhone:null,avatarId:current===a?avatarId:null,pendingEmailChange:null}});
    if(endpoint.endsWith(`/avatar-uploads/${avatarId}/read`))return route.fulfill({json:{url:origin+'/qa-avatar.svg',expiresAt:new Date(Date.now()+3600000).toISOString()}});
    if(endpoint.startsWith('/members/')&&endpoint.endsWith('/reputation')){
      const person=endpoint.includes(a.id)?a:b, data=person===a?scored:empty;
      if(gate&&person===a)await gate;
      if(mode==='offline')return route.fulfill({status:503,json:{code:'UNAVAILABLE',message:'QA offline'}});
      if(mode==='private')return route.fulfill({status:404,json:{code:'NOT_FOUND',message:'QA profile unavailable'}});
      if(mode==='mixed')return route.fulfill({json:{...data,bookRatingCount:1,bookRating:4,items:[data.items[0],{...data.items[1],transactionType:'DirectOrder',bookRating:null}]}});
      if(mode==='violation')return route.fulfill({json:{...data,verifiedViolations:1}});
      return route.fulfill({json:data});
    }
    return route.fulfill({status:503,json:{code:'UNAVAILABLE',message:'Frontend QA: unrelated endpoint'}});
  });
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  let release;gate=new Promise(resolve=>{release=resolve});
  await page.goto(origin+'/login?returnUrl=%2Fprofile');
  await page.getByLabel(/^Email/).fill(a.email);await page.getByLabel(/^Mật khẩu/).fill('QA-only-pass');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const region=page.getByRole('region',{name:'Uy tín và đánh giá của bạn',exact:true});
  await region.getByRole('status').waitFor();release();gate=null;
  await region.getByText('5.0',{exact:true}).waitFor();
  assert.equal(await region.getByText('4.5',{exact:true}).count(),1);
  assert.equal(await region.getByText('2 đánh giá công khai',{exact:true}).count(),1);
  const card=page.getByRole('region',{name:'Thẻ bạn đọc Lật Lại',exact:true});
  assert.equal(await card.getByText(/Lật Lại Club|THẺ BẠN ĐỌC|giao dịch hoàn tất|0 vi phạm/).count(),0);
  assert.equal(await card.getByText(a.email,{exact:true}).count(),0);
  assert.equal(await card.getByRole('navigation').count(),0);
  assert.equal(await card.getByRole('button',{name:/^(Gỡ|Bỏ) ảnh đại diện/}).count(),0);
  assert.equal(await page.getByRole('button',{name:/^(Gỡ|Bỏ) ảnh đại diện/}).count(),1);
  const profileLink=region.getByRole('link',{name:'Xem hồ sơ uy tín',exact:true});
  assert.equal(await profileLink.getAttribute('href'),'/members/'+a.id);
  for(const width of[1440,1000,390,320]){
    await page.setViewportSize({width,height:1100});await region.scrollIntoViewIfNeeded();
    assert.equal(await region.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`No reputation overflow at ${width}`);
    if(capture)await page.screenshot({path:path.join(artifacts,`card-${width}.png`),fullPage:false});
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='130%');
  assert.equal(await region.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  if(capture)await page.screenshot({path:path.join(artifacts,'card-320-large-text.png'),fullPage:false});
  await page.evaluate(()=>document.documentElement.style.fontSize='');
  const refresh=()=>page.evaluate(async id=>{const{queryClient}=await import('/src/lib/session.ts');await queryClient.invalidateQueries({queryKey:['memberReputation','summary',id]});},a.id);
  mode='mixed';await refresh();
  await region.getByText('1 lượt đánh giá',{exact:true}).waitFor();
  assert.equal(await region.getByText('2 lượt đánh giá',{exact:true}).count(),1);
  mode='violation';await refresh();await region.getByText('1 vi phạm đã xác minh',{exact:true}).waitFor();
  mode='normal';await refresh();
  mode='offline';await refresh();await region.getByText('Chưa cập nhật được uy tín. Đang giữ số liệu đã tải.',{exact:true}).waitFor();
  assert.equal(await region.getByText('5.0',{exact:true}).count(),1);
  mode='private';await refresh();await region.getByText('Hồ sơ uy tín hiện chưa sẵn sàng.',{exact:true}).waitFor();
  assert.equal(await region.getByText('5.0',{exact:true}).count(),0);
  mode='normal';await region.getByRole('button',{name:'Thử tải lại uy tín',exact:true}).click();await region.getByText('5.0',{exact:true}).waitFor();
  // The new link must respect the profile editor's existing unsaved-draft guard.
  const nameInput=page.locator('#profile-name');
  await nameInput.fill('Tên QA chưa lưu');await profileLink.click();
  await page.getByText('Rời hồ sơ chưa lưu?',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Hủy',exact:true}).click();
  await page.getByText('Rời hồ sơ chưa lưu?',{exact:true}).waitFor({state:'hidden'});
  assert.equal(await nameInput.inputValue(),'Tên QA chưa lưu');
  await nameInput.fill(a.displayName);
  assert.equal(await nameInput.inputValue(),a.displayName);
  // Public InfiniteQuery and account regular-query summary coexist for the same ID.
  await profileLink.click();await page.getByRole('heading',{name:a.displayName,exact:true,level:1}).waitFor();
  await page.evaluate(async()=>{const{router}=await import('/src/app/router.tsx');await router.navigate('/profile');});
  await region.getByText('5.0',{exact:true}).waitFor();
  // Let an old account read finish after the session changes. It must never
  // populate the newly authenticated reader's card or retain the old link.
  gate=new Promise(resolve=>{release=resolve});
  const requested=page.waitForRequest(r=>r.url().includes(`/members/${a.id}/reputation`));
  const oldRead=refresh();await requested;
  current=b;
  await page.evaluate(async email=>{const{session}=await import('/src/lib/session.ts');await session.login({email,password:'QA-only-pass'});},b.email);
  await region.getByText('Chưa có điểm',{exact:true}).first().waitFor();release();gate=null;await oldRead;
  assert.equal(await region.getByText('Chưa có điểm',{exact:true}).count(),2);
  assert.equal(await region.getByText('5.0',{exact:true}).count(),0);
  assert.equal(await region.getByRole('link',{name:'Xem hồ sơ uy tín',exact:true}).getAttribute('href'),'/members/'+b.id);
  assert.deepEqual(writes,[],'Card must never submit profile/mail/avatar/review commands');assert.deepEqual(errors,[]);
  console.log('PASS profile reputation UI fixture: scores/counts, loading, stale503 retention,404 concealment/retry, public/summary cache, late old-account response isolation,1440/1000/390/320 and130% text; no profile/review mutations or DB/provider.');
}catch(error){
  if(page){await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:false}).catch(()=>{});console.log(JSON.stringify({fixturePath:new URL(page.url()).pathname,headings:await page.getByRole('heading').allTextContents()}));}
  throw error;
}finally{await browser?.close();await server?.close();}
