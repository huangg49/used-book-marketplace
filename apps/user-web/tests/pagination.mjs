// Actual Pagination + WalletHistory, isolated data/transport. No DB or payment calls.
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
const out = path.join(root, '.tmp/pagination-browser');
await fs.mkdir(out, { recursive: true });
const source = root.replaceAll('\\', '/').replace(/\/$/, '');
await fs.writeFile(path.join(out, 'index.html'), '<html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
await fs.writeFile(path.join(out, 'fixture.tsx'), `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import{Pagination}from'/@fs/${source}/apps/user-web/src/components/Pagination/Pagination.tsx';
import{WalletHistory}from'/@fs/${source}/apps/user-web/src/pages/WalletHistory.tsx';
import{session}from'/@fs/${source}/apps/user-web/src/lib/session.ts';
import'/@fs/${source}/apps/user-web/src/styles/global.css';
import'/@fs/${source}/packages/brand/v1.1/focus.css';
const params=new URLSearchParams(location.search);
window.qa={calls:[],failNext:true,failInitial:true,hold:false,release:null,changes:[]};
session.request=async(url)=>{
 const q=window.qa;q.calls.push(url);const p=new URL(url,location.origin).searchParams;
 const cursor=p.get('cursor'),type=p.get('type');
 if(cursor&&q.hold)await new Promise(resolve=>q.release=resolve);
 if(cursor&&q.failNext){q.failNext=false;throw Error('QA next page failure');}
 if(type==='OrderPayment'&&q.failInitial){q.failInitial=false;throw Error('QA initial failure');}
 const length=type==='Topup'?3:type==='OrderRefund'?0:cursor?5:20;
 return{items:Array.from({length},(_,i)=>({journalId:'qa-'+(i+(cursor?20:0)),topupId:null,orderId:null,type:type||'Topup',amount:10000,balanceAfter:10000*(i+1),postedAt:'2026-11-03T00:00:00Z',demoOnly:true,label:'Mô phỏng đồ án',currency:'VND'})),nextCursor:!type&&!cursor?'qa-next':null};
};
const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
function App(){const[page,setPage]=useState(5);const[owner,setOwner]=useState('qa-one');window.qa.owner=()=>setOwner('qa-two');return <main style={{padding:16,maxWidth:1000,margin:'auto',fontFamily:'var(--shop-body)'}}><h1 style={{fontSize:18,marginBottom:24}}>QA phân trang — dữ liệu giả</h1>{params.has('wallet')?<div style={{maxWidth:550}}><WalletHistory ownerId={owner}/></div>:<Pagination page={page} totalPages={40} totalItems={400} variant={params.get('variant')||'full'} isLoading={params.has('loading')} itemLabel="giao dịch" onPageChange={n=>{window.qa.changes.push(n);setPage(n)}}/>}</main>};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><App/></QueryClientProvider>);
`);
const server = await createServer({
  configFile: false, root: out, publicDir: path.join(root, 'apps/user-web/public'), plugins: [react()],
  cacheDir: path.join(out, 'vite'),
  resolve: { alias: Object.fromEntries(['react', 'react-dom', '@tanstack/react-query'].map(n => [n, path.join(root, 'apps/user-web/node_modules', n)])), dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 5186, strictPort: true, fs: { allow: [root] } },
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://127.0.0.1:5186/api/v1') },
});
let browser; const errors = []; const results = [];
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/v1/**', r => r.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }));
  const origin = 'http://127.0.0.1:5186';
  const nav = page.getByRole('navigation', { name: 'Điều hướng phân trang' });
  const next = () => nav.getByRole('button', { name: 'Đến trang tiếp theo', exact: true });
  const prev = () => nav.getByRole('button', { name: 'Đến trang trước', exact: true });
  for (const width of [1440, 768, 390, 320]) for (const scale of [1, 1.3]) {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: scale === 1 ? 'no-preference' : 'reduce' });
    await page.goto(origin); await nav.waitFor(); await page.evaluate(s => document.documentElement.style.fontSize = `${16 * s}px`, scale); await page.evaluate(() => document.fonts.ready);
    const bounds = await nav.boundingBox();
    for (const button of await nav.getByRole('button').all()) if (await button.isVisible()) {
      const box = await button.boundingBox(); assert.ok(box.x >= bounds.x - 1 && box.x + box.width <= bounds.x + bounds.width + 1, 'controls fit their container');
      if (width <= 390) assert.ok(box.height >= 44 && box.width >= 44, 'mobile touch targets');
      const icon = button.locator('svg');
      if (await icon.count()) assert.ok((await icon.boundingBox()).width >= 14, 'arrow remains visible with large text');
    }
    const before = await next().boundingBox(); await next().hover(); const after = await next().boundingBox(); assert.deepEqual(after, before, 'hover does not lift the button');
    await page.keyboard.press('Tab'); await prev().focus();
    await expect.poll(() => prev().evaluate(n => getComputedStyle(n).outlineOffset)).toBe('0px');
    await expect.poll(() => prev().evaluate(n => getComputedStyle(n).boxShadow)).toContain('rgb(92, 2, 2)');
    await next().click(); await expect(nav.getByText('Trang 6 / 40', { exact: true })).toHaveCount(1);
    assert.deepEqual(await page.evaluate(() => window.qa.changes), [6]);
    await page.screenshot({ path: path.join(out, `component-${width}-${scale}.png`) });
    results.push({ width, scale, geometry: 'PASS', keyboard: 'PASS', navigation: 'PASS' });
  }
  await page.goto(origin + '?variant=compact'); await nav.waitFor(); await expect(nav.getByRole('button')).toHaveCount(2); await expect(nav).toContainText('Trang 5 / 40');
  await page.goto(origin + '?loading'); await nav.waitFor(); for (const button of await nav.getByRole('button').all()) await expect(button).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(origin + '?wallet');
  const rows = page.getByRole('region', { name: 'Lịch sử giao dịch' }).locator('li');
  await expect(rows).toHaveCount(10); await expect(nav).toContainText('Hiển thị 1–10 giao dịch'); await expect(prev()).toBeDisabled();
  await next().click(); await expect(nav).toContainText('Hiển thị 11–20 giao dịch'); assert.equal(await page.evaluate(() => window.qa.calls.length), 1, 'cached page needs no new cursor');
  await next().click(); await expect(page.getByRole('alert')).toContainText('Chưa tải được trang tiếp theo'); await expect(rows).toHaveCount(10); await expect(nav).toContainText('11–20');
  await page.evaluate(() => window.qa.hold = true); await next().click(); await expect(next()).toBeDisabled(); await expect(prev()).toBeDisabled();
  await next().evaluate(n => { n.click(); n.click(); }); assert.equal(await page.evaluate(() => window.qa.calls.length), 3, 'no duplicate in-flight page request');
  await page.evaluate(() => window.qa.release()); await expect(rows).toHaveCount(5); await expect(nav).toContainText('21–25 trong 25 giao dịch'); await expect(next()).toBeDisabled();
  const cursors = await page.evaluate(() => window.qa.calls.slice(1)); assert.equal(cursors[0], cursors[1], 'retry reuses the failed cursor');
  await prev().click(); await expect(rows).toHaveCount(10); await expect(nav).toContainText('11–20 trong 25 giao dịch'); assert.equal(await page.evaluate(() => window.qa.calls.length), 3);
  await page.getByRole('tab', { name: 'Nạp tiền', exact: true }).click(); await expect(rows).toHaveCount(3); await expect(nav).toContainText('1–3 trong 3 giao dịch');
  assert.equal(await page.getByRole('tab', { name: 'Nạp tiền', exact: true }).evaluate(n => n === document.activeElement), true, 'filter keeps focus');
  await page.getByRole('tab', { name: 'Hoàn tiền', exact: true }).click(); await expect(page.getByLabel('Chưa có giao dịch')).toBeVisible(); await expect(nav).toHaveCount(0);
  await page.getByRole('tab', { name: 'Mua sách', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Chưa tải được dữ liệu'); await page.getByRole('button', { name: 'Thử lại', exact: true }).click(); await expect(rows).toHaveCount(10);
  // A response for an old filter must not move the newly selected filter to page 3.
  await page.goto(origin + '?wallet'); await expect(rows).toHaveCount(10); await page.evaluate(() => { window.qa.failNext = false; window.qa.hold = true; });
  await next().click(); await next().click(); await expect(next()).toBeDisabled(); await expect.poll(() => page.evaluate(() => typeof window.qa.release)).toBe('function');
  await page.getByRole('tab', { name: 'Nạp tiền', exact: true }).click(); await expect(rows).toHaveCount(3); await page.evaluate(() => window.qa.release());
  await expect(nav).toContainText('1–3 trong 3 giao dịch'); await expect(rows).toHaveCount(3);
  await page.getByRole('tab', { name: 'Tất cả', exact: true }).click(); await expect(rows).toHaveCount(10); await expect(nav).toContainText('1–10');
  await next().click(); await expect(nav).toContainText('11–20'); await page.evaluate(() => window.qa.owner()); await expect(nav).toContainText('1–10');
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await page.screenshot({ path: path.join(out, `wallet-${width}.png`), fullPage: true }); }
  await page.emulateMedia({ forcedColors: 'active' }); await page.keyboard.press('Tab'); await next().focus(); await expect.poll(() => next().evaluate(n => getComputedStyle(n).outlineStyle)).toBe('solid');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', source: 'Pagination + WalletHistory, fake transport; no DB', results, wallet: ['cached next/previous', 'cursor retry', 'no duplicate pending request', 'error retains rows', 'filter reset/focus', 'stale response isolation', 'owner reset', 'empty', 'initial retry'], pageErrors: errors.length }, null, 2));
  console.log('PASS pagination: 8 viewport/text/motion cases; compact/loading, keyboard/forced-colors; Wallet cursor/cache/error/retry/filter/owner/stale response. No DB.');
} finally { await browser?.close(); await server.close(); }
