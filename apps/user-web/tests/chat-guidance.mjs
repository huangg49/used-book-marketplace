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
const out=path.join(root,process.env.CHAT_GUIDANCE_OUT||'.tmp/unified-chat-qa');await mkdir(out,{recursive:true});
const origin='http://127.0.0.1:5193',api='http://127.0.0.1:5195';
const waitForScroll=(locator,end=false)=>locator.evaluate(async(n,end)=>{
 const reached=()=>end?n.scrollTop>=n.scrollHeight-n.clientHeight-2:n.scrollTop>0;
 const deadline=Date.now()+4000;
 while(!reached()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 return reached();
},end);
// Match the actual scroll owner: two independent desktop panes, one narrow pane.
const scrollOwner=async content=>{
 const unified=content.locator('[data-transaction-scroll]');
 if(await unified.count() && await unified.evaluate(n=>getComputedStyle(n).overflowY==='auto'))return unified;
 const stage=content.locator('[data-transaction-panel="stage"]');
 return await stage.count()?stage:content;
};
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const future=()=>new Date(Date.now()+3600_000).toISOString();
const buyer={id:id(1),displayName:'Lan Anh'},seller={id:id(2),displayName:'Minh — Người giữ những cuốn sách cũ'};
const room={id:id(3),listingId:id(4),buyer,seller,version:1,status:'Active',expiresAt:null,hasQuote:false,quotePreview:null,orderId:null,createdAt:new Date().toISOString(),closedAt:null};
room.terms={mode:'Negotiation',pendingProposal:null,agreedPrice:null,agreedListingRevisionId:null,activeExchangeId:null,exchangeIds:[],locked:false};
const workspaceOnly=process.argv.includes('--workspace-only');
const historyOnly=process.argv.includes('--message-history-only');
const agreementEvents=[],termsCommands=[];let termsFailure=true,proposalSequence=200,linkedExchange;
const listing=(number,owner,title)=>({id:id(number),revisionId:id(number+100),version:1,book:{id:id(number+200),title,authors:['Tác giả minh họa'],publisher:null,publicationYear:null,language:'vi',edition:null,category:'Văn học',isbn:null},mode:'Both',condition:'Good',pages:'Đủ trang',coverNote:'Bìa có nếp gấp nhỏ',notes:'Không',accessories:'Không',readable:true,hasMissingPages:false,missingEssentialContent:false,description:'Dữ liệu minh họa kiểm tra chat',salePrice:80000,exchangeValue:80000,seller:owner,photos:[],publishedAt:new Date().toISOString(),fulfillment:{serviceAreaCode:'HCM-DEMO-v1',name:'TP.HCM',demoOnly:true,method:'DirectDelivery'},purchaseAvailability:{status:'Available',expiresAt:null}});
const books=new Map([[id(4),listing(4,seller,'Doraemon — Cuốn sách qua những người đọc')],[id(5),listing(5,buyer,'Những ngày thơ ấu')]]);
// Explicit QA-only cover fixture: a bundled illustration, never a real listing photo.
if(process.env.CHAT_QA_COVER==='1'){
 books.get(id(4)).book.title='[QA] Alice’s Adventures in Wonderland';books.get(id(4)).book.authors=['Lewis Carroll'];
 books.get(id(4)).photos=[{id:id(510),width:256,height:400}];
}
const quote=()=>({destination:{recipientName:'Lan Anh',phone:'0900000000',serviceAreaCode:'HCM-DEMO-v1',localityCode:'DEMO-A',detail:'Địa chỉ minh họa QA'},shippingFee:20000,expiresAt:future()});
const ex={id:id(6),initiatorId:buyer.id,recipientId:seller.id,initiatorListingId:id(5),recipientListingId:id(4),status:'Proposed',revision:1,initiatorDeposit:80000,recipientDeposit:80000,diffAmount:0,diffPayerId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastProposedById:buyer.id};
let historyError=false,exchangeError=true,exchangeSendError=false,dropMessage=true,createFailure=true,payFailure=true,orderState='AwaitingPayment';
let reviewReadFailure=false,reviewPermission=true;
const messages=[],exchangeMessages=[{id:id(8),exchangeId:ex.id,senderId:seller.id,body:'[Hệ thống] Tin này do thành viên gõ, không phải thông báo thanh toán.',sentAt:new Date().toISOString()}],sent=[],commands=[],issues=[];
const historyReads=[];
let olderFailure=false;
if (historyOnly) {
 const epoch=Date.now()-100_000;
 for(let number=1;number<=85;number++) messages.push({id:id(1000+number),conversationId:room.id,senderId:seller.id,body:`Tin QA ${number}`,sentAt:new Date(epoch+number*1000).toISOString()});
}
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
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(12000);page.on('pageerror',e=>issues.push(e.message));
  await page.route('**/api/v1/**',async route=>{
   const request=route.request(),s=new URL(request.url()).pathname.replace('/api/v1',''),method=request.method();
   if(workspaceOnly && s!=='/auth/login')assert.equal(method,'GET','workspace matrix must not send commands');
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

   if(s===`/me/purchase-conversations/${room.id}/messages/history`){
    const before=new URL(request.url()).searchParams.get('before');historyReads.push(before);
    if(historyError || (before && olderFailure))return send({code:'Unavailable',message:'Fixture outage'},503);
    const end=before?messages.findIndex(message=>message.id===before):messages.length;
    const start=Math.max(0,end-40),items=messages.slice(start,end);
    return send({items,olderCursor:start>0?items[0].id:null});
   }
   if(s==='/service-areas')return send({code:'HCM-DEMO-v1',localities:[{code:'DEMO-A',label:'TP.HCM'}]});
   if(s===`/listings/${room.listingId}/media/${id(510)}/read`)return send({id:id(510),url:origin+'/illustrations/alice.jpg',expiresAt:future(),width:256,height:400});
   if(s.startsWith('/listings/')&&books.has(s.split('/')[2]))return send(books.get(s.split('/')[2]));
   if(s===`/me/orders/${id(7)}`)return send({id:id(7),conversationId:room.id,purchaseMode:'Negotiated',role:role==='buyer'?'Buyer':'Seller',version:1,state:orderState,paymentDeadline:future(),paymentEnabled:role==='buyer'&&orderState==='AwaitingPayment',amounts:{bookPrice:75000,shippingFee:20000,buyerTotal:95000},serverTime:new Date().toISOString(),createdAt:room.createdAt,paidAt:orderState==='AwaitingPayment'?null:new Date().toISOString(),moneyHeld:orderState==='AwaitingPayment'?0:95000,canCancel:role==='buyer'&&orderState==='AwaitingPayment',sellerAcceptanceEnabled:role==='seller'&&orderState==='PendingSellerConfirmation',canReject:role==='seller'&&orderState==='PendingSellerConfirmation',sellerConfirmationDeadline:orderState==='PendingSellerConfirmation'?future():null,shipmentRegistrationEnabled:false,deliveredAt:null,inspectionDeadline:null,carrierReview:null,deliveryReview:null,preparation:null,ownAddress:{recipientName:'QA',phone:'0900000000',localityCode:'DEMO-A',detail:'Địa chỉ mô phỏng QA'},shippingAddress:null,item:{listingId:room.listingId,metadata:{title:books.get(room.listingId).book.title},condition:'Good',description:'Bản sách mô phỏng QA',coverNote:'Bìa có nếp gấp',pages:'Đủ trang'}});
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
   if(s===`/transactions/Exchange/${ex.id}/reviews`){
    assert.equal(method,'GET','review entry checks must not submit a review');
    if(reviewReadFailure)return send({code:'UNAVAILABLE',message:'QA review read unavailable'},503);
    return send({partnerId:role==='buyer'?seller.id:buyer.id,canReview:reviewPermission,
     canEdit:false,canDelete:false,canReply:false,bookRatingRequired:true,deadline:null,
     awaitingCompletion:true,serverTime:new Date().toISOString(),myReview:null,partnerReview:null});
   }
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
  for(const [width,scale]of[[1440,100],[1100,100],[900,100],[390,100],[320,130]]){
   await page.setViewportSize({width,height:900});await page.evaluate(v=>document.documentElement.style.fontSize=v+'%',scale);await page.evaluate(()=>scrollTo(0,0));
   await page.evaluate(()=>document.fonts.ready);const sheetPanel=page.getByRole('region',{name:'Nội dung phiếu thỏa thuận',exact:true});if(await sheetPanel.count())await sheetPanel.evaluate(node=>node.scrollTop=0);
   const historyPanel=page.getByLabel('Tin nhắn trong hội thoại',{exact:true});if(await historyPanel.count())await historyPanel.evaluate(node=>node.scrollTop=node.scrollHeight);
   await page.waitForFunction(()=>document.getAnimations().filter(a=>a.animationName==='details-sweep').every(a=>a.playState==='finished'));
   await page.screenshot({path:path.join(out,`${label}-${width}-${scale}.png`),fullPage:true});
   if(width<=960){const tab=page.getByRole('button',{name:'Hội thoại',exact:true});if(await tab.count()){await tab.click();await page.screenshot({path:path.join(out,`${label}-chat-${width}-${scale}.png`),fullPage:true});const sheetTab=page.getByRole('navigation',{name:'Nội dung cuộc trao đổi'}).getByRole('button').first();await sheetTab.click();}}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+label+' '+width);
   const agreement=page.getByRole('complementary',{name:'Phiếu thỏa thuận',exact:true});
   if(width>960&&await agreement.count()){
    const left=await agreement.boundingBox(),right=await page.getByRole('region',{name:'Hội thoại',exact:true}).boundingBox();
    assert.ok(Math.abs(left.y-right.y)<2&&Math.abs(left.height-right.height)<2,'aligned agreement/chat '+label+' '+width);
    assert.ok(await (await scrollOwner(sheetPanel)).evaluate(el=>getComputedStyle(el).overflowY==='auto'),'transaction scroll owner scrolls independently');
    const composer=await page.locator('#chat-message').boundingBox();
    assert.ok(composer.y+composer.height<right.y+right.height,'composer remains inside chat');
    const action=page.getByRole('complementary',{name:'Bước tiếp theo',exact:true}).filter({has:page.locator('button,a')});
    if(await action.count()&&await action.getAttribute('data-primary')==='true'){
      const box=await action.boundingBox();assert.ok(box.y>=left.y&&box.y+box.height<=left.y+left.height+1,'primary action visible without scrolling '+label);
    }
    if(label==='seller-ready'){
      const value=page.getByRole('definition').filter({hasText:'75.000'}).first(),box=await value.boundingBox(),body=await sheetPanel.boundingBox();
      assert.ok(box.y>=body.y&&box.y+box.height<=body.y+body.height,'accepted price remains readable above action footer');
    }
   }
  }
  await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>document.documentElement.style.fontSize='100%');
 };
 if(workspaceOnly||process.argv.includes('--review-entry-only')){
  room.terms.mode='Exchange';room.terms.activeExchangeId=ex.id;room.terms.exchangeIds=[ex.id];
  ex.status='InTransit';ex.initiatorShippedAt=new Date().toISOString();ex.recipientShippedAt=ex.initiatorShippedAt;
  ex.initiatorReceivedAt=null;ex.recipientReceivedAt=null;
 }
 const p=await makePage('buyer');
 if(historyOnly){
  for(const width of [1440,390]) {
   const page=width===1440?p:await makePage('seller');
   await page.setViewportSize({width,height:860});
   if(width<=960) await page.getByRole('button',{name:'Hội thoại',exact:true}).click();
   const list=page.getByLabel('Tin nhắn trong hội thoại',{exact:true});
   await list.getByText('Tin QA 85',{exact:true}).waitFor();
   assert.ok(await waitForScroll(list,true),'first read opens at the newest message');
   assert.equal(await list.locator('[data-chat-message]').count(),40);
   assert.equal(await list.getByText('Tin QA 45',{exact:true}).count(),0);
   const older=list.getByRole('button',{name:'Tải tin nhắn cũ hơn',exact:true});
   const anchor=list.getByText('Tin QA 46',{exact:true});
   await list.evaluate(node=>{node.scrollTop=0;});
   olderFailure=true;
   await older.click();
   await list.getByRole('alert').getByText('Chưa tải được tin cũ. Tin nhắn đang xem vẫn được giữ.').waitFor();
   assert.equal(await list.locator('[data-chat-message]').count(),40);
   olderFailure=false;
   const top=(await anchor.boundingBox()).y;
   await list.getByRole('button',{name:'Thử tải lại tin cũ',exact:true}).click();
   await list.getByText('Tin QA 6',{exact:true}).waitFor();
   assert.ok(Math.abs((await anchor.boundingBox()).y-top)<3,'prepending keeps the current message in place');
   assert.deepEqual(historyReads.filter(Boolean).slice(-2),[id(1046),id(1046)],'retry uses the same older cursor');
   const incoming={id:id(1200+width),conversationId:room.id,senderId:seller.id,body:'Tin đến qua socket',sentAt:new Date().toISOString()};
   const beforeIncoming=(await anchor.boundingBox()).y;
   io.of('/purchase-chat').to(room.id).emit('purchase:message',incoming);
   await list.getByText(incoming.body,{exact:true}).waitFor();
   assert.ok(Math.abs((await anchor.boundingBox()).y-beforeIncoming)<3,'incoming message does not pull a reader away from older history');
   await list.evaluate(node=>{node.scrollTop=0;});
   await page.screenshot({path:path.join(out,`history-${width}.png`)});
   await older.click();await list.getByText('Tin QA 1',{exact:true}).waitFor();
   assert.equal(await older.count(),0,'exhausted history has no load button');
   assert.equal(await list.locator('[data-chat-message]').count(),86);
   await page.close();
  }
  assert.deepEqual(issues,[]);
  console.log('PASS purchase chat history: newest first, older retry, stable scroll anchor, live messages and end of history at 1440/390. No application DB.');
 } else if(workspaceOnly){
  const evidence=[];
  const states=[['Proposed','Đề nghị'],['AcceptedAwaitingFunding','cọc'],['Preparing','gửi sách'],['InTransit','nhận sách'],['Delivered','Kiểm tra sách'],['ResolutionPending','sự cố'],['Completed','hoàn tất'],['Cancelled','hủy']];
  for(const role of ['buyer','seller']){
   const page=role==='buyer'?p:await makePage(role);
   for(const [state,title] of states){
    ex.status=state;ex.revision++;
    ex.initiatorFundedAt=ex.recipientFundedAt=['Preparing','InTransit','Delivered','Completed'].includes(state)?new Date().toISOString():null;
    ex.initiatorShippedAt=ex.recipientShippedAt=['InTransit','Delivered','Completed'].includes(state)?new Date().toISOString():null;
    ex.initiatorReceivedAt=ex.recipientReceivedAt=['Delivered','Completed'].includes(state)?new Date().toISOString():null;
    ex.inspectionDeadline=future();ex.completedAt=state==='Completed'?new Date().toISOString():null;
    await page.evaluate(async()=>{const{queryClient}=await import('/src/lib/session.ts');await queryClient.invalidateQueries({queryKey:['exchangeDetail']});});
    const detail=page.getByRole('region',{name:'Chi tiết trao đổi',exact:true});
    await detail.locator('[data-stage-heading] h3').filter({hasText:new RegExp(title,'i')}).waitFor();
    assert.equal(await page.locator('[data-transaction-workspace]').count(),1,'no nested full exchange workspace');
    for(const [width,height,scale] of [[1440,900,100],[1000,900,100],[390,844,100],[320,700,130]]){
     await page.setViewportSize({width,height});await page.evaluate(v=>document.documentElement.style.fontSize=v+'%',scale);
     const tab=page.getByRole('button',{name:'Phiếu thỏa thuận',exact:true});if(await tab.isVisible())await tab.click();
     const owner=await scrollOwner(detail);await owner.evaluate(n=>n.scrollTop=0);
     const box=await detail.locator('[data-stage-heading]').boundingBox();
     if(box.y<70||box.y>=320)await page.screenshot({path:path.join(out,'workspace-failure.png')});
     assert(box.y>=70 && box.y<320,`current phase ${role}/${state}/${width}: y=${box.y}; appears at the start of the sheet`);
     const sizes=await detail.locator('[data-transaction-panel]').evaluateAll(nodes=>nodes.map(n=>({width:n.clientWidth,content:n.scrollWidth})));
     assert(sizes.every(n=>n.content<=n.width+1),'no hidden horizontal overflow inside either pane');
     const range=await owner.evaluate(n=>n.scrollHeight-n.clientHeight);
     if(range>2){const b=await owner.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+Math.min(120,b.height/2));await page.mouse.wheel(0,500);assert(await waitForScroll(owner),'wheel reaches lower actions');await owner.focus();await page.keyboard.press('Control+End');assert(await waitForScroll(owner,true),'keyboard reaches lower details');}
     assert.equal(await page.evaluate(()=>window.scrollY),0,'header remains fixed');
     if(width<=960){await page.getByRole('button',{name:'Hội thoại',exact:true}).click();await page.locator('#chat-message').fill('Nháp trao đổi chưa gửi');await tab.click();await page.getByRole('button',{name:'Hội thoại',exact:true}).click();assert.equal(await page.locator('#chat-message').inputValue(),'Nháp trao đổi chưa gửi');await tab.click();}
     evidence.push({role,state,width,height,scale,wheel:range>2,keyboard:true,draft:true,overflow:false});
     if(role==='buyer'&&['Preparing','Delivered'].includes(state)&&[1440,390].includes(width)){
      await owner.evaluate(n=>n.scrollTop=0);await page.screenshot({path:path.join(out,`workspace-${state}-${width}.png`),fullPage:false});
     }
    }
   }
  }
  assert.deepEqual(issues,[]);await writeFile(path.join(out,'workspace-result.json'),JSON.stringify({status:'PASS',api:'HTTP/Socket.IO fixtures only; no DB or transaction commands',cases:evidence},null,2));
  console.log('PASS: 64 exchange workspace role/state/viewport cases; one workspace, current phase first, internal overflow, wheel/keyboard, draft tabs. No transaction commands.');
 } else if(process.argv.includes('--review-entry-only')){
  const evidence=[];
  const refreshReviews=page=>page.evaluate(async()=>{const {queryClient}=await import('/src/lib/session.ts');await Promise.all(['exchangeDetail','reviewEntry','purchase-conversation'].map(key=>queryClient.invalidateQueries({queryKey:[key]})));});
  for(const role of ['buyer','seller']){
   ex.status='InTransit';ex.initiatorReceivedAt=null;ex.recipientReceivedAt=null;ex.revision++;
   const page=role==='buyer'?p:await makePage(role);
   await refreshReviews(page);await page.getByRole('region',{name:'Chi tiết trao đổi',exact:true}).waitFor();
   assert.equal(await page.getByRole('link',{name:'Viết đánh giá',exact:true}).count(),0,'no receipt → no entry');
   ex.initiatorReceivedAt=new Date().toISOString();ex.revision++;await refreshReviews(page);
   if(role==='buyer')await page.getByRole('link',{name:'Viết đánh giá',exact:true}).waitFor();
   else assert.equal(await page.getByRole('link',{name:'Viết đánh giá',exact:true}).count(),0,'peer receipt does not open own review');
   ex.status='Delivered';ex.recipientReceivedAt=new Date().toISOString();ex.inspectionDeadline=future();
   ex.initiatorCompletedAt=new Date().toISOString();ex.recipientCompletedAt=ex.initiatorCompletedAt;ex.revision++;
   await refreshReviews(page);const link=page.getByRole('link',{name:'Viết đánh giá',exact:true});await link.waitFor();
   assert.equal(await link.count(),1,'received but not Completed renders one entry');
   reviewReadFailure=true;await refreshReviews(page);
   const failure=page.getByRole('alert').filter({hasText:'Chưa tải được quyền đánh giá.'});await failure.waitFor();
   reviewReadFailure=false;await failure.getByRole('button',{name:'Thử lại',exact:true}).click();await link.waitFor();
   reviewPermission=false;await refreshReviews(page);assert.equal(await link.count(),0,'server refusal hides review action');
   reviewPermission=true;await refreshReviews(page);await link.waitFor();
   for(const width of [1440,950,390]){
    await page.setViewportSize({width,height:940});await link.scrollIntoViewIfNeeded();
    const b=await link.boundingBox();assert(b.y>=72&&b.y+b.height<=940,'review entry reachable in room scroll region');
    assert.equal(await link.getAttribute('href'),`/reviews?tab=pending&type=Exchange&transaction=${ex.id}`);
    await page.screenshot({path:path.join(out,`received-review-${role}-${width}.png`),fullPage:false});
   }
   await link.click();await page.waitForURL(url=>url.pathname==='/reviews'&&url.searchParams.get('transaction')===ex.id);
   await page.getByRole('button',{name:'Viết đánh giá',exact:true}).click();await page.getByRole('form',{name:'Soạn đánh giá',exact:true}).waitFor();
   await page.getByText(/Trong 72 giờ kiểm tra, tiền vẫn được giữ/).waitFor();
   evidence.push({role,notReceived:'hidden',ownReceipt:'required',delivered:'one entry',serverRefusal:'hidden',readError:'retry',viewport:[1440,950,390],target:ex.id,form:'opens without submission',publication:'private until completion'});
  }
  assert.deepEqual(issues,[]);await writeFile(path.join(out,'review-entry-result.json'),JSON.stringify({status:'PASS',api:'HTTP/Socket.IO fixtures; no database, review writes or time advancement',cases:evidence},null,2));
  console.log('PASS: Exchange received → review entry in actual Chat/ExchangeDetail parent, both roles, no Completed dependency, own receipt/server permission, read retry and exact deep link/form; 1440/950/390. No review submitted.');
 } else if (process.argv.includes('--scroll-only')) {
  const scrollEvidence=[];
  for (const role of ['buyer','seller']) {
   const page=role==='buyer'?p:await makePage(role);
   for (const [width,height,scale] of [[1440,900,100],[1000,900,100],[961,900,100],[960,940,100],[950,940,100],[760,700,100],[390,844,100],[320,700,130],[950,480,100]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(value=>document.documentElement.style.fontSize=value+'%',scale);
    const sheetTab=page.getByRole('button',{name:'Phiếu thỏa thuận',exact:true});
    if(await sheetTab.isVisible())await sheetTab.click();
    const content=page.getByRole('region',{name:'Nội dung phiếu thỏa thuận',exact:true});
    await content.waitFor();const scroller=await scrollOwner(content);await scroller.evaluate(node=>node.scrollTop=0);
    const bounds=await content.boundingBox();
    assert(bounds&&bounds.y>=70&&bounds.y+bounds.height<=height+1,`viewport-bounded agreement: ${role}/${width}/${height}`);
    const header=await page.locator('header').first().boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,Math.min(height-60,bounds.y+100));
    const before=await scroller.evaluate(node=>({top:node.scrollTop,range:node.scrollHeight-node.clientHeight}));
    await page.mouse.wheel(0,650);
    if(before.range>2)assert(await waitForScroll(scroller),'wheel moves the actual scroll owner');
    assert.equal(await page.evaluate(()=>window.scrollY),0,'document must not move behind the fixed header');
    await scroller.focus();await page.keyboard.press('Control+End');
    if(before.range>2)assert(await waitForScroll(scroller,true),'keyboard reaches end of the actual scroll owner');
    const last=scroller.locator('button:visible,a:visible').last();
    if(await last.count()){await last.focus();const b=await last.boundingBox();assert(b.y+b.height<=height+1,'last action can be reached by keyboard');}
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'no horizontal overflow');
    const currentHeader=await page.locator('header').first().boundingBox();assert.equal(Math.round(currentHeader.y),Math.round(header.y),'header stays put');
    if(await sheetTab.isVisible())await page.getByRole('button',{name:'Hội thoại',exact:true}).click();
    const composer=page.locator('#chat-message');await composer.waitFor();const cb=await composer.boundingBox();assert(cb.y+cb.height<=height+1,'composer is inside viewport');
    await composer.fill('Bản nháp kiểm tra cuộn — chưa gửi');
    if(await sheetTab.isVisible()){await sheetTab.click();await page.getByRole('button',{name:'Hội thoại',exact:true}).click();assert.equal(await composer.inputValue(),'Bản nháp kiểm tra cuộn — chưa gửi');}
    await composer.fill('');if(await sheetTab.isVisible())await sheetTab.click();
    await scroller.evaluate(node=>node.scrollTop=0);
    if([1440,950,390].includes(width)&&height>480)await page.screenshot({path:path.join(out,`scroll-${role}-${width}.png`),fullPage:false});
    scrollEvidence.push({role,width,height,scale,overflow:before.range>2,wheel:true,keyboardEnd:true,composer:true,draftRetained:true});
   }
   await page.evaluate(value=>document.documentElement.style.fontSize=value,'100%');
   await page.getByRole('link',{name:'Về danh sách hội thoại',exact:true}).click();
   await page.getByRole('heading',{name:'Hội thoại của bạn',exact:true}).waitFor();
   assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflowY),'hidden','leave room restores document scrolling');
  }
  // The same frame also hosts private Orders; their longer embedded detail must
  // retain one reachable scroll region after switching the narrow-screen tabs.
  room.orderId=id(7);room.status='OrderCreated';room.terms.locked=true;
  const orderPage=await makePage('buyer');
  for(const width of [950,390]){
   await orderPage.setViewportSize({width,height:844});
   await orderPage.getByRole('button',{name:'Đơn hàng',exact:true}).click();
   const content=orderPage.getByRole('region',{name:'Nội dung đơn hàng',exact:true});await content.waitFor();
   const bounds=await content.boundingBox();assert(bounds.y+bounds.height<=844,'embedded Order fits viewport');
   const scroller=await scrollOwner(content);const range=await scroller.evaluate(node=>node.scrollHeight-node.clientHeight);
   await orderPage.mouse.move(bounds.x+bounds.width/2,bounds.y+100);await orderPage.mouse.wheel(0,500);
   if(range>2)assert(await waitForScroll(scroller),'wheel moves the actual scroll owner');
   await orderPage.getByRole('button',{name:'Hội thoại',exact:true}).click();
   const composer=await orderPage.locator('#chat-message').boundingBox();assert(composer.y+composer.height<=844,'Order chat composer fits viewport');
   scrollEvidence.push({mode:'OrderCreated',width,height:844,wheel:true,composer:true});
  }
  assert.deepEqual(issues,[]);await writeFile(path.join(out,'scroll-result.json'),JSON.stringify({status:'PASS',api:'HTTP and Socket.IO fixtures, no DB/storage',cases:scrollEvidence},null,2));
  console.log('PASS: buyer/seller wheel and keyboard agreement scrolling; 1440/1000/961/960/950/760/390/320px, short viewport and 130% text, visible composer and retained draft, Back restores page. No DB or real messages.');
 } else {
 await p.evaluate(async listingId=>{const{router}=await import('/src/app/router.tsx');await router.navigate(`/chat/start/${listingId}?intent=Negotiation`);},room.listingId);await p.waitForURL('**/chat/'+room.id);

 await p.getByRole('heading',{name:'Trao đổi trước khi chốt mua',exact:true}).waitFor();
 await p.getByRole('heading',{name:books.get(room.listingId).book.title,exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:seller.displayName,level:1,exact:true}).count(),0,'book leads page, partner belongs to chat');
 await p.getByRole('link',{name:'Gửi thông tin nhận sách',exact:true}).waitFor();await captures(p,'buyer-start');
 await p.getByRole('button',{name:'Soạn lời chào',exact:true}).click();assert.ok((await p.locator('#chat-message').inputValue()).includes('Chào bạn'));assert.equal(sent.length,0,'suggestion never sends');
 await p.locator('#chat-message').fill('Nội dung giữ nguyên khi mất xác nhận.');await p.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();await p.getByText('Chưa xác nhận được tin nhắn đã gửi. Thử lại sẽ gửi cùng tin này.',{exact:true}).waitFor({timeout:20000});
 assert.equal(await p.locator('#chat-message').inputValue(),'Nội dung giữ nguyên khi mất xác nhận.');await p.getByRole('button',{name:'Thử gửi lại tin nhắn',exact:true}).click();await p.waitForFunction(()=>document.getElementById('chat-message').value==='');assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(messages.length,1);
 const sellerPage=await makePage('seller');
 await p.getByLabel('Đề nghị giá sách mong muốn (₫):',{exact:true}).fill('75000');await p.getByRole('button',{name:'Gửi đề nghị',exact:true}).click();await p.getByRole('button',{name:'Thử lại thao tác trước',exact:true}).waitFor();
 assert.equal(await p.getByLabel('Đề nghị giá sách mong muốn (₫):',{exact:true}).inputValue(),'75000');await p.getByRole('button',{name:'Thử lại thao tác trước',exact:true}).click();await refresh(sellerPage);await sellerPage.getByRole('button',{name:'Chấp nhận giá này',exact:true}).click();await refresh(p);assert.equal(room.terms.agreedPrice,75000);assert.deepEqual(termsCommands[0],termsCommands[1]);
 await sellerPage.getByRole('button',{name:'Đề nghị giá khác',exact:true}).click();await sellerPage.getByLabel('Đề nghị mức giá mới (₫):',{exact:true}).fill('76000');await sellerPage.getByRole('button',{name:'Giữ nguyên giá đã thống nhất',exact:true}).click();assert.equal(await sellerPage.getByLabel('Đề nghị mức giá mới (₫):',{exact:true}).count(),0);assert.equal(room.terms.agreedPrice,75000,'closing edit does not alter agreed price');
 await sellerPage.getByRole('button',{name:'Đổi sách',exact:true}).click();await refresh(p);await p.getByRole('button',{name:'Chấp nhận hình thức',exact:true}).click();await refresh(sellerPage);await p.getByRole('heading',{name:'Sách bạn đem đổi',exact:true}).waitFor();
 assert.equal(await p.getByRole('group',{name:'Người bán chọn hình thức'}).count(),0,'buyer has no seller switch');
 await p.getByRole('checkbox').first().locator('..').click();assert.equal(await p.getByRole('checkbox').first().isChecked(),true,'clicking the visible book card selects its checkbox');await p.getByRole('button',{name:'Gửi đề nghị đổi sách (1 cuốn)',exact:true}).click();await refresh(sellerPage);await sellerPage.getByRole('button',{name:'Chấp nhận đề nghị',exact:true}).waitFor();assert.equal(await sellerPage.getByRole('group',{name:'Người bán chọn hình thức'}).count(),0,'an active exchange must not expose controls to switch the agreement mode');await sellerPage.getByRole('button',{name:'Xem tất cả thay đổi',exact:true}).click();await sellerPage.getByRole('region',{name:'Lịch sử thỏa thuận',exact:true}).getByText('Bạn',{exact:true}).first().waitFor();await sellerPage.getByRole('button',{name:'Thu gọn lịch sử',exact:true}).click();
 await captures(sellerPage,'exchange-linked-sheet');
 await p.getByRole('button',{name:'Hủy đề nghị',exact:true}).first().click();await p.getByRole('alertdialog').getByRole('button',{name:'Hủy đề nghị',exact:true}).click();await refresh(sellerPage);await refresh(p);
 await sellerPage.getByRole('button',{name:'Thương lượng mua',exact:true}).click();await refresh(p);await p.getByRole('button',{name:'Chấp nhận hình thức',exact:true}).click();await refresh(sellerPage);
 await p.getByLabel('Đề nghị giá sách mong muốn (₫):',{exact:true}).fill('75000');await p.getByRole('button',{name:'Gửi đề nghị',exact:true}).click();await refresh(sellerPage);await sellerPage.getByRole('button',{name:'Chấp nhận giá này',exact:true}).click();await refresh(p);
 room.hasQuote=true;room.quotePreview=quote();room.version++;await refresh(p);await p.getByRole('heading',{name:'Đã gửi thông tin nhận sách',exact:true}).waitFor();await captures(p,'buyer-address-sent');
 await refresh(sellerPage);await sellerPage.getByRole('button',{name:'Tạo đơn cho người mua này',exact:true}).waitFor();await captures(sellerPage,'seller-ready');
 await sellerPage.getByRole('button',{name:'Tạo đơn cho người mua này',exact:true}).click();const dialog=sellerPage.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByLabel('Giá sách đã thỏa thuận (₫)').inputValue(),'75000');assert.equal(await dialog.getByLabel('Giá sách đã thỏa thuận (₫)').getAttribute('readonly')!==null,true);await dialog.getByRole('button',{name:'Tạo đơn cho người mua này',exact:true}).click();await dialog.getByText('Chưa xác nhận được đơn đã tạo. Thử lại để gửi cùng yêu cầu.',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('Giá sách đã thỏa thuận (₫)').isDisabled(),true);
 await dialog.getByRole('button',{name:'Đóng popup',exact:true}).click();
 room.quotePreview=null;room.version++;await refresh(sellerPage);
 await sellerPage.getByRole('button',{name:'Tiếp tục yêu cầu tạo đơn',exact:true}).click();
 assert.equal(await dialog.getByLabel('Giá sách đã thỏa thuận (₫)').inputValue(),'75000');
 await dialog.getByRole('button',{name:'Tạo đơn cho người mua này',exact:true}).click();await dialog.waitFor({state:'hidden'});await sellerPage.getByRole('region',{name:'Chi tiết đơn hàng',exact:true}).getByRole('heading',{name:'Chờ người mua thanh toán',exact:true}).waitFor();assert.deepEqual(commands[0],commands[1]);
 await refresh(p);await p.getByRole('region',{name:'Chi tiết đơn hàng',exact:true}).getByText('Chờ thanh toán',{exact:true}).waitFor();assert.equal(await p.locator('#chat-message').count(),1,'same mounted room retains chat after order creation');await captures(p,'buyer-order-created');
 await p.getByRole('button',{name:'Thanh toán ngay 95.000 ₫',exact:true}).click();await p.getByText('Chưa xác nhận được kết quả. Hãy thử lại cùng thao tác; thông tin đã nhập được giữ nguyên.',{exact:true}).waitFor();await p.getByRole('button',{name:'Thử lại thanh toán',exact:true}).click();await p.getByRole('region',{name:'Chi tiết đơn hàng',exact:true}).getByRole('heading',{name:'Chờ người bán xác nhận',exact:true}).waitFor();assert.deepEqual(commands[2],commands[3]);assert.equal(await p.getByText('Trạng thái đơn: PendingSellerConfirmation').count(),0);
 await p.getByRole('link',{name:'Chat, hội thoại của bạn',exact:true}).click();await p.getByRole('heading',{name:'Hội thoại của bạn',exact:true}).waitFor();await captures(p,'inbox');
 // Exercise actual browser snapshots, not a mocked transition API.
 await p.evaluate(()=>{
  window.__chatTransitions=[];const start=document.startViewTransition.bind(document);
  const names=()=>[...document.querySelectorAll('*')].filter(el=>el.getClientRects().length&&getComputedStyle(el).viewTransitionName!=='none').map(el=>getComputedStyle(el).viewTransitionName);
  document.startViewTransition=(...args)=>{
   const record={old:names()};window.__chatTransitions.push(record);const transition=start(...args);
   transition.ready.then(()=>{record.next=names();record.durations=document.getAnimations().filter(a=>String(a.animationName).includes('chat-panel')).map(a=>a.effect.getTiming().duration);}).catch(error=>record.error=String(error));
   transition.finished.then(()=>record.finished=true);return transition;
  };
 });
 await p.getByRole('button',{name:'Bạn hỏi mua / đổi',exact:true}).click();
 await p.getByRole('link',{name:'Mở cuộc trao đổi',exact:true}).click();
 await p.waitForFunction(()=>window.__chatTransitions[0]?.finished);
 let transitionEvidence=await p.evaluate(()=>window.__chatTransitions[0]);assert.equal(transitionEvidence.error,undefined);assert.ok(transitionEvidence.old.includes('chat-panel'));assert.ok(transitionEvidence.next.includes('chat-panel'));assert.ok(transitionEvidence.durations.includes(420));
 await p.getByRole('link',{name:'Về danh sách hội thoại',exact:true}).click();
 await p.waitForFunction(()=>window.__chatTransitions[1]?.finished);
 assert.equal(await p.getByRole('button',{name:'Bạn hỏi mua / đổi',exact:true}).getAttribute('aria-pressed'),'true');
 transitionEvidence=await p.evaluate(()=>window.__chatTransitions[1]);assert.equal(transitionEvidence.error,undefined);assert.ok(transitionEvidence.durations.includes(340));
 await p.emulateMedia({reducedMotion:'reduce'});await p.setViewportSize({width:320,height:844});await p.evaluate(()=>document.documentElement.style.fontSize='130%');
 await p.getByRole('link',{name:'Mở cuộc trao đổi',exact:true}).click();await p.waitForFunction(()=>window.__chatTransitions[2]?.finished);
 transitionEvidence=await p.evaluate(()=>window.__chatTransitions[2]);assert.equal(transitionEvidence.error,undefined);assert.ok(transitionEvidence.durations.includes(420));assert.equal(transitionEvidence.next.filter(name=>name==='chat-cover').length,1,'one visible book identity');
 await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>document.documentElement.style.fontSize='100%');await p.getByRole('button',{name:'Sách và thỏa thuận',exact:true}).click();await p.getByRole('heading',{name:'Thông tin sách',exact:true}).waitFor();
 await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Hội thoại',exact:true}).click();await p.locator('#chat-message').fill('Bản nháp giữ khi chuyển phiếu');await p.getByRole('button',{name:room.orderId?'Đơn hàng':'Phiếu thỏa thuận',exact:true}).click();await p.locator('#chat-message').waitFor({state:'hidden'});await p.getByRole('button',{name:'Hội thoại',exact:true}).click();assert.equal(await p.locator('#chat-message').inputValue(),'Bản nháp giữ khi chuyển phiếu');await p.setViewportSize({width:1440,height:1100});
 await p.evaluate(async exId=>{const{router}=await import('/src/app/router.tsx');await router.navigate('/exchange/'+exId);},ex.id);
 const chat=p.getByRole('region',{name:'Tin nhắn Đổi sách với Đối tác trao đổi'});await chat.waitFor();await chat.getByText('Chưa tải được tin nhắn. Lịch sử đã tải vẫn được giữ lại.',{exact:true}).waitFor();assert.equal(await chat.getByText('Trao đổi về những cuốn sách này',{exact:true}).count(),0,'history failure is not empty');exchangeError=false;await chat.getByRole('button',{name:'Tải lại tin nhắn',exact:true}).click();await chat.getByText(exchangeMessages[0].body,{exact:true}).waitFor();assert.equal(await chat.locator('[class*="systemMsg"]').count(),0,'user cannot become system via text');await captures(p,'exchange-context');
 await p.getByRole('link',{name:'Nhắn với đối tác',exact:true}).click();await chat.getByLabel('Nhắn cho Đối tác trao đổi').fill('Bản nháp trao đổi cần được giữ lại.');exchangeSendError=true;await chat.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();await chat.getByRole('alert').waitFor();assert.equal(await chat.locator('textarea').inputValue(),'Bản nháp trao đổi cần được giữ lại.');exchangeSendError=false;
 exchangeError=true;await p.evaluate(async()=>{const{queryClient}=await import('/src/lib/session.ts');await queryClient.invalidateQueries({queryKey:['exchangeMessages']});});await chat.getByText('Chưa tải được tin nhắn. Lịch sử đã tải vẫn được giữ lại.',{exact:true}).waitFor();await chat.getByText(exchangeMessages[0].body,{exact:true}).waitFor();exchangeError=false;
 assert.deepEqual(issues,[]);await writeFile(path.join(out,'result.json'),JSON.stringify({result:'PASS',source:'codex/journey-verification',api:'all intercepted fixtures',socket:'isolated Socket.IO on 5195',cases:['buyer/seller next steps','quote sent','same-room OrderCreated retains chat','price acceptance and immutable order price','seller mode switch requires buyer acceptance','linked exchange stays in workspace','mobile panels preserve draft','card inbox navigation','message lost ACK dedupe','order/payment pinned key/body retry including missing quote recovery','exchange book context','history error/recovery preserves messages','user text not system','exchange draft retained','1440/900/390/320px130%','aligned independently scrolling agreement and chat','primary actions visible','price edit disclosure and complete event history']},null,2));
 console.log('PASS: chat context and role-specific next action; purchase message/order/payment retry unchanged; exchange history/draft/error; desktop/mobile/large text. No application DB or storage used.');console.log(out);
 }
}catch(error){
 for(const [i,context] of (browser?.contexts()??[]).entries())for(const page of context.pages())await writeFile(path.join(out,`failure-context-${i}.txt`),JSON.stringify({url:page.url(),text:await page.locator('body').innerText(),issues},null,2)).catch(()=>{});
 throw error;
}finally{await browser?.close();await vite?.close();await io?.close();await new Promise(resolve=>http?.listening?http.close(resolve):resolve());}
