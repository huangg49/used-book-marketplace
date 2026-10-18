// All API calls and Socket.IO use isolated fixtures. No application DB/storage.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer as httpServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url)),req=createRequire(path.join(root,'apps/admin-web/package.json')),webReq=createRequire(path.join(root,'apps/user-web/package.json')),apiReq=createRequire(path.join(root,'apps/api/package.json'));
const {chromium}=req('playwright');
const {Server}=createRequire(apiReq.resolve('@nestjs/platform-socket.io'))('socket.io');
const {createServer}=await import(pathToFileURL(webReq.resolve('vite')).href);
const out=path.join(root,'.tmp/unified-chat-qa');await mkdir(out,{recursive:true});
const origin='http://127.0.0.1:5193',api='http://127.0.0.1:5195';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const future=()=>new Date(Date.now()+3600_000).toISOString();
const buyer={id:id(1),displayName:'Lan Anh'},seller={id:id(2),displayName:'Minh — Người giữ những cuốn sách cũ'};
const room={id:id(3),listingId:id(4),buyer,seller,version:1,status:'Active',expiresAt:null,hasQuote:false,quotePreview:null,orderId:null,createdAt:new Date().toISOString(),closedAt:null};
room.terms={mode:'Negotiation',pendingProposal:null,agreedPrice:null,agreedListingRevisionId:null,activeExchangeId:null,exchangeIds:[],locked:false};
const agreementEvents=[],termsCommands=[];let termsFailure=true,proposalSequence=200,linkedExchange;
const listing=(number,owner,title)=>({id:id(number),revisionId:id(number+100),version:1,book:{id:id(number+200),title,authors:['Tác giả minh họa'],publisher:null,publicationYear:null,language:'vi',edition:null,category:'Văn học',isbn:null},mode:'Both',condition:'Good',pages:'Đủ trang',coverNote:'Bìa có nếp gấp nhỏ',notes:'Không',accessories:'Không',readable:true,hasMissingPages:false,missingEssentialContent:false,description:'Dữ liệu minh họa kiểm tra chat',salePrice:80000,exchangeValue:80000,seller:owner,photos:[],publishedAt:new Date().toISOString(),fulfillment:{serviceAreaCode:'HCM-DEMO-v1',name:'TP.HCM',demoOnly:true,method:'DirectDelivery'},purchaseAvailability:{status:'Available',expiresAt:null}});
const books=new Map([[id(4),listing(4,seller,'Doraemon — Cuốn sách qua những người đọc')],[id(5),listing(5,buyer,'Những ngày thơ ấu')]]);
const quote=()=>({destination:{recipientName:'Lan Anh',phone:'0900000000',serviceAreaCode:'HCM-DEMO-v1',localityCode:'DEMO-A',detail:'Địa chỉ minh họa QA'},shippingFee:20000,expiresAt:future()});
const ex={id:id(6),initiatorId:buyer.id,recipientId:seller.id,initiatorListingId:id(5),recipientListingId:id(4),status:'Proposed',revision:1,initiatorDeposit:80000,recipientDeposit:80000,diffAmount:0,diffPayerId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastProposedById:buyer.id};
let historyError=false,exchangeError=true,exchangeSendError=false,dropMessage=true,createFailure=true,payFailure=true,orderState='AwaitingPayment';
const messages=[],exchangeMessages=[{id:id(8),exchangeId:ex.id,senderId:seller.id,body:'[Hệ thống] Tin này do thành viên gõ, không phải thông báo thanh toán.',sentAt:new Date().toISOString()}],sent=[],commands=[],issues=[];
let vite,browser,io,http;
try{
 http=httpServer();io=new Server(http,{cors:{origin:true}});
 io.of('/purchase-chat').on('connection',socket=>{
  socket.on('purchase:join',(rid,ack)=>{socket.join(rid);ack({ok:true});});
  socket.on('purchase:send',(input,ack)=>{
   sent.push(input);let message=messages.find(m=>m.id===input.messageId);
   if(!message){message={id:input.messageId,conversationId:input.conversationId,senderId:buyer.id,body:input.body,sentAt:new Date().toISOString()};messages.push(message);}
   if(dropMessage){dropMessage=false;return;}ack(message);io.of('/purchase-chat').to(room.id).emit('purchase:message',message);
  });
 });
 await new Promise(r=>http.listen(5195,'127.0.0.1',r));
 vite=await createServer({root:path.join(root,'apps/user-web'),server:{host:'127.0.0.1',port:5193,strictPort:true},define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify(api+'/api/v1')}});await vite.listen();
 browser=await chromium.launch({headless:true});
 const makePage=async role=>{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>issues.push(e.message));
  await page.route('**/api/v1/**',async route=>{
   const request=route.request(),s=new URL(request.url()).pathname.replace('/api/v1',''),method=request.method();
   const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(s==='/auth/login')return send({accessToken:'fixture-'+role,refreshToken:'a'.repeat(43),expiresIn:900,user:{...(role==='buyer'?buyer:seller),email:role+'@example.test',roles:['MEMBER'],status:'ACTIVE'}});
   if(s==='/me/purchase-conversations')return send([room]);
   if(s===`/me/purchase-conversations/${room.id}`)return send(room);
   if(s===`/me/purchase-conversations/${room.id}/events`)return send(agreementEvents);
   if(s.startsWith(`/listings/${room.listingId}/purchase-conversations`))return send({id:id(190),entityType:'PurchaseConversation',entityId:room.id,listingId:room.listingId,version:room.version,status:room.status,expiresAt:null,serverTime:new Date().toISOString()});
   if(s===`/me/purchase-conversations/${room.id}/terms`||s===`/me/purchase-conversations/${room.id}/terms/respond`){
    const body=JSON.parse(request.postData());termsCommands.push({s,key:request.headers()['idempotency-key'],body:request.postData()});
    if(termsFailure){termsFailure=false;return send({code:'UNAVAILABLE',message:'Fixture lost response'},503);}
    const actor=role==='buyer'?buyer:seller;
    if(s.endsWith('/respond')){
      const proposal=room.terms.pendingProposal;
      if(body.accept){if(proposal.kind==='Mode'){room.terms.mode=proposal.mode;room.terms.agreedPrice=null;room.terms.agreedListingRevisionId=null;room.quotePreview=null;room.hasQuote=false;room.terms.activeExchangeId=null;}else{room.terms.agreedPrice=proposal.amount;room.terms.agreedListingRevisionId=proposal.listingRevisionId;}}
      agreementEvents.push({id:id(++proposalSequence),conversationId:room.id,actorId:actor.id,kind:body.accept?(proposal.kind==='Price'?'PriceAccepted':'ModeAccepted'):'ProposalDeclined',mode:proposal.mode,amount:proposal.amount,exchangeId:null,createdAt:new Date().toISOString()});
      room.terms.pendingProposal=null;
    }else{
      const mode=body.kind==='Price'?null:body.kind==='RequestExchange'?'Exchange':body.mode;
      room.terms.pendingProposal={id:id(++proposalSequence),kind:body.kind==='Price'?'Price':'Mode',proposedById:actor.id,mode,amount:body.amount??null,listingRevisionId:books.get(room.listingId).revisionId,createdAt:new Date().toISOString()};
      agreementEvents.push({id:id(++proposalSequence),conversationId:room.id,actorId:actor.id,kind:body.kind==='Price'?'PriceProposed':'ModeProposed',mode,amount:body.amount??null,exchangeId:null,createdAt:new Date().toISOString()});
    }
    room.version++;return send({id:id(++proposalSequence),entityType:'PurchaseConversation',entityId:room.id,listingId:room.listingId,version:room.version,status:room.status,expiresAt:null,serverTime:new Date().toISOString()});
   }
   if(s==='/me/addresses')return send({version:1,items:[{id:id(80),recipientName:'Lan Anh',phone:'0900000000',detail:'Địa chỉ mô phỏng',serviceAreaCode:'HCM-DEMO-v1',localityCode:'DEMO-A',version:1,isDefault:true}]});
   if(s==='/me/listings')return send({items:[{id:id(5),version:1,catalogStatus:'Confirmed',state:{moderation:'Approved',visibility:'Visible',trade:'Available'},currentRevision:{id:id(105),content:{bookId:id(205),exchangeValue:80000,mode:'Both'}}}],nextCursor:null});
   if(s===`/catalog/books/${id(205)}`)return send(books.get(id(5)).book);
   if(s==='/exchanges'&&method==='POST'){linkedExchange={...ex,id:id(60)};room.terms.activeExchangeId=linkedExchange.id;room.terms.exchangeIds.push(linkedExchange.id);room.terms.locked=true;room.version++;return send(linkedExchange,201);}
   if(s===`/exchanges/${id(60)}`)return send(linkedExchange);
   if(s===`/exchanges/${id(60)}/cancel`){linkedExchange.status='Cancelled';linkedExchange.cancelReason='CancelledByUser';linkedExchange.cancelledBy='Initiator';room.terms.locked=false;room.terms.activeExchangeId=null;room.version++;return send(linkedExchange);}
   if(s==='/exchanges')return send({items:[ex,...(linkedExchange?[linkedExchange]:[])],nextCursor:null});

   if(s.endsWith('/messages')&&s.startsWith('/me/purchase-conversations/'))return historyError?send({code:'Unavailable',message:'Fixture outage'},503):send(messages);
   if(s==='/service-areas')return send({code:'HCM-DEMO-v1',localities:[{code:'DEMO-A',label:'TP.HCM'}]});
   if(s.startsWith('/listings/')&&books.has(s.split('/')[2]))return send(books.get(s.split('/')[2]));
   if(s===`/me/orders/${id(7)}`)return send({id:id(7),role:role==='buyer'?'Buyer':'Seller',version:1,state:orderState,paymentDeadline:future(),paymentEnabled:role==='buyer'&&orderState==='AwaitingPayment',amounts:{bookPrice:75000,shippingFee:20000,buyerTotal:95000}});
   if(s==='/orders'&&method==='POST'){
    commands.push({s,key:request.headers()['idempotency-key'],body:request.postData()});
    if(createFailure){createFailure=false;return send({code:'Unavailable',message:'Fixture lost response'},503);}
    room.status='OrderCreated';room.terms.locked=true;room.orderId=id(7);room.version++;room.closedAt=new Date().toISOString();
    return send({id:id(30),entityType:'Order',entityId:id(7),contextId:id(31),version:1,state:'AwaitingPayment',paymentDeadline:future(),serverTime:new Date().toISOString(),affectedListings:[{id:room.listingId,version:2}]});
   }
   if(s===`/orders/${id(7)}/pay`){
    commands.push({s,key:request.headers()['idempotency-key'],body:request.postData()});
    if(payFailure){payFailure=false;return send({code:'Unavailable',message:'Fixture lost response'},503);}
    orderState='PendingSellerConfirmation';return send({id:id(32),entityType:'Order',entityId:id(7),contextId:id(31),version:2,state:orderState,paymentDeadline:future(),serverTime:new Date().toISOString(),affectedListings:[{id:room.listingId,version:2}]});
   }
   if(s===`/exchanges/${ex.id}`)return send(ex);
   if(s===`/exchanges/${ex.id}/messages`){
    if(method==='GET')return exchangeError?send({code:'Unavailable',message:'Fixture outage'},503):send({items:exchangeMessages});
    if(exchangeSendError)return send({code:'Unavailable',message:'Fixture outage'},503);
    const message={id:id(10),exchangeId:ex.id,senderId:buyer.id,body:JSON.parse(request.postData()).body,sentAt:new Date().toISOString()};exchangeMessages.push(message);return send(message,201);
   }
   if(s.includes('notifications'))return send({items:[],nextCursor:null,unreadCount:0});
   return send({items:[],nextCursor:null});
  });
  await page.goto(origin+'/login');await page.evaluate(async({role,rid})=>{const{session}=await import('/src/lib/session.ts');await session.login({email:role+'@example.test',password:'fixture-only'});const{router}=await import('/src/app/router.tsx');await router.navigate('/chat/'+rid);},{role,rid:room.id});return page;
 };
 const refresh=page=>page.evaluate(async()=>{const{queryClient}=await import('/src/lib/session.ts');await Promise.all(['purchase-conversations','purchase-conversation','conversation-events'].map(key=>queryClient.invalidateQueries({queryKey:[key]})));});
 const captures=async(page,label)=>{
  if(process.env.CHAT_GUIDANCE_SCREENSHOTS==='0')return;
  for(const [width,scale]of[[1440,100],[390,100],[320,130]]){
   await page.setViewportSize({width,height:1100});await page.evaluate(v=>document.documentElement.style.fontSize=v+'%',scale);await page.evaluate(()=>scrollTo(0,0));
   await page.waitForFunction(()=>document.getAnimations().filter(a=>a.animationName==='details-sweep').every(a=>a.playState==='finished'));
   await page.screenshot({path:path.join(out,`${label}-${width}-${scale}.png`),fullPage:true});
   if(width<760){const tab=page.getByRole('button',{name:'Hội thoại',exact:true});if(await tab.count()){await tab.click();await page.screenshot({path:path.join(out,`${label}-chat-${width}-${scale}.png`),fullPage:true});await page.getByRole('button',{name:'Phiếu thỏa thuận',exact:true}).click();}}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+label+' '+width);
  }
  await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>document.documentElement.style.fontSize='100%');
 };
 const p=await makePage('buyer');
 await p.evaluate(async listingId=>{const{router}=await import('/src/app/router.tsx');await router.navigate(`/chat/start/${listingId}?intent=Negotiation`);},room.listingId);await p.waitForURL('**/chat/'+room.id);

 await p.getByRole('heading',{name:'Trao đổi trước khi chốt mua',exact:true}).waitFor();
 await p.getByRole('link',{name:'Gửi thông tin nhận sách',exact:true}).waitFor();await captures(p,'buyer-start');
 await p.getByRole('button',{name:'Soạn lời chào',exact:true}).click();assert.ok((await p.locator('#chat-message').inputValue()).includes('Chào bạn'));assert.equal(sent.length,0,'suggestion never sends');
 await p.locator('#chat-message').fill('Nội dung giữ nguyên khi mất xác nhận.');await p.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();await p.getByText('Chưa xác nhận được tin nhắn đã gửi. Thử lại sẽ gửi cùng tin này.',{exact:true}).waitFor({timeout:20000});
 assert.equal(await p.locator('#chat-message').inputValue(),'Nội dung giữ nguyên khi mất xác nhận.');await p.getByRole('button',{name:'Thử gửi lại',exact:true}).click();await p.waitForFunction(()=>document.getElementById('chat-message').value==='');assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(messages.length,1);
 const sellerPage=await makePage('seller');
 await p.getByLabel('Đề nghị giá sách (₫)',{exact:true}).fill('75000');await p.getByRole('button',{name:'Gửi đề nghị',exact:true}).click();await p.getByRole('button',{name:'Thử lại thao tác trước',exact:true}).waitFor();
 assert.equal(await p.getByLabel('Đề nghị giá sách (₫)',{exact:true}).inputValue(),'75000');await p.getByRole('button',{name:'Thử lại thao tác trước',exact:true}).click();await refresh(sellerPage);await sellerPage.getByRole('button',{name:'Chấp nhận giá',exact:true}).click();await refresh(p);assert.equal(room.terms.agreedPrice,75000);assert.deepEqual(termsCommands[0],termsCommands[1]);
 await sellerPage.getByRole('button',{name:'Đổi sách',exact:true}).click();await refresh(p);await p.getByRole('button',{name:'Chấp nhận hình thức',exact:true}).click();await refresh(sellerPage);await p.getByRole('heading',{name:'Sách bạn đem đổi',exact:true}).waitFor();
 assert.equal(await p.getByRole('group',{name:'Người bán chọn hình thức'}).count(),0,'buyer has no seller switch');
 await p.getByRole('checkbox').first().check();await p.getByRole('button',{name:'Gửi đề nghị đổi sách',exact:true}).click();await refresh(sellerPage);await sellerPage.getByRole('button',{name:'Chấp nhận đề nghị',exact:true}).waitFor();assert.equal(await sellerPage.getByRole('button',{name:'Thương lượng mua',exact:true}).isDisabled(),true);await sellerPage.getByRole('region',{name:'Lịch sử thỏa thuận',exact:true}).getByText('Bạn',{exact:true}).first().waitFor();
 await captures(sellerPage,'exchange-linked-sheet');
 await p.getByRole('button',{name:'Hủy đề nghị',exact:true}).first().click();await p.getByRole('alertdialog').getByRole('button',{name:'Hủy đề nghị',exact:true}).click();await refresh(sellerPage);await refresh(p);
 await sellerPage.getByRole('button',{name:'Thương lượng mua',exact:true}).click();await refresh(p);await p.getByRole('button',{name:'Chấp nhận hình thức',exact:true}).click();await refresh(sellerPage);
 await p.getByLabel('Đề nghị giá sách (₫)',{exact:true}).fill('75000');await p.getByRole('button',{name:'Gửi đề nghị',exact:true}).click();await refresh(sellerPage);await sellerPage.getByRole('button',{name:'Chấp nhận giá',exact:true}).click();await refresh(p);
 room.hasQuote=true;room.quotePreview=quote();room.version++;await refresh(p);await p.getByRole('heading',{name:'Đã gửi thông tin nhận sách',exact:true}).waitFor();await captures(p,'buyer-address-sent');
 await refresh(sellerPage);await sellerPage.getByRole('button',{name:'Kiểm tra và tạo đơn',exact:true}).waitFor();await captures(sellerPage,'seller-ready');
 await sellerPage.getByRole('button',{name:'Kiểm tra và tạo đơn',exact:true}).click();const dialog=sellerPage.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByLabel('Giá sách đã thỏa thuận (₫)').inputValue(),'75000');assert.equal(await dialog.getByLabel('Giá sách đã thỏa thuận (₫)').getAttribute('readonly')!==null,true);await dialog.getByRole('button',{name:'Tạo đơn cho người mua này',exact:true}).click();await dialog.getByText('Chưa xác nhận được đơn đã tạo. Thử lại để gửi cùng yêu cầu.',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('Giá sách đã thỏa thuận (₫)').isDisabled(),true);
 await dialog.getByRole('button',{name:'Đóng popup',exact:true}).click();
 room.quotePreview=null;room.version++;await refresh(sellerPage);
 await sellerPage.getByRole('button',{name:'Tiếp tục yêu cầu tạo đơn',exact:true}).click();
 assert.equal(await dialog.getByLabel('Giá sách đã thỏa thuận (₫)').inputValue(),'75000');
 await dialog.getByRole('button',{name:'Tạo đơn cho người mua này',exact:true}).click();await dialog.waitFor({state:'hidden'});await sellerPage.getByRole('link',{name:'Xem đơn hàng',exact:true}).waitFor();assert.deepEqual(commands[0],commands[1]);
 await refresh(p);await p.getByRole('heading',{name:'Đơn đang chờ bạn thanh toán',exact:true}).waitFor();assert.equal(await p.locator('#chat-message').count(),1,'same mounted room retains chat after order creation');await captures(p,'buyer-order-created');
 await p.getByRole('button',{name:'Xác nhận và thanh toán',exact:true}).click();await p.getByText('Chưa xác nhận được thanh toán. Thử lại để gửi cùng yêu cầu.',{exact:true}).waitFor();await p.getByRole('button',{name:'Xác nhận và thanh toán',exact:true}).click();await p.getByRole('heading',{name:'Chờ người bán xác nhận',exact:true}).waitFor();assert.deepEqual(commands[2],commands[3]);assert.equal(await p.getByText('Trạng thái đơn: PendingSellerConfirmation').count(),0);
 await p.getByRole('link',{name:'Chat, hội thoại của bạn',exact:true}).click();await p.getByRole('heading',{name:'Hội thoại của bạn',exact:true}).waitFor();await p.getByRole('link',{name:'Mở cuộc trao đổi',exact:true}).click();await p.getByRole('heading',{name:'Phiếu thỏa thuận',exact:true}).waitFor();
 await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Hội thoại',exact:true}).click();await p.locator('#chat-message').fill('Bản nháp giữ khi chuyển phiếu');await p.getByRole('button',{name:'Phiếu thỏa thuận',exact:true}).click();assert.equal(await p.locator('#chat-message').isVisible(),false);await p.getByRole('button',{name:'Hội thoại',exact:true}).click();assert.equal(await p.locator('#chat-message').inputValue(),'Bản nháp giữ khi chuyển phiếu');await p.setViewportSize({width:1440,height:1100});
 await p.evaluate(async exId=>{const{router}=await import('/src/app/router.tsx');await router.navigate('/exchange/'+exId);},ex.id);
 const chat=p.getByRole('region',{name:'Tin nhắn Đổi sách với '+seller.displayName});await chat.waitFor();await chat.getByText('Chưa tải được tin nhắn. Lịch sử đã tải vẫn được giữ lại.',{exact:true}).waitFor();assert.equal(await chat.getByText('Trao đổi về những cuốn sách này',{exact:true}).count(),0,'history failure is not empty');exchangeError=false;await chat.getByRole('button',{name:'Tải lại tin nhắn',exact:true}).click();await chat.getByText(exchangeMessages[0].body,{exact:true}).waitFor();assert.equal(await chat.locator('[class*="systemMsg"]').count(),0,'user cannot become system via text');await captures(p,'exchange-context');
 await p.getByRole('link',{name:'Nhắn với đối tác',exact:true}).click();await chat.getByLabel('Nhắn cho '+seller.displayName).fill('Bản nháp trao đổi cần được giữ lại.');exchangeSendError=true;await chat.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();await chat.getByRole('alert').waitFor();assert.equal(await chat.locator('textarea').inputValue(),'Bản nháp trao đổi cần được giữ lại.');exchangeSendError=false;
 exchangeError=true;await p.evaluate(async()=>{const{queryClient}=await import('/src/lib/session.ts');await queryClient.invalidateQueries({queryKey:['exchangeMessages']});});await chat.getByText('Chưa tải được tin nhắn. Lịch sử đã tải vẫn được giữ lại.',{exact:true}).waitFor();await chat.getByText(exchangeMessages[0].body,{exact:true}).waitFor();exchangeError=false;
 assert.deepEqual(issues,[]);await writeFile(path.join(out,'result.json'),JSON.stringify({result:'PASS',source:'codex/unified-trade-chat',api:'all intercepted fixtures',socket:'isolated Socket.IO on 5195',cases:['buyer/seller next steps','quote sent','same-room OrderCreated retains chat','price acceptance and immutable order price','seller mode switch requires buyer acceptance','linked exchange stays in workspace','mobile panels preserve draft','card inbox navigation','message lost ACK dedupe','order/payment pinned key/body retry including missing quote recovery','exchange book context','history error/recovery preserves messages','user text not system','exchange draft retained','1440/390/320px130%']},null,2));
 console.log('PASS: chat context and role-specific next action; purchase message/order/payment retry unchanged; exchange history/draft/error; desktop/mobile/large text. No application DB or storage used.');console.log(out);
}finally{await browser?.close();await vite?.close();await io?.close();await new Promise(resolve=>http?.listening?http.close(resolve):resolve());}
