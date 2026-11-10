// Production component fixture: rule reference expiry and replacement while confirming.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)), app=path.join(root,'apps/user-web');
const require=createRequire(path.join(app,'package.json'));
const {chromium,expect}=createRequire(new URL('../../admin-web/package.json',import.meta.url))('playwright/test');
const {build,preview}=await import(pathToFileURL(require.resolve('vite')).href);
const {default:react}=await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
const baseline=process.env.PRICE_REFERENCE_BASELINE==='1';
const out=path.join(root,'.tmp/member-web-price-reference-expiry'), fixture=path.join(app,'.tmp/price-reference-expiry');
await mkdir(fixture,{recursive:true});await mkdir(out,{recursive:true});
await writeFile(path.join(fixture,'index.html'),'<html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./entry.tsx"></script></html>');
await writeFile(path.join(fixture,'entry.tsx'),`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {PriceAssistPanel} from '../../src/components/PriceAssistPanel';
import '../../src/styles/global.css';import '../../../../packages/brand/v1.1/focus.css';
const reference=(amount=40000)=>({key:'current',value:{listingId:'00000000-0000-4000-8000-000000000010',status:'Ready',
 range:{low:amount,high:amount+20000},evidenceLevel:'Limited',sources:[],missing:[],
 generatedAt:new Date(Date.now()).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()}});
function App(){const [price,setPrice]=useState('55000'),[applied,setApplied]=useState(0),[state,setState]=useState(reference);
 window.qaRefreshReference=()=>setState(reference(70000));
 return <main style={{maxWidth:720,margin:'auto',padding:16}}>
 <label>Giá đang nhập<input value={price} onChange={e=>setPrice(e.target.value)}/></label>
 <output aria-label="Số lượt áp dụng">{applied}</output>
 <PriceAssistPanel state={{status:'idle'}} reference={state} currentKey="current" currentPrice={price}
 phase="model" disabled={false} hasPhoto needsCatalog={false} onAsk={()=>{}} onEnterPrice={()=>{}} onApply={()=>{throw Error('AI apply forbidden')}}
 onApplyReference={amount=>{setPrice(String(amount));setApplied(n=>n+1)}}/>
 </main>}
createRoot(document.getElementById('root')!).render(<App/>);
`);
const dist=process.env.PRICE_REFERENCE_BUILD?path.resolve(root,process.env.PRICE_REFERENCE_BUILD):path.join(out,baseline?'before-fixture':'after-fixture');
if(!process.env.PRICE_REFERENCE_BUILD) await build({configFile:false,root:app,publicDir:false,plugins:[react()],logLevel:'warn',
 build:{outDir:dist,emptyOutDir:false,rolldownOptions:{input:path.join(fixture,'index.html')}}});
const origin='http://127.0.0.1:4233';
const server=await preview({configFile:false,root:app,build:{outDir:dist},preview:{host:'127.0.0.1',port:4233,strictPort:true}});
const epoch=Date.parse('2026-11-05T06:00:00Z'),checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440]) for(const mode of ['direct-expired','confirm-expired','timer-expired','replace-confirmation','refresh-expired','valid']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(req.method(),'GET');assert.equal(url.origin,origin);
   assert.equal(url.pathname.startsWith('/api/'),false,'No API in component fixture');
   if(/^\/fonts\/[A-Za-z0-9_.-]+\.(woff2?|ttf|otf)$/.test(url.pathname))return route.fulfill({body:await readFile(path.join(app,'public',url.pathname))});
   return route.continue();
  });
  if(['timer-expired','refresh-expired'].includes(mode))await page.clock.install({time:epoch});else await page.clock.setFixedTime(epoch);
  await page.goto(origin+'/.tmp/price-reference-expiry/index.html');
  const choose=page.getByRole('button',{name:/^Chọn mức tham chiếu 40/}),dialog=page.getByRole('dialog');
  const price=page.getByLabel('Giá đang nhập',{exact:true}),applied=page.getByLabel('Số lượt áp dụng',{exact:true});
  await expect(choose).toBeEnabled();
  if(['confirm-expired','replace-confirmation','refresh-expired','valid'].includes(mode)){
   await choose.click();await expect(dialog).toBeVisible();
  }
  if(['timer-expired','refresh-expired'].includes(mode)){
   await page.clock.runFor(60001);
   if(!baseline){await expect(choose).toHaveCount(0);await expect(dialog).toHaveCount(0);}
   else await expect(choose).toBeEnabled();
  }else if(mode.endsWith('expired')){
   await page.clock.setFixedTime(epoch+60000);
   if(mode==='direct-expired')await choose.click();
   else await page.getByRole('button',{name:'Dùng giá tham chiếu',exact:true}).click();
  }
  if(['replace-confirmation','refresh-expired'].includes(mode)){
   await page.evaluate(()=>window.qaRefreshReference());
   if(baseline){
    await expect(dialog).toBeVisible();
    await page.getByRole('button',{name:'Dùng giá tham chiếu',exact:true}).click();
    await expect(price).toHaveValue('40000');
   }else{
    await expect(dialog).toHaveCount(0);
    await expect(price).toHaveValue('55000');
    await page.getByRole('button',{name:/^Chọn mức tham chiếu 70/}).click();
    await page.getByRole('button',{name:'Dùng giá tham chiếu',exact:true}).click();
    await expect(price).toHaveValue('70000');
   }
   await expect(applied).toHaveText('1');
  }else if(mode==='valid'){
   await page.getByRole('button',{name:'Dùng giá tham chiếu',exact:true}).click();
   await expect(price).toHaveValue('40000');await expect(applied).toHaveText('1');
  }else{
   await expect(price).toHaveValue('55000');await expect(applied).toHaveText('0');
   if(!baseline)await expect(page.getByText('Khoảng tham chiếu không còn hiệu lực. Bạn có thể yêu cầu gợi ý lại hoặc tự nhập giá.',{exact:true})).toBeVisible();
  }
  if(mode==='timer-expired')await page.screenshot({path:path.join(out,(baseline?'before':'after')+'-expired-'+width+'.png')});
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks.push({width,mode,oldConfirmationApplied:['replace-confirmation','refresh-expired'].includes(mode)?baseline:undefined,expiredRecoveryVisible:mode.endsWith('expired')?!baseline:undefined});
  await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
