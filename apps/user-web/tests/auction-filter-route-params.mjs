// Production public auction URL filter boundaries. All HTTP synthetic and read-only.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-auction-filter-route-params');await mkdir(out,{recursive:true});
const baseline=process.env.AUCTION_FILTER_BASELINE==='1',origin='http://127.0.0.1:4255';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.AUCTION_FILTER_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4255,strictPort:true}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const proto=['constructor','__proto__','toString'];
const cases=[...['sort','price','ends'].flatMap(field=>proto.map(value=>({field,value}))),
 {field:'unknown',value:'unknown'},...['endingSoon','newest','priceAsc','priceDesc'].map(value=>({field:'sort-valid',value})),
 ...['lt100','100-300','300-1m','gt1m'].map(value=>({field:'price-valid',value})),...['1h','6h','24h'].map(value=>({field:'ends-valid',value}))];
const orders={endingSoon:[1,0,2,3],newest:[1,3,2,0],priceAsc:[1,0,2,3],priceDesc:[3,2,0,1]};
const labels={endingSoon:'Sắp kết thúc',newest:'Mới mở',priceAsc:'Giá thấp đến cao',priceDesc:'Giá cao đến thấp'};
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const sample of cases){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const now=new Date().toISOString();const items=[200000,50000,600000,2000000].map((price,i)=>({id:id(100+i),listingId:id(200+i),title:'Phiên QA '+i,state:'Active',startPrice:price,step:10000,currentPrice:null,minimumBid:price,buyNowPrice:null,bidderCount:0,startAt:new Date(Date.now()-[4,1,3,2][i]*3600000).toISOString(),endAt:new Date(Date.now()+[2,0.5,8,30][i]*3600000).toISOString(),pointName:'Điểm QA',demoOnly:true,book:null}));
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;assert.equal(request.method(),'GET','Public shelf fixture forbids all commands');
   if(p==='/api/v1/auctions')return route.fulfill({json:{items:url.searchParams.get('phase')==='upcoming'?[]:items,serverTime:now}});
   if(p.startsWith('/api/v1/')||p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  const params=new URLSearchParams(sample.field==='unknown'?{sort:'unknown',price:'unknown',ends:'unknown'}:{[sample.field.replace('-valid','')]:sample.value});
  await page.goto(origin+'/auctions?'+params);
  const crash=baseline&&sample.field==='ends';
  await expect(page.getByRole('heading',{name:crash?'Chưa mở được trang':'Đấu giá sách cũ',exact:true})).toBeVisible();
  if(crash){for(const error of errors)assert.match(error,/toLowerCase/);}
  else{
   let order=orders.endingSoon;
   if(sample.field==='sort')order=baseline?[0,1,2,3]:orders.endingSoon;
   if(sample.field==='sort-valid')order=orders[sample.value];
   if(sample.field==='price-valid')order=[{'lt100':1,'100-300':0,'300-1m':2,'gt1m':3}[sample.value]];
   if(sample.field==='ends-valid')order=orders.endingSoon.slice(0,{'1h':1,'6h':2,'24h':3}[sample.value]);
   await expect(page.locator('article[data-auction-id]')).toHaveCount(order.length);
   assert.deepEqual(await page.locator('article[data-auction-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.auctionId)),order.map(i=>id(100+i)));
   const chips=page.getByRole('list',{name:'Bộ lọc đang dùng',exact:true});
   await expect(chips).toHaveCount(sample.field.endsWith('-valid')&&sample.field!=='sort-valid'||baseline&&sample.field==='price'?1:0);
   if(sample.field!=='sort'||!baseline){const expected=sample.field==='sort-valid'?sample.value:'endingSoon';await expect(page.getByRole('combobox',{name:'Sắp xếp',exact:true})).toHaveValue(width===390?expected:labels[expected]);}
   assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  if(sample.value==='constructor'&&['ends','sort'].includes(sample.field))await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${sample.field}-${width}.png`)});
  checks.push({width,...sample,routeUsable:!crash,enumBoundaryCorrect:!baseline||sample.field.endsWith('-valid')||sample.field==='unknown'});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,profiles:checks.length,routeCrashes:checks.filter(check=>!check.routeUsable).length,enumBoundariesCorrect:checks.every(check=>check.enumBoundaryCorrect),readOnly:true}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
