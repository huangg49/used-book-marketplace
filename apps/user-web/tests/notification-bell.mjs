// Browser HTTP fixtures only: no Mongo, provider calls or real read mutations.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const web=createRequire(new URL('../package.json',import.meta.url));
const {chromium}=createRequire(new URL('../../admin-web/package.json',import.meta.url))('playwright');
const origin='http://127.0.0.1:5192',out=path.join(root,'.tmp/notification-dropdown');
const user={id:randomUUID(),email:'reader@notification-qa.test',displayName:'Bạn đọc QA',status:'ACTIVE',roles:['MEMBER']};
const now=Date.now(),target=randomUUID();
const original=Array.from({length:8},(_,i)=>({id:randomUUID(),kind:i===0?'AuctionCancelled':'AuctionOutbid',targetType:'Auction',targetId:target,title:i===0?'Phiên đấu giá đã bị hủy':'Bạn đã bị vượt giá',body:i===0?'“One Piece Strong Words” đã bị quản trị viên hủy. Lượt trả giá của bạn hết hiệu lực.':'“One Piece Strong Words”: giá hiện tại 2.550.000đ. Trả từ 2.600.000đ để dẫn lại.',createdAt:new Date(now-i*60000).toISOString(),readAt:i<3?null:new Date(now).toISOString()}));
let server,browser,mode='normal',items=structuredClone(original),failRead=true,readCalls=0;
try{
 await mkdir(out,{recursive:true});
 const {createServer}=await import(pathToFileURL(web.resolve('vite')).href);
 server=await createServer({root:path.join(root,'apps/user-web'),server:{host:'127.0.0.1',port:5192,strictPort:true},define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify(origin+'/api/v1')},logLevel:'error'});await server.listen();
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.routeWebSocket(/\/socket\.io\//,s=>s.close());
 await context.route('**/api/v1/**',async route=>{
  const request=route.request(),endpoint=new URL(request.url()).pathname.replace('/api/v1','');
  const send=(json,status=200)=>route.fulfill({json,status});
  if(endpoint==='/auth/login')return send({accessToken:'fixture',refreshToken:'r'.repeat(43),expiresIn:900,user});
  if(endpoint==='/auth/me')return send(user);
  if(endpoint==='/me/notifications'){
   if(mode==='error')return send({code:'UNAVAILABLE',message:'QA offline'},503);
   return send({items:mode==='empty'?[]:items,unreadCount:mode==='empty'?0:items.filter(x=>!x.readAt).length,nextCursor:null});
  }
  if(endpoint==='/me/notifications/read'){
   readCalls++;assert.equal(request.method(),'POST');
   if(failRead)return send({code:'UNAVAILABLE',message:'QA read failure'},503);
   const body=JSON.parse(request.postData());assert(request.headers()['idempotency-key']);
   items=items.map(x=>body.all||body.ids?.includes(x.id)?{...x,readAt:new Date().toISOString()}:x);
   return send({unreadCount:items.filter(x=>!x.readAt).length});
  }
  assert.equal(request.method(),'GET','No unrelated mutations');
  if(endpoint==='/auctions')return send({items:[],nextCursor:null,serverTime:new Date().toISOString()});
  return send({code:'UNAVAILABLE',message:'Unrelated QA endpoint'},503);
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login?returnUrl=%2Fauctions');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill('QA-only-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL('**/auctions');
 const bell=page.getByRole('button',{name:/^Thông báo/}),panel=page.getByRole('region',{name:'Thông báo gần đây'});
 await bell.click();await panel.getByRole('heading',{name:'Phiên đấu giá đã bị hủy'}).waitFor();
 for(const [width,height]of [[1440,1000],[390,844],[320,640],[950,400]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  const box=await panel.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert(box.y>=0&&box.y+box.height<=height+1);
  assert(await panel.getByRole('link',{name:'Xem tất cả thông báo'}).isVisible());
  const list=panel.locator('ul');await list.hover();await page.mouse.wheel(0,500);await page.waitForTimeout(100);assert(await list.evaluate(el=>el.scrollTop>0));
  await list.evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,`dropdown-${width}.png`)});
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='130%');
 assert(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:path.join(out,'dropdown-large-text.png')});
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert(await bell.evaluate(el=>el===document.activeElement));
 await bell.press('Enter');await panel.waitFor();const readAll=panel.getByRole('button',{name:'Đánh dấu tất cả đã đọc',exact:true});
 await readAll.click();await panel.getByRole('alert').waitFor();assert.equal(await panel.getByText('3 mới').count(),1);
 failRead=false;await readAll.click();await page.getByRole('button',{name:'Thông báo',exact:true}).waitFor();assert.equal(await panel.getByText('3 mới').count(),0);assert.equal(readCalls,2);
 await page.evaluate(()=>document.documentElement.style.fontSize='100%');
 await page.keyboard.press('Escape');mode='error';await bell.click();await panel.getByText('Chưa tải được danh sách thông báo.').waitFor();mode='empty';await panel.getByRole('button',{name:'Thử lại',exact:true}).click();await panel.getByText('Chưa có thông báo nào',{exact:true}).waitFor();
 await page.keyboard.press('Escape');mode='normal';await bell.click();await panel.getByRole('heading',{name:'Phiên đấu giá đã bị hủy'}).waitFor();await panel.getByRole('button',{name:/^Phiên đấu giá đã bị hủy:/}).click();await page.waitForURL('**/auctions/'+target);assert.equal(await panel.count(),0);
 assert.deepEqual(errors,[]);console.log('PASS notification dropdown: responsive/short viewport/130% text, wheel, Escape focus/Enter, unread state, mark-all failure/retry/ACK, empty/read-error recovery and exact target link. HTTP fixtures only.');
}finally{await browser?.close();await server?.close();}
