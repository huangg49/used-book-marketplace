// Actual Nest/Socket.IO/Mongo. Isolated QA data, fake images, local mail.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createTestApi,base,password} from '../apps/admin-web/tests/test-api.mjs';
const qa=new URL(process.env.MONGO_TEST_URL??'');
assert(qa.hostname==='127.0.0.1'&&qa.port==='57017'&&qa.pathname.endsWith('_test')&&qa.searchParams.get('replicaSet')==='rs-test');
const req=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {io}=req('socket.io-client');
const sockets=[];
let fixture;
process.env.AUTH_MAIL_PROVIDER='local';
const connect=token=>new Promise((resolve,reject)=>{
  const socket=io(new URL(base).origin+'/purchase-chat',{auth:{token},transports:['websocket'],reconnection:false,timeout:3000});
  sockets.push(socket);
  socket.once('connect',()=>resolve(socket)); socket.once('connect_error',reject);
});
const command=(socket,event,input)=>new Promise((resolve,reject)=>socket.timeout(3000).emit(event,input,(error,reply)=>error?reject(error):resolve(reply)));
const denied=(socket,event,input)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Expected rejection event did not arrive')),3000);
  socket.once('exception',()=>{clearTimeout(timer);resolve();});
  socket.emit(event,input);
});
try {
  fixture=await createTestApi({listingCount:1});
  const api=fixture.api,seller=fixture.member;
  const buyer=await api('/auth/login',null,{email:'admin@operations.test',password});
  const catalog=await api(`/operations/catalog-requests/${fixture.catalogId}`,buyer.accessToken);
  await api(`/operations/catalog-requests/${fixture.catalogId}/decision`,buyer.accessToken,{expectedVersion:catalog.version,revisionId:catalog.currentRevision.id,decision:'Confirm'});
  const listingId=fixture.listings[0], listing=await api(`/operations/listings/${listingId}`,buyer.accessToken);
  await api(`/operations/listings/${listingId}/decision`,buyer.accessToken,{expectedVersion:listing.version,revisionId:listing.currentRevision.id,decision:'Approve',checklist:{catalogMatches:true,photosClear:true,conditionDisclosed:true,readable:true,pricingValid:true,contentAppropriate:true}});
  const current=await api(`/listings/${listingId}`,buyer.accessToken);
  const room=await api(`/listings/${listingId}/purchase-conversations`,buyer.accessToken,{expectedVersion:current.version});
  const a=await connect(buyer.accessToken),b=await connect(seller.accessToken);
  assert.deepEqual(await command(a,'purchase:join',room.entityId),{ok:true});
  assert.deepEqual(await command(b,'purchase:join',room.entityId),{ok:true});
  const original={messageId:randomUUID(),conversationId:room.entityId,body:'Synthetic socket QA message'};
  const received=new Promise(resolve=>b.once('purchase:message',resolve));
  const ack=await command(a,'purchase:send',original);
  assert.equal(ack.id,original.messageId);
  assert.equal((await received).id,original.messageId);
  assert.deepEqual(await command(a,'purchase:send',original),ack);
  assert.equal(await fixture.db.collection('purchase_messages').countDocuments({_id:original.messageId}),1);
  const reply={messageId:randomUUID(),conversationId:room.entityId,body:'Synthetic reply'};
  assert.equal((await command(b,'purchase:send',reply)).id,reply.messageId);
  const template=await fixture.db.collection('users').findOne({_id:seller.user.id});
  await fixture.db.collection('users').insertOne({...template,_id:randomUUID(),emailNormalized:'outsider@socket-qa.test'});
  const outsider=await api('/auth/login',null,{email:'outsider@socket-qa.test',password});
  const c=await connect(outsider.accessToken);
  await denied(c,'purchase:join',room.entityId);
  const forbidden={...original,messageId:randomUUID()};
  await denied(c,'purchase:send',forbidden);
  assert.equal(await fixture.db.collection('purchase_messages').countDocuments({_id:forbidden.messageId}),0);
  await fixture.setUserStatus(buyer.user.id,'LOCKED');
  await denied(a,'purchase:send',{...original,messageId:randomUUID()});
  await fixture.setUserStatus(buyer.user.id,'ACTIVE');
  // Revoke after a successful connect: a cached handshake never grants a send.
  await fixture.db.collection('auth_sessions').updateMany({userId:seller.user.id},{$set:{revokedAt:new Date()}});
  const revoked={...reply,messageId:randomUUID()};
  await denied(b,'purchase:send',revoked);
  assert.equal(await fixture.db.collection('purchase_messages').countDocuments({_id:revoked.messageId}),0);
  await assert.rejects(connect(seller.accessToken),/Unauthorized/);
  assert.equal(await fixture.db.collection('purchase_messages').countDocuments({conversationId:room.entityId}),2);
  console.log('PASS real purchase socket: immediate join, two-way messages, same-ID replay once, outsider denial, locked negotiation denial, session revoked after connect and refused reconnect. No live provider/native/human acceptance.');
}finally{
  sockets.forEach(socket=>socket.disconnect());
  await fixture?.close();
}
