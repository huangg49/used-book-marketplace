// Isolated production component build. No auth, API, storage or AI provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const require = createRequire(path.join(app, 'package.json'));
const { chromium, expect } = createRequire(new URL('../../admin-web/package.json', import.meta.url))('playwright/test');
const { build, preview } = await import(pathToFileURL(require.resolve('vite')).href);
const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
const baseline = process.env.PRICE_EXPIRY_BASELINE === '1';
const out = path.join(root, '.tmp/member-web-price-assist-expiry');
const fixture = path.join(app, '.tmp/price-assist-expiry');
await mkdir(fixture, { recursive: true });
await mkdir(out, { recursive: true });
await writeFile(path.join(fixture, 'index.html'), '<html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./entry.tsx"></script></html>');
await writeFile(path.join(fixture, 'entry.tsx'), `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PriceAssistPanel} from '../../src/components/PriceAssistPanel';
import '../../src/styles/global.css';
import '../../../../packages/brand/v1.1/focus.css';
const id='00000000-0000-4000-8000-000000000010';
const value={id,listingId:id,status:'Suggested',range:{low:40000,high:60000},evidenceLevel:'Limited',
  rules:[],sources:[],factors:[],missing:[],generatedAt:new Date(Date.now()).toISOString(),
  expiresAt:new Date(Date.now()+60000).toISOString(),cached:false,model:'QA'};
function App(){const [price,setPrice]=useState(new URLSearchParams(location.search).has('confirm')?'50000':'');
 const [applied,setApplied]=useState(0);
 const pending=new URLSearchParams(location.search).has('catalog-pending');
 const answer=pending?{...value,status:'NeedsMoreData',range:null,evidenceLevel:'Insufficient',model:null,
  rules:['R-NEED-SOURCES','R-NEED-CATALOG-APPROVAL'],missing:['Có thể tra giá trực tuyến sau khi đầu sách được duyệt.']}:value;
 return <main style={{maxWidth:720,margin:'auto',padding:16}}>
 <label>Giá đang nhập<input value={price} onChange={e=>setPrice(e.target.value)}/></label>
 <output aria-label="Số lượt áp dụng">{applied}</output>
 <PriceAssistPanel state={{status:'ready',key:'current',suggestion:answer,appliedPrice:null}}
 reference={pending?{key:'current',value:answer}:null}
 currentKey="current" currentPrice={price} phase="model" disabled={false} hasPhoto needsCatalog={pending}
 onAsk={()=>{}} onApply={amount=>{setPrice(String(amount));setApplied(n=>n+1)}}/>
 </main>}
createRoot(document.getElementById('root')!).render(<App/>);
`);
const dist = process.env.PRICE_EXPIRY_BUILD ? path.resolve(root, process.env.PRICE_EXPIRY_BUILD)
  : path.join(out, baseline ? 'before-fixture' : 'after-fixture');
if (!process.env.PRICE_EXPIRY_BUILD) await build({ configFile: false, root: app, publicDir: false, plugins: [react()], logLevel: 'warn',
  build: { outDir: dist, emptyOutDir: false, rolldownOptions: { input: path.join(fixture, 'index.html') } } });
const origin = 'http://127.0.0.1:4232';
const server = await preview({ configFile: false, root: app, build: { outDir: dist },
  preview: { host: '127.0.0.1', port: 4232, strictPort: true } });
const epoch = Date.parse('2026-11-05T05:00:00Z'), checks=[];
let browser;
try {
  browser=await chromium.launch();
  for(const width of [390,1440]) for(const mode of ['direct-expired','confirm-expired','timer-expired','direct-valid','confirm-valid',...baseline?[]:['catalog-pending']]){
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    await context.routeWebSocket('**/*', socket=>socket.close());
    const page=await context.newPage(),errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    await context.route('**/*', async route=>{
      const req=route.request(),url=new URL(req.url());
      assert.equal(req.method(),'GET');
      assert.equal(url.origin,origin,'No external requests in component fixture');
      assert.equal(url.pathname.startsWith('/api/'),false,'No API calls in component fixture');
      if (/^\/fonts\/[A-Za-z0-9_.-]+\.(woff2?|ttf|otf)$/.test(url.pathname))
        return route.fulfill({ body: await readFile(path.join(app, 'public', url.pathname)) });
      return route.continue();
    });
    if(mode==='timer-expired') await page.clock.install({time:epoch});
    else await page.clock.setFixedTime(epoch);
    await page.goto(origin+'/.tmp/price-assist-expiry/index.html'+(mode.startsWith('confirm')?'?confirm=1':mode==='catalog-pending'?'?catalog-pending=1':''));
    if(mode==='catalog-pending'){
      await expect(page.getByText('Đầu sách đang chờ duyệt',{exact:true})).toBeVisible();
      await expect(page.getByText('Có thể tra giá trực tuyến sau khi đầu sách được duyệt.',{exact:true})).toHaveCount(1);
      await expect(page.getByText('Khoảng tham chiếu theo quy tắc',{exact:true})).toHaveCount(0);
      await expect(page.getByRole('button',{name:'Kiểm tra lại nguồn giá',exact:true})).toBeEnabled();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);checks.push({width,mode});await context.close();continue;
    }
    const choose=page.getByRole('button',{name:/^Dùng 40/}),price=page.getByLabel('Giá đang nhập',{exact:true});
    const applied=page.getByLabel('Số lượt áp dụng',{exact:true});
    await expect(choose).toBeEnabled();
    if(mode.startsWith('confirm')){
      await choose.click();
      await expect(page.getByRole('dialog')).toBeVisible();
    }
    if(mode==='timer-expired'){
      await page.clock.runFor(60001);
      if(baseline) await expect(choose).toBeEnabled();
      else await expect(choose).toBeDisabled();
    }else{
      if(mode.endsWith('expired')) await page.clock.setFixedTime(epoch+60000);
      if(mode.startsWith('confirm')) await page.getByRole('button',{name:'Dùng giá gợi ý',exact:true}).click();
      else await choose.click();
    }
    const changed=mode!=='timer-expired'&&(baseline||mode.endsWith('valid'));
    await expect(applied).toHaveText(changed?'1':'0');
    await expect(price).toHaveValue(changed?'40000':mode.startsWith('confirm')?'50000':'');
    if(!baseline&&mode.endsWith('expired')) await expect(page.getByText(/Thông tin sách, ảnh, tình trạng hoặc hạn dùng gợi ý đã thay đổi/)).toBeVisible();
    if(mode==='timer-expired') await page.screenshot({path:path.join(out,(baseline?'before':'after')+'-expired-'+width+'.png')});
    if(!baseline&&mode==='direct-valid'){
      await price.fill('55000');
      await expect(price).toHaveValue('55000');
    }
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    checks.push({width,mode,applied:changed,expiredLocked:mode==='timer-expired'?!baseline:undefined});
    await context.close();
  }
  await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));
  console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
