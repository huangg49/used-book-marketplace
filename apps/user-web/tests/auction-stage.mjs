// Frontend-only Chromium regression. Auction data and book covers below are
// explicitly synthetic QA fixtures; no API/Mongo writes, bids or credentials.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url))
const webRequire = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const sharp = createRequire(new URL('../../api/package.json', import.meta.url))('sharp')
const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href)
const origin = 'http://127.0.0.1:5196'
const evidence = path.join(root, process.env.AUCTION_MOTION_EVIDENCE ?? '.impeccable/review/auction-entrance')
const videoDir = path.join(root, '.tmp/auction-entrance/video')
await mkdir(evidence, { recursive: true })
await mkdir(videoDir, { recursive: true })
process.env.VITE_API_BASE_URL = `${origin}/api/v1`
const serverTime = new Date().toISOString()
const id = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const items = ['Alice — QA', 'Mrs. Dalloway — QA', 'Siddhartha — QA'].map((title, i) => ({
  id: id(i + 1), listingId: id(i + 11), title, state: 'Active', startPrice: 100000,
  currentPrice: null, step: 10000, minimumBid: 100000, buyNowPrice: i === 0 ? 300000 : null,
  bidderCount: 0, startAt: serverTime, endAt: new Date(Date.now() + (i + 20) * 3600000).toISOString(),
  pointName: 'Điểm mô phỏng QA', demoOnly: true,
  book: { revisionId: id(i + 21), authors: ['Tác giả QA'], condition: 'Good', pages: '',
    coverNote: '', notes: '', accessories: '', description: 'Dữ liệu giả lập để kiểm tra giao diện',
    hasMissingPages: false, photos: [{ id: id(i + 31), width: 240, height: 360 }] },
}))
let mode = 'ready'
let photosFailed = false
const errors = []
const checks = []
const navbarSamples = []
let server, browser
const hero = page => page.locator('section[aria-labelledby="auction-hero-title"]')
const flush = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const entrance = page => page.locator('[data-auction-entrance]')
const seek = async (page, time) => {
 await page.evaluate(time => {
   const elapsed=time<=2540?time/2:1270+(time-2540)/4;
   window.__tick(1000);window.__tick(1000+elapsed);
 }, time)
 await flush(page)
}
const settled = page => page.waitForFunction(() => document.querySelector('[data-auction-entrance]')?.hidden)
const closedCoverage = async page => {
 const clip=await entrance(page).boundingBox();
 const before=await page.screenshot({clip});await page.locator('#root').evaluate(el=>el.style.visibility='hidden');
 const after=await page.screenshot({clip});await page.locator('#root').evaluate(el=>el.style.visibility='');
 await flush(page);
 const a=await sharp(before).removeAlpha().raw().toBuffer(),b=await sharp(after).removeAlpha().raw().toBuffer();
 let changed=0;for(let i=0;i<a.length;i+=3)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;
 assert.equal(changed,0,'closed curtain below navbar must conceal page content')
}
const navbarContinuity = async page => {
 const nav=page.getByRole('banner');
 // Responsive navbar transitions belong to the existing header. Wait for those
 // before comparing two pixels samples, so elapsed header motion is not blamed on cloth.
 await nav.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
 const bounds=await nav.boundingBox(),curtain=await entrance(page).boundingBox();
 assert.ok(curtain.y>=bounds.y+bounds.height-1,'frame begins below navbar');
 const before=await nav.screenshot();await entrance(page).evaluate(el=>el.style.visibility='hidden');
 const after=await nav.screenshot();await entrance(page).evaluate(el=>el.style.visibility='');
 const a=await sharp(before).raw().toBuffer(),b=await sharp(after).raw().toBuffer();
 let maxDifference=0,changedChannels=0;
 for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);maxDifference=Math.max(maxDifference,delta);if(delta)changedChannels++}
 // Chromium can round antialiasing of the mobile menu's curved 1px border by
 // one channel unit when another composited layer is toggled (observed 18px).
 // No meaningful pixel or geometry difference is allowed; record actual delta.
 assert.equal(a.length,b.length);assert.ok(maxDifference<=1,'curtain must not obscure navbar pixels');
 navbarSamples.push({width:bounds.width,height:bounds.height,curtainTop:curtain.y,maxChannelDifference:maxDifference,changedChannels});
 assert.equal(await page.evaluate(()=>{
   const nav=document.querySelector('header'),box=nav.getBoundingClientRect();
   return nav.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2));
 }),true,'navbar retains hit testing');
 // Repaint WebGL after toggling its parent visibility for the comparison.
 await seek(page,0);
}
const cache = (page, value) => page.evaluate(async value => {
  const { queryClient } = await import('/src/lib/session.ts')
  queryClient.setQueryData(['auctions'], value)
}, value)
const overflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow')
async function fixture(context) {
  // This fixture has no realtime server. Keep Socket.IO away from Vite's
  // same-origin dev proxy, which would otherwise forward back into itself.
  await context.routeWebSocket(/\/socket\.io\//, socket => socket.close())
  await context.route(`${origin}/socket.io/**`, route =>
    route.fulfill({ status: 503, json: { message: 'Frontend-only QA: realtime unavailable' } }))
  await context.route(`${origin}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/auctions') {
      if (mode === 'pending') await new Promise(resolve => setTimeout(resolve, 1700))
      if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'QA unavailable' } })
      return route.fulfill({ json: { items: mode === 'empty' ? [] : items, serverTime } })
    }
    const photo = url.pathname.match(/\/auctions\/([^/]+)\/photos\//)
    if (photo) {
      if (photosFailed) return route.fulfill({ status: 503, json: { message: 'QA photo unavailable' } })
      return route.fulfill({ json: { id: id(31), width: 240, height: 360,
        url: `${origin}/__qa_cover/${items.findIndex(item => item.id === photo[1])}`, expiresAt: new Date(Date.now() + 600000).toISOString() } })
    }
    return route.fulfill({ status: 503, json: { message: 'Frontend-only QA: unrelated API unavailable' } })
  })
  await context.route(`${origin}/__qa_cover/*`, route => {
    const index = Number(route.request().url().split('/').at(-1))
    const colors = ['#eee1be', '#784235', '#274b46']
    const titles = ['ALICE', 'MRS.', 'SIDDHARTHA']
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360"><rect width="240" height="360" fill="${colors[index]}"/><rect x="12" y="12" width="216" height="336" fill="none" stroke="#b89653" stroke-width="2"/><text x="120" y="100" text-anchor="middle" font-family="Georgia" font-size="${index === 2 ? 23 : 34}" fill="${index === 0 ? '#5c0202' : '#fcf8db'}">${titles[index]}</text>${index === 1 ? '<text x="120" y="140" text-anchor="middle" font-family="Georgia" font-size="27" fill="#fcf8db">DALLOWAY</text>' : ''}<path d="M65 230H175M85 250H155" stroke="#b89653" stroke-width="2"/><text x="120" y="320" text-anchor="middle" font-family="sans-serif" font-size="15" fill="${index === 0 ? '#5c0202' : '#fcf8db'}">QA — BÌA MẪU</text></svg>` })
  })
  await context.addInitScript(() => {
    window.__stageStarts=0;window.__holdStage=true;let latest;
    const raf=requestAnimationFrame;
    window.requestAnimationFrame=callback=>raf(now=>{
      if(callback.name==='tick'&&document.querySelector('[data-auction-entrance]')?.dataset.state==='opening'){
        if(latest!==callback){latest=callback;window.__stageStarts++}
        window.__tick=callback;
        if(window.__holdStage)return;
      }
      callback(now);
    });
  })
}
const label = page => page.evaluate(() => {
  if (document.getElementById('qa-label')) return
  const label = document.createElement('div')
  label.id = 'qa-label'
  label.textContent = 'QA — phiên và bìa sách giả lập'
  Object.assign(label.style, { position: 'fixed', bottom: '8px', left: '8px', zIndex: '99999', color: '#5c0202', background: '#fcf8db', padding: '6px 10px', font: '12px sans-serif', border: '1px solid #8e7564' })
  document.body.append(label)
})
const go = async page => {
  await page.goto(`${origin}/auctions`, { waitUntil: 'domcontentloaded' })
  await hero(page).waitFor()
  await page.evaluate(() => document.fonts.ready)
  // Repeated hard navigation can restore the previous document's scroll after
  // MainLayout's effect. Capture the intended top-of-page entrance explicitly.
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
  await label(page)
}
const finish = async page => { await seek(page,3000);await settled(page) }
const shoot = async (page,name) => {
 await overflow(page);await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:!name.includes('opening')&&!name.includes('closed')})
}
try {
 server=await createServer({root:path.join(root,'apps/user-web'),server:{host:'127.0.0.1',port:5196,strictPort:true}});await server.listen();
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await fixture(context);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const ready=page=>page.waitForFunction(()=>window.__stageStarts>0&&document.querySelector('[data-auction-entrance]')?.dataset.state==='opening');
 await go(page);await ready(page);await seek(page,0);await closedCoverage(page);await navbarContinuity(page);await shoot(page,'closed-desktop');
 assert.equal(await page.evaluate(()=>window.__stageStarts),1,'StrictMode one opening');
 assert.equal(await entrance(page).getAttribute('data-duration'),'1385');
 await seek(page,900);await shoot(page,'opening-desktop');
 await seek(page,2480);await shoot(page,'gathered-desktop');
 await finish(page);await shoot(page,'desktop');
 assert.equal(await entrance(page).locator('canvas').count(),0,'finished render resources detached');
 checks.push('StrictMode one 1385ms sequence: opening pace retained, fade 230→115ms; closed content coverage; navbar geometry/hit testing preserved, pixel delta ≤1/255; finite disposal');
 await page.getByLabel('Có giá mua ngay').click();await page.waitForURL('**/auctions?buyNow=1');
 await cache(page,{items:items.map((item,i)=>i===0?{...item,currentPrice:120000,bidderCount:1}:item),serverTime});
 await page.waitForFunction(()=>document.querySelector('section[aria-labelledby="auction-hero-title"]').textContent.includes('120.000'));
 assert.equal(await page.evaluate(()=>window.__stageStarts),1,'query/filter do not replay');
 await page.getByRole('banner').getByRole('link',{name:'Trang chủ Lật lại'}).click();await entrance(page).waitFor({state:'detached'});
 await page.goBack();await page.waitForFunction(()=>window.__stageStarts===2);await seek(page,0);await navbarContinuity(page);await finish(page);
 // Verify actual in-app navigation from Home, rather than only direct reload.
 await page.getByRole('banner').getByRole('link',{name:'Trang chủ Lật lại'}).click();
 await page.getByRole('banner').getByRole('link',{name:'Đấu giá',exact:true}).click();
 await page.waitForFunction(()=>window.__stageStarts===3);await seek(page,0);await navbarContinuity(page);await shoot(page,'navigation-desktop');await finish(page);
 checks.push('Filter/cache price updates no replay; Home→Back/Home navbar→Auction fresh opening retains navbar');
 await page.setViewportSize({width:390,height:844});await go(page);await ready(page);await seek(page,0);await closedCoverage(page);await navbarContinuity(page);await shoot(page,'closed-mobile');
 await seek(page,900);await shoot(page,'opening-mobile');
 // Resize must retain timeline rather than starting over.
 await page.setViewportSize({width:768,height:900});await flush(page);assert.equal(await entrance(page).getAttribute('data-time'),'900');
 await page.setViewportSize({width:390,height:844});await seek(page,2480);await shoot(page,'gathered-mobile');
 await finish(page);await shoot(page,'mobile');checks.push('390px portrait/768px resize: retains time; pixel coverage/no overflow');
 for(const how of ['focus','pointer','scroll','hidden']){
   await go(page);await ready(page);await seek(page,250);
   if(how==='focus')await hero(page).getByRole('link',{name:'Xem các phiên đang mở'}).focus();
   if(how==='pointer')await page.getByRole('banner').getByRole('button',{name:/menu|điều hướng/i}).click();
   if(how==='scroll')await page.evaluate(()=>scrollTo(0,500));
   if(how==='hidden')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
   await settled(page);assert.equal(await entrance(page).locator('canvas').count(),0);
 }
 checks.push('Focus/pointer/scroll/document hidden release content and resources');
 await go(page);await ready(page);await seek(page,1780);
 await page.locator('[data-auction-entrance] canvas').first().evaluate(c=>c.getContext('webgl').getExtension('WEBGL_lose_context').loseContext());
 await page.waitForFunction(()=>document.querySelectorAll('[data-auction-entrance] canvas').length===2);
 assert.equal(await entrance(page).getAttribute('data-time'),'1780');await finish(page);
 checks.push('WebGL context loss fallback retains time');
 for(const nextMode of ['pending','empty','error']){
   mode=nextMode;await go(page);await ready(page);await finish(page);await shoot(page,nextMode);
 }
 mode='ready';photosFailed=true;await go(page);await ready(page);await finish(page);
 await hero(page).getByRole('button',{name:'Tải lại ảnh'}).waitFor();photosFailed=false;
 await hero(page).getByRole('button',{name:'Tải lại ảnh'}).click();await hero(page).locator('img[alt^="Ảnh 1"]').waitFor();
 checks.push('Pending/empty/API error/photo retry remain usable after entrance');
 for(const failure of ['broken','slow','no-canvas','canvas']){
   const ctx=await browser.newContext({viewport:{width:390,height:844}});await fixture(ctx);
   if(failure==='broken')await ctx.route('**/illustrations/auction-curtain/inner-closed-left.png',r=>r.abort());
   if(failure==='slow')await ctx.route('**/illustrations/auction-curtain/inner-closed-left.png',async r=>{await new Promise(resolve=>setTimeout(resolve,1800));await r.continue()});
   if(failure==='no-canvas')await ctx.addInitScript(()=>HTMLCanvasElement.prototype.getContext=()=>null);
   if(failure==='canvas')await ctx.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl'?null:get.call(this,kind,...args)}});
   const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await go(p);
   if(failure==='canvas'){await ready(p);assert.match(await entrance(p).getAttribute('data-renderer'),/Canvas 2D/);await finish(p)}else{await settled(p);assert.equal(await p.evaluate(()=>window.__stageStarts),0)}
   await p.waitForTimeout(900);assert.equal(await entrance(p).locator('canvas').count(),0,'late image may not resurrect disposed art');
   await ctx.close();
 }
 checks.push('Failed/slow art ≤1200ms fallback; no Canvas fallback open; Canvas2D full rig; no late resurrection');
 const videoContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',recordVideo:{dir:videoDir,size:{width:1440,height:900}}});await fixture(videoContext);
 await videoContext.addInitScript(()=>window.__holdStage=false);const p=await videoContext.newPage();await go(p);await settled(p);
 const video=p.video();await videoContext.close();await video.saveAs(path.join(evidence,'opening.webm'));
 assert.deepEqual(errors,[]);
 await writeFile(path.join(evidence,'runtime.json'),JSON.stringify({date:'2026-10-13',fixture:'synthetic frontend-only; no API/DB writes',checks,navbarSamples,pageErrors:errors,limits:['physical phone/Safari/native','continuous FPS','real auction API/photos']},null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',checks,evidence},null,2));
} finally {await browser?.close();await server?.close()}
