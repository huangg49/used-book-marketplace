// Actual Directory/Support + shared queue footer. Read fixtures only; no DB/session provider.
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
const out = path.join(root, '.tmp/admin-pagination-layout');
await fs.mkdir(out, { recursive: true });
const source = root.replaceAll('\\', '/').replace(/\/$/, '');
await fs.writeFile(path.join(out, 'index.html'), '<html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
await fs.writeFile(path.join(out, 'fixture.tsx'), `
import React from'react';import{createRoot}from'react-dom/client';
import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import{BrowserRouter,Routes,Route,Outlet,Link}from'react-router-dom';
import{UserDirectory}from'/@fs/${source}/apps/admin-web/src/features/users/directory.tsx';
import{SupportQueuePage}from'/@fs/${source}/apps/admin-web/src/features/support/SupportPages.tsx';
import{CursorPagination}from'/@fs/${source}/apps/admin-web/src/core/ui.tsx';
import{session}from'/@fs/${source}/apps/admin-web/src/core/session.ts';
import desk from'/@fs/${source}/apps/admin-web/src/features/review/ReviewWorkspace.module.css';
import'/@fs/${source}/apps/admin-web/src/index.css';
import'/@fs/${source}/packages/brand/v1.1/focus.css';
const now=new Date().toISOString(),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:id(1),displayName:'Quản trị QA',email:'admin@pagination.test',status:'ACTIVE',roles:['ADMIN']};
window.qa={fail:false,calls:[]};session.request=async(url)=>{window.qa.calls.push(url);const c=new URL(url,location.origin).searchParams.get('cursor');if(c&&window.qa.fail){window.qa.fail=false;throw Error('QA next read failure');}
const items=Array.from({length:c?5:20},(_,i)=>({id:id(i+(c?30:10)),displayName:'Bạn đọc QA '+i,email:'qa'+i+'@pagination.test',status:'ACTIVE',roles:['MEMBER'],emailVerifiedAt:now,createdAt:now,updatedAt:now,title:'Phản ánh QA '+i,kind:'Feedback',state:'Open',reporterName:'Bạn đọc QA',assigneeId:null,target:null}));return{items,nextCursor:c?null:'qa-next',serverTime:now};};
const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><BrowserRouter><main style={{padding:24,maxWidth:1200,margin:'auto'}}><p>QA bố cục — dữ liệu giả, không ghi DB</p><nav><Link to="/users">Người dùng QA</Link> · <Link to="/support">Hỗ trợ QA</Link></nav><Routes><Route element={<Outlet context={user}/>}><Route path="/users" element={<UserDirectory/>}/><Route path="/support" element={<SupportQueuePage/>}/></Route><Route path="/queue" element={<section className={desk.queue}><CursorPagination pageCount={2} hasNextPage isFetching={false} isFetchingNextPage={false} onNextPage={()=>{}} nextLabel="Xem thêm hồ sơ"/></section>}/></Routes></main></BrowserRouter></QueryClientProvider>);
`);
const server = await createServer({ configFile: false, root: out, publicDir: path.join(root, 'apps/admin-web/public'), plugins: [react()],
  cacheDir: path.join(out, 'vite'), resolve: { alias: Object.fromEntries(['react','react-dom','@tanstack/react-query','react-router-dom'].map(n=>[n,path.join(root,'apps/admin-web/node_modules',n)])), dedupe:['react','react-dom'] },
  server: { host:'127.0.0.1',port:5187,strictPort:true,fs:{allow:[root]} } });
let browser;
const errors=[],results=[];
try {
  await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.fulfill({status:404,body:''}));
  await page.route('**/api/**',r=>r.fulfill({status:401,json:{code:'QA_NO_API'}}));
  const origin='http://127.0.0.1:5187';
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto(origin+'/users');
    if(width===320)await page.evaluate(()=>document.documentElement.style.fontSize='130%');
    const footer=page.getByRole('navigation',{name:'Phân trang',exact:true});
    await expect(page.locator('tbody tr')).toHaveCount(20);await expect.poll(()=>footer.evaluate(n=>getComputedStyle(n).flexDirection)).toBe('column');
    await page.evaluate(()=>window.qa.fail=true);await footer.getByRole('button',{name:'Xem thêm người dùng'}).click();await expect(footer.getByRole('button',{name:'Thử tải thêm'})).toBeVisible();await expect(page.locator('tbody tr')).toHaveCount(20);
    await footer.getByRole('button',{name:'Thử tải thêm'}).click();await expect(page.locator('tbody tr')).toHaveCount(25);await expect(footer).toContainText('Đã tải hết danh sách');
    await page.getByRole('link',{name:'Hỗ trợ QA',exact:true}).click();await expect(footer.getByRole('button',{name:'Xem thêm hồ sơ',exact:true})).toBeVisible();
    const style=await footer.evaluate(n=>{const s=getComputedStyle(n);return{direction:s.flexDirection,margin:s.marginTop,padding:s.paddingTop};});
    const rem=await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
    assert.deepEqual(style,{direction:'row',margin:(1.75*rem)+'px',padding:(1.25*rem)+'px'},'Directory CSS must not restyle Support after navigation');
    await footer.scrollIntoViewIfNeeded();const box=await footer.boundingBox(),button=await footer.getByRole('button').boundingBox();assert.ok(button.x>=box.x&&button.x+button.width<=box.x+box.width+1,'footer action fits');
    await page.screenshot({path:path.join(out,'support-after-users-'+width+'.png')});results.push({width,directoryRetry:'PASS',supportStyleIsolation:'PASS'});
  }
  await page.goto(origin+'/queue');const queue=page.getByRole('navigation',{name:'Phân trang',exact:true});
  assert.equal(await queue.evaluate(n=>getComputedStyle(n).paddingTop),'16px','review queue keeps its pane-specific spacing');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'result.json'),JSON.stringify({status:'PASS',results,pageErrors:0,environment:'Actual Users/Support + shared review queue footer; fake transport; no DB'},null,2));
  console.log('PASS Admin pagination: Directory retry + Support style isolation at 4 widths; review queue footer preserved; no DB.');
}finally{await browser?.close();await server.close();}
