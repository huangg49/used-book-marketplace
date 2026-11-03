// Actual screens and shared hooks. In-memory query/transport fixtures; no DB,
// authentication provider, mutations, media upload or payment requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default;
const out = path.join(root, '.tmp/list-pagination'); await fs.mkdir(out, { recursive: true });
const source = root.replaceAll('\\', '/').replace(/\/$/, '');
await fs.writeFile(path.join(out, 'index.html'), '<html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
await fs.writeFile(path.join(out, 'fixture.tsx'), `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{QueryClient,QueryClientProvider,useInfiniteQuery}from'@tanstack/react-query';
import{BrowserRouter,Routes,Route,Link,Outlet,useParams,useLocation}from'react-router-dom';
import{usePagedCollection}from'/@fs/${source}/apps/user-web/src/components/Pagination/usePagedCollection.ts';
import{CollectionPager}from'/@fs/${source}/apps/user-web/src/components/Pagination/CollectionPager.tsx';
import{useCursorNavigation}from'/@fs/${source}/apps/user-web/src/components/Pagination/useCursorNavigation.ts';
import{CursorPager}from'/@fs/${source}/apps/user-web/src/components/Pagination/CursorPager.tsx';
import{MyBooksPage}from'/@fs/${source}/apps/user-web/src/pages/MyBooksPage.tsx';
import{CreateAuctionPage}from'/@fs/${source}/apps/user-web/src/pages/CreateAuctionPage.tsx';
import{MyAuctionsPage}from'/@fs/${source}/apps/user-web/src/pages/MyAuctionsPage.tsx';
import{DirectOrderListPage}from'/@fs/${source}/apps/user-web/src/pages/DirectOrderPage.tsx';
import{ReviewsPage}from'/@fs/${source}/apps/user-web/src/pages/ReviewsPage.tsx';
import{NotificationsPage}from'/@fs/${source}/apps/user-web/src/pages/NotificationsPage.tsx';
import{SupportPage}from'/@fs/${source}/apps/user-web/src/features/support/SupportPages.tsx';
import{MemberReputationView}from'/@fs/${source}/apps/user-web/src/features/reviews/MemberReputationView.tsx';
import{AuctionListPage}from'/@fs/${source}/apps/user-web/src/pages/AuctionListPage.tsx';
import ExchangeMinePage from'/@fs/${source}/apps/user-web/src/pages/ExchangeMinePage.tsx';
import{BookSearchPage}from'/@fs/${source}/apps/user-web/src/pages/BookSearchPage.tsx';
import{SupportQueuePage as AdminSupportQueuePage}from'/@fs/${source}/apps/admin-web/src/features/support/SupportPages.tsx';
import{session as adminSession}from'/@fs/${source}/apps/admin-web/src/core/session.ts';
if(location.pathname.startsWith('/operations-support'))import('/@fs/${source}/apps/admin-web/src/index.css');
import{session,queryClient}from'/@fs/${source}/apps/user-web/src/lib/session.ts';
import'/@fs/${source}/apps/user-web/src/styles/global.css';import'/@fs/${source}/packages/brand/v1.1/focus.css';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),now=new Date().toISOString();
const user={id:id(1),displayName:'Bạn đọc QA',email:'qa@pagination.test',status:'ACTIVE',roles:['MEMBER']};
const auth={status:'authenticated',user};session.getSnapshot=()=>auth;
window.qa={calls:[],fail:false,hold:false,release:null,cycle:false};
const rows=Array.from({length:25},(_,i)=>({id:id(i+100),title:'Sách QA '+(i+1),role:i%2?'Seller':'Buyer',state:'Completed',createdAt:now,completedAt:now,partnerId:id(2),partnerName:'Đối tác QA',transactionId:id(i+100),transactionType:'Exchange',reviewableAt:now,kind:'OrderCompleted',targetType:'Order',body:'Thông báo QA',readAt:null}));
const auction=i=>({id:id(400+i),listingId:id(500+i),title:'Phiên QA '+i,state:'Active',startPrice:50000,step:10000,buyNowPrice:null,currentPrice:null,minimumBid:50000,bidderCount:0,startAt:new Date(Date.now()-3600000).toISOString(),endAt:new Date(Date.now()+3600000).toISOString(),pointName:'Điểm QA',demoOnly:true});
const review=i=>({id:id(600+i),transactionType:'Exchange',transactionId:id(700+i),authorId:id(2),authorName:'Đối tác QA',targetUserId:user.id,partnerRating:5,bookRating:4,tags:[],comment:'Nhận xét QA '+i,version:1,status:'Published',createdAt:now,updatedAt:now,editDeadline:now,publishedAt:now,evidenceHeld:false,legacyDisclosed:false,reply:i===0?{id:id(990),text:'QA_PRIVATE_PENDING_REPLY',status:'Pending',createdAt:now}:null});
const read=async(url)=>{window.qa.calls.push(url);const p=new URL(url,location.origin),c=p.searchParams.get('cursor'),offset=c?20:0,chunk=rows.slice(offset,offset+20),nextCursor=c?null:'qa-next';
 if(url.startsWith('/operations/support-cases')){if(c&&window.qa.fail){window.qa.fail=false;throw Error('QA operations cursor failure');}return{items:chunk.map(r=>({...r,kind:'Feedback',state:'Open',reporterName:'Bạn đọc QA',assigneeId:null,target:null})),nextCursor,serverTime:now};}
 if(url.startsWith('/me/profile'))return{displayName:user.displayName,avatarId:null};
 if(url.startsWith('/me/auction-intakes'))return{items:[],serverTime:now};
 if(url.startsWith('/me/auctions'))return{items:chunk.map((_,i)=>({auction:auction(offset+i),role:'Bidder',leading:false,won:false,needsPayment:false,paymentDeadline:null})),nextCursor,serverTime:now};
 if(url.startsWith('/me/listings')&&c&&window.qa.fail){window.qa.fail=false;throw Error('QA picker cursor failure');}
 if(url.startsWith('/me/listings'))return{items:chunk.map(r=>({...r,version:1,channel:'Marketplace',state:{moderation:location.pathname==='/auctions/new'?'Approved':'Draft',visibility:location.pathname==='/auctions/new'?'Visible':'Hidden',trade:'Available'},currentRevision:{id:id(900),content:{title:r.title,mode:'Sale',salePrice:50000,condition:'Good',mediaIds:[]}}})),nextCursor};
 if(url.startsWith('/me/orders'))return{items:chunk,nextCursor,serverTime:now};
 if(url.startsWith('/me/review-transactions'))return{items:chunk,nextCursor,serverTime:now};
 if(url.startsWith('/me/notifications'))return{items:chunk,nextCursor,unreadCount:25,serverTime:now};
 if(url.startsWith('/me/support-cases'))return{items:chunk.map(r=>({...r,kind:'Feedback',state:'Open',target:null})),nextCursor,serverTime:now};
 if(url.startsWith('/members/'))return{userId:user.id,displayName:user.displayName,completedTransactions:25,verifiedViolations:0,reviewCount:25,partnerRatingCount:25,bookRatingCount:25,partnerRating:5,bookRating:4,items:chunk.map((_,i)=>review(offset+i)),nextCursor,serverTime:now};
 if(url==='/exchanges')return{items:rows.map(r=>({...r,status:'Completed',initiatorId:user.id,recipientId:id(2),initiatorListingId:id(300),recipientListingId:id(301),initiatorDeposit:50000,recipientDeposit:50000,diffAmount:0})),serverTime:now};
 if(url.startsWith('/listings/'))throw Error('QA has no legacy snapshot');
 if(url.startsWith('/auctions'))return{items:Array.from({length:25},(_,i)=>auction(i)),serverTime:now};
 if(url.startsWith('/listings?'))return{items:chunk.map(r=>({...r,mode:'Sale',salePrice:50000,exchangeValue:null,condition:'Good',author:'Tác giả QA',authors:['Tác giả QA'],thumbnailUrl:null,owner:{id:user.id,displayName:user.displayName},book:{title:r.title,authors:['Tác giả QA']},state:{moderation:'Approved',visibility:'Visible',trade:'Available'}})),nextCursor,serverTime:now};
 return{items:[],nextCursor:null,serverTime:now};};
session.request=read;session.publicRequest=read;adminSession.request=read;
function Generic(){const[filter,setFilter]=useState('all');const[owner,setOwner]=useState('one');const mode=new URLSearchParams(location.search).get('mode');
 const result=useInfiniteQuery({queryKey:['generic',owner],initialPageParam:0,getNextPageParam:p=>p.nextCursor??undefined,retry:false,queryFn:async({pageParam})=>{
  window.qa.calls.push('cursor-'+pageParam);if(pageParam&&window.qa.hold)await new Promise(r=>window.qa.release=r);if(pageParam&&window.qa.fail){window.qa.fail=false;throw Error('QA page failure');}
  if(mode==='long')return{items:Array.from({length:100},(_,i)=>({id:i,kind:'A'})),nextCursor:1};
  if(mode==='sparse'||mode==='cycle')return{items:Array.from({length:pageParam===2?1:10},(_,i)=>({id:pageParam*10+i,kind:pageParam===2?'B':'A'})),nextCursor:mode==='cycle'?1:pageParam===2?null:pageParam+1};
  return{items:Array.from({length:pageParam?5:20},(_,i)=>({id:i+(pageParam?20:0),kind:'A'})),nextCursor:pageParam?null:1};
 }});
 const collection=usePagedCollection(result,owner+filter,p=>p.flatMap(p=>p.items).filter(r=>filter==='all'||r.kind===filter));
 return <><Link to="/detail">Mở chi tiết bộ sưu tập</Link><button onClick={()=>setFilter('all')}>Tất cả QA</button><button onClick={()=>setFilter('B')}>Lọc B QA</button><button onClick={()=>setOwner('two')}>Đổi owner QA</button><div data-testid="rows">{collection.items.map(r=><article key={r.id}>Mục {r.id}</article>)}</div>{!collection.visible&&<p role="status">Chưa có mục QA</p>}<CollectionPager model={collection} itemLabel="mục QA"/></>;
}
function Cursor(){const navigation=useCursorNavigation('qa');return <><Link to="/detail">Chi tiết QA</Link><Link to="/cursor?q=new">Đổi bộ lọc QA</Link><CursorPager navigation={navigation} nextCursor={navigation.cursor==='c9'?null:'c'+((Number(navigation.cursor.slice(1))||0)+1)} count={10} busy={false} label="Cursor QA"/></>}
function Member(){return <MemberReputationView memberId={useParams().id}/>}
function App(){return <main style={{padding:16,maxWidth:1280,margin:'auto',fontFamily:'var(--shop-body)'}}><p>QA giao diện — dữ liệu giả, không ghi DB</p><Routes><Route element={<Outlet context={{...user,roles:new URLSearchParams(location.search).has("denied")?["MEMBER"]:["ADMIN"]}}/>}><Route path="/operations-support" element={<AdminSupportQueuePage/>}/></Route><Route path="/" element={<Generic/>}/><Route path="/cursor" element={<Cursor/>}/><Route path="/detail" element={<p>Chi tiết QA</p>}/><Route path="/my-books" element={<MyBooksPage/>}/><Route path="/auctions/new" element={<CreateAuctionPage/>}/><Route path="/auctions/mine" element={<MyAuctionsPage/>}/><Route path="/orders" element={<DirectOrderListPage/>}/><Route path="/notifications" element={<NotificationsPage/>}/><Route path="/reviews" element={<ReviewsPage/>}/><Route path="/support" element={<SupportPage/>}/><Route path="/members/:id" element={<Member/>}/><Route path="/auctions" element={<AuctionListPage/>}/><Route path="/exchange/mine" element={<ExchangeMinePage/>}/><Route path="/books" element={<BookSearchPage/>}/></Routes></main>};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><BrowserRouter><App/></BrowserRouter></QueryClientProvider>);
`);
const server = await createServer({ configFile: false, root: out, publicDir: path.join(root, 'apps/user-web/public'), plugins: [react()], cacheDir: path.join(out, 'vite'),
  resolve: { alias: Object.fromEntries(['react','react-dom','@tanstack/react-query','react-router-dom'].map(n => [n,path.join(root,'apps/user-web/node_modules',n)])), dedupe: ['react','react-dom'] },
  server: { host: '127.0.0.1', port: 5185, strictPort: true, fs: { allow: [root] } } });
let browser; const errors=[]; const results=[];
try {
  await server.listen(); browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message)); await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.fulfill({status:404,body:''})); await page.route('**/api/**',r=>r.fulfill({status:401,json:{code:'QA_NO_API'}}));
  const origin='http://127.0.0.1:5185',nav=page.getByRole('navigation',{name:'Điều hướng phân trang'});
  const next=()=>nav.getByRole('button',{name:'Đến trang tiếp theo',exact:true}),prev=()=>nav.getByRole('button',{name:'Đến trang trước',exact:true});
  await page.goto(origin);await expect(page.locator('article')).toHaveCount(10);await next().click();await expect(nav).toContainText('11–20');assert.equal(await page.evaluate(()=>window.qa.calls.length),1);
  await page.goBack();await expect(nav).toContainText('1–10');await page.goForward();await expect(nav).toContainText('11–20');
  await page.getByRole('link',{name:'Mở chi tiết bộ sưu tập'}).click();await page.goBack();await expect(nav).toContainText('11–20');
  await page.getByRole('button',{name:'Lọc B QA'}).click();await page.getByRole('button',{name:'Tất cả QA'}).click();await expect(nav).toContainText('1–10');await next().click();
  await page.evaluate(()=>window.qa.fail=true);await next().click();await expect(page.getByRole('alert')).toContainText('Dữ liệu đang xem vẫn được giữ');await expect(page.locator('article')).toHaveCount(10);
  await page.evaluate(()=>window.qa.hold=true);await next().click();await expect(next()).toBeDisabled();await next().evaluate(n=>{n.click();n.click()});assert.equal(await page.evaluate(()=>window.qa.calls.length),3);
  await page.evaluate(()=>window.qa.release());await expect(page.locator('article')).toHaveCount(5);await expect(nav).toContainText('21–25 trong 25');await prev().click();await expect(nav).toContainText('11–20');
  await page.getByRole('button',{name:'Đổi owner QA'}).click();await expect(nav).toContainText('1–10');
  await page.goto(origin+'?mode=sparse');await expect(page.locator('article')).toHaveCount(10);await page.getByRole('button',{name:'Lọc B QA'}).click();await expect(page.locator('article')).toHaveCount(0);await next().click();await expect(page.locator('article')).toHaveCount(1);assert.equal(await page.evaluate(()=>window.qa.calls.length),3,'searches past sparse source pages');
  await page.goto(origin+'?mode=cycle');await expect(page.locator('article')).toHaveCount(10);await page.getByRole('button',{name:'Lọc B QA'}).click();await next().click();await expect(page.getByRole('alert')).toContainText('cursor đã đọc');assert.equal(await page.evaluate(()=>window.qa.calls.length),2,'cursor cycle cannot loop');
  await page.goto(origin);await expect(page.locator('article')).toHaveCount(10);await page.evaluate(()=>window.qa.hold=true);await next().click();await next().click();await expect.poll(()=>page.evaluate(()=>typeof window.qa.release)).toBe('function');await page.getByRole('button',{name:'Lọc B QA'}).click();await page.evaluate(()=>window.qa.release());await expect(page.locator('article')).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'Chưa có mục QA'})).toBeVisible();await expect(nav).toHaveCount(0);assert.deepEqual(await page.evaluate(()=>history.state.usr.latlaiCollection),{scope:'oneB',page:1},'late source response cannot change filtered page');
  await page.goto(origin+'/cursor');const cursorNav=page.getByRole('navigation',{name:'Cursor QA'}),cn=()=>cursorNav.getByRole('button',{name:'Đến trang tiếp theo'});
  await cn().evaluate(n=>{n.click();n.click()});await expect(cursorNav).toContainText('Trang 2');await cn().click();await expect(cursorNav).toContainText('Trang 3');await page.goBack();await expect(cursorNav).toContainText('Trang 2');await page.goForward();await expect(cursorNav).toContainText('Trang 3');
  await page.getByRole('link',{name:'Chi tiết QA',exact:true}).click();await page.goBack();await expect(cursorNav).toContainText('Trang 3');await page.reload();await expect(cursorNav).toContainText('Trang 3');
  await page.goto(origin+'/cursor?cursor=pasted');await expect(cursorNav).toContainText('Trang hiện tại');await cursorNav.getByRole('button',{name:'Về trang đầu',exact:true}).click();await expect(cursorNav).toContainText('Trang 1');
  async function choosePage(pager,target){
    const button=pager.getByRole('button',{name:'Trang '+target,exact:true});
    if(await button.isVisible())return button.click();
    for(const more of await pager.getByRole('button',{name:/^Chọn trang /}).all()){
      if(!await more.isVisible())continue;
      const [from,to]=(await more.getAttribute('aria-label')).match(/\d+/g).map(Number);
      if(target>=from&&target<=to){await more.click();return pager.getByRole('dialog').getByRole('button',{name:'Trang '+target,exact:true}).click();}
    }
    assert.fail('Requested page is not reachable: '+target);
  }
  for(const width of[1440,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto(origin+'?mode=long');await expect(page.locator('article')).toHaveCount(10);
    if(width===320)await page.evaluate(()=>document.documentElement.style.fontSize='130%');
    await choosePage(nav,10);await expect(nav.getByRole('button',{name:'Trang 10',exact:true})).toHaveAttribute('aria-current','page');
    await nav.getByRole('button',{name:'Trang 2',exact:true}).click();await expect(nav.getByRole('button',{name:'Trang 2',exact:true})).toHaveAttribute('aria-current','page');await expect(page.locator('article').first()).toHaveText('Mục 10');
    assert.equal(await page.evaluate(()=>window.qa.calls.length),1,'10→2 is one numbered click and no intermediate fetches');
    assert.equal(await nav.locator('input').count(),0,'no jump form');await expect(next()).toBeEnabled();
    await choosePage(nav,7);await expect(nav.getByRole('button',{name:'Trang 7',exact:true})).toHaveAttribute('aria-current','page');
    const visibleMore=nav.getByRole('button',{name:/^Chọn trang /}).filter({visible:true}).first();await visibleMore.click();await expect(nav.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(nav.getByRole('dialog')).toHaveCount(0);
    const box=await nav.boundingBox();for(const control of await nav.getByRole('button').all())if(await control.isVisible()){const b=await control.boundingBox();assert.ok(b.x>=box.x-1&&b.x+b.width<=box.x+box.width+1,'numbered controls fit');}
    await nav.screenshot({path:path.join(out,'numbered-'+width+'.png')});
  }
  await page.goto(origin+'/cursor?long=1');for(let n=2;n<=10;n++){await cn().click();await expect(cursorNav).toContainText('Trang '+n);}
  await cursorNav.getByRole('button',{name:'Trang 2',exact:true}).click();await expect(cursorNav).toContainText('Trang 2');assert.equal(new URL(page.url()).searchParams.get('cursor'),'c1');
  await cn().click();await expect(cursorNav).toContainText('Trang 3');
  await choosePage(cursorNav,10);await expect(cursorNav).toContainText('Trang 10');await page.goBack();await expect(cursorNav).toContainText('Trang 3');await page.goForward();await expect(cursorNav).toContainText('Trang 10');
  await cursorNav.getByRole('button',{name:'Trang 1',exact:true}).click();await expect(cursorNav).toContainText('Trang 1');
  await cursorNav.getByRole('button',{name:'Trang 2',exact:true}).click();await page.reload();await expect(cursorNav).toContainText('Trang 2');
  await page.goto(origin+'/my-books');const shelfPager=page.getByRole('navigation',{name:'Trang kệ sách',exact:true});
  await shelfPager.waitFor();await page.evaluate(()=>window.qa.fail=true);await shelfPager.getByRole('button',{name:'Đến trang tiếp theo'}).click();await expect(page.getByRole('alert')).toContainText('Chưa tải được kệ sách');
  assert.equal(await page.locator('#owner-shelf-results').evaluate(n=>n===document.activeElement||n.querySelector('[role="alert"]')?.contains(document.activeElement)),false,'failed cursor read must not steal focus into results');
  // Render and operate each actual screen, desktop and phone together.
  const screens=[['search','/books?data=preview','Phân trang sách'],['shelf','/my-books','Trang kệ sách'],['mine','/auctions/mine','Trang đấu giá của tôi'],['orders','/orders','Điều hướng phân trang'],['notifications','/notifications','Điều hướng phân trang'],['reviews','/reviews?tab=pending&type=Exchange','Điều hướng phân trang'],['support','/support','Điều hướng phân trang'],['reputation','/members/00000000-0000-4000-8000-000000000001','Điều hướng phân trang'],['exchange','/exchange/mine?tab=done','Phân trang trao đổi'],['auctions','/auctions','Phân trang đấu giá đang mở']];
  for(const [name,url,label]of screens)for(const width of[1440,768,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto(origin+'/detail?reset='+name+width);await page.goto(origin+url);const pager=page.getByRole('navigation',{name:label,exact:true});await pager.waitFor();await page.evaluate(s=>document.documentElement.style.fontSize=s,width===320?'130%':'100%');await page.evaluate(()=>document.fonts.ready);assert.equal(await page.getByText('QA_PRIVATE_PENDING_REPLY',{exact:true}).count(),0,'pending reply stays private');
    await pager.getByRole('button',{name:'Đến trang tiếp theo',exact:true}).click();await expect(pager).toContainText(/Trang 2/);
    const anchors={shelf:'owner-shelf-results',mine:'my-auction-results',orders:'direct-order-results',notifications:'notification-results',reviews:'review-transaction-results',reputation:'public-reviews-results',support:'support-list-start',exchange:'panel-done',auctions:'auction-list-title'};
    if(anchors[name])await expect.poll(()=>page.locator('#'+anchors[name]).evaluate(n=>n.contains(document.activeElement))).toBe(true);
    const box=await pager.boundingBox();for(const button of await pager.getByRole('button').all())if(await button.isVisible()){const b=await button.boundingBox();assert.ok(b.x>=box.x-1&&b.x+b.width<=box.x+box.width+1,name+' pager fits');if(width<=390)assert.ok(b.height>=44&&b.width>=44,name+' mobile touch target');}
    // Search has sequential exit/enter + staggered cards. Capture the rendered
    // new shelf, not the intentional blank frame between those two animations.
    if(name==='search')await page.waitForTimeout(1100);
    await pager.scrollIntoViewIfNeeded();
    await page.evaluate(async()=>{for(let pass=0;pass<2;pass++)await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{})));});
    if(name==='exchange'||name==='auctions')assert.equal(await pager.evaluate(n=>getComputedStyle(n).marginTop),'24px','snapshot footer keeps space above its divider');
    if(name==='reputation'&&width<=390){
      const score=page.locator('[class*="scoreSegment"] strong').first();
      assert.equal(await score.evaluate(n=>{const range=document.createRange();range.selectNodeContents(n);return new Set([...range.getClientRects()].map(r=>Math.round(r.top))).size;}),1,'rating stays on one line');
      const label=page.locator('[class*="scoreSegmentLabel"]').first();assert.ok((await label.boundingBox()).width>100,'review labels are not crushed beside stars');
    }
    const more=pager.getByRole('button',{name:/^Chọn trang /}).filter({visible:true}).first();
    if(await more.isVisible()){
      await more.click();const menu=pager.getByRole('dialog');await expect(menu).toBeVisible();
      const popup=await menu.boundingBox();assert.ok(popup.x>=0&&popup.x+popup.width<=width+1&&popup.y>=0&&popup.y+popup.height<=1001,name+' menu stays in viewport');
      const choice=menu.getByRole('button',{name:/^Trang /}).first();await expect(choice).toBeFocused();await page.keyboard.press('ArrowRight');await expect(menu.getByRole('button',{name:/^Trang /}).nth(1)).toBeFocused();
      assert.equal(await choice.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,name+' menu is not clipped');
      await page.keyboard.press('Escape');await expect(more).toBeFocused();
    }
    await page.screenshot({path:path.join(out,name+'-'+width+'.png')});results.push({screen:name,width,page2:'PASS',focus:anchors[name]?'PASS':'existing search heading',popup:'checked when present'});
  }
  // Each public auction shelf owns its page and returns focus to its own heading.
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/auctions');
  const upcomingPager=page.getByRole('navigation',{name:'Phân trang đấu giá sắp mở',exact:true});await upcomingPager.getByRole('button',{name:'Đến trang tiếp theo'}).click();await expect(upcomingPager).toContainText('Trang 2');await expect(page.locator('#auction-upcoming-title')).toBeFocused();
  assert.equal(new URL(page.url()).searchParams.get('auctionPage'),null,'upcoming paging does not move the active shelf');
  await page.goBack();await expect(upcomingPager).toContainText('Trang 1');
  await page.goto(origin+'/auctions/new');const radios=page.locator('input[name="auction-book"]');await expect(radios).toHaveCount(20);await radios.first().check();const price=page.locator('#auction-start');await price.fill('70000');await expect(price).toHaveValue('70.000');
  await page.evaluate(()=>window.qa.fail=true);await page.getByRole('button',{name:'Tải thêm sách từ kệ',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Sách đã chọn và giá đang nhập vẫn được giữ');await expect(radios.first()).toBeChecked();await expect(price).toHaveValue('70.000');
  await page.getByRole('button',{name:'Thử tải sách cũ hơn',exact:true}).click();await expect(radios).toHaveCount(25);await expect(radios.first()).toBeChecked();await expect(price).toHaveValue('70.000');const pickerReads=await page.evaluate(()=>window.qa.calls.filter(p=>p.startsWith('/me/listings')&&p.includes('cursor=')));assert.equal(pickerReads[0],pickerReads[1],'picker retry keeps its cursor');
  for(const width of[1440,390]){
    await page.setViewportSize({width,height:1000});await page.goto(origin+'/operations-support');const operations=page.getByRole('navigation',{name:'Phân trang',exact:true});await operations.waitFor();await expect(page.locator('article')).toHaveCount(20);
    await page.evaluate(()=>window.qa.fail=true);await operations.getByRole('button',{name:'Xem thêm hồ sơ',exact:true}).click();await expect(operations.getByRole('button',{name:'Thử tải thêm',exact:true})).toBeVisible();await expect(page.locator('article')).toHaveCount(20);
    await operations.getByRole('button',{name:'Thử tải thêm',exact:true}).click();await expect(page.locator('article')).toHaveCount(25);await expect(operations).toContainText('Đã tải hết danh sách');
    await operations.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'operations-support-'+width+'.png')});results.push({screen:'operations-support',width,page2:'PASS'});
  }
  await page.goto(origin+'/operations-support?denied=1');await expect(page.getByText('Cần quyền Admin đang hoạt động để xử lý phản ánh.',{exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.qa.calls.length),0,'denied operator does not read support queue');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'result.json'),JSON.stringify({status:'PASS',screens:results,behavior:['cached paging','error retains page','same-cursor retry','pending double click','identity reset','sparse filter scan','cursor cycle guard','stale filter response','URL Back/Forward','detail Back','reload','pasted cursor','collection Back/Forward and detail Back','filter reset on return','picker retry keeps selection and price','Admin support retry and denied role'],pageErrors:errors.length,environment:'Actual React screens + in-memory read transport; no DB/API/provider'},null,2));
  console.log('PASS list pagination: shared state/error/race/cursor tests and '+results.length+' actual screen/viewport checks; no DB.');
} finally {await browser?.close();await server.close();}
