// Actual Home route + HTTP fixtures. No application DB, auth or provider writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(path.join(root,'apps/admin-web/package.json'));
const {chromium,expect}=require('playwright/test');
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/home-search-focus');await fs.mkdir(out,{recursive:true});
const origin='http://127.0.0.1:5187';
const server=await createServer({root:path.join(root,'apps/user-web'),cacheDir:path.join(out,'vite'),server:{host:'127.0.0.1',port:5187,strictPort:true},define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify(origin+'/api/v1')}});
let browser;const results=[];const errors=[];
try{
 await server.listen();browser=await chromium.launch({headless:true});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',r=>new URL(r.request().url()).pathname==='/api/v1/listings'?r.fulfill({json:{items:[],nextCursor:null,serverTime:new Date().toISOString()}}):r.fulfill({status:401,json:{code:'UNAUTHENTICATED'}}));
 await page.addInitScript(() => {
   window.qaLeafFrames = 0;
   const clearRect = CanvasRenderingContext2D.prototype.clearRect;
   CanvasRenderingContext2D.prototype.clearRect = function (...args) {
     if (this.canvas.dataset.testid === 'autumn-leaves-canvas') window.qaLeafFrames++;
     return clearRect.apply(this, args);
   };
 });
 const imageRequests = [];
 page.on('request', request => {
   if (request.resourceType() === 'image') imageRequests.push(request.url());
 });
 await page.goto(origin + '/books?data=live', {waitUntil:'domcontentloaded'});
 await page.locator('#catalog-search').waitFor();
 const deepLinkImages = imageRequests.splice(0);
 await page.goto(origin + '/?data=live#home', {waitUntil:'domcontentloaded'});
 const hero = page.getByRole('heading',{level:1}).locator('img');
 await expect.poll(() => hero.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
 const heroSrc = await hero.evaluate(img => img.currentSrc);
 const preload = page.locator('head link[rel="preload"][as="image"]');
 assert.equal(new URL(heroSrc).pathname, '/brand/hero-lettering.webp');
 await expect(preload).toHaveAttribute('href', new URL(heroSrc).pathname);
 await expect(preload).toHaveAttribute('type', 'image/webp');
 const brand = page.getByRole('banner').getByRole('link', { name: 'Trang chủ Lật lại' }).locator('img');
 await expect(brand).toHaveCount(2);
 await expect(brand.first()).toHaveAttribute('src', '/brand/logo-original.webp');
 await expect.poll(() => brand.evaluateAll(images => images.every(img => img.complete && img.naturalWidth === 2000))).toBe(true);
 assert(!imageRequests.some(url => /\/brand\/(hero-lettering|logo-original)\.png$/.test(url)));
 await expect(preload).toHaveAttribute('fetchpriority', 'high');
 assert(!deepLinkImages.includes(heroSrc), 'Search deep links do not download Home lettering');
 assert.equal(imageRequests.filter(url => url === heroSrc).length, 1, 'Home reuses the preload');
 await page.setViewportSize({width:390,height:450});
 const leaves = page.getByTestId('autumn-leaves-canvas');
 await leaves.evaluate(canvas => canvas.parentElement.scrollIntoView({block:'start',behavior:'instant'}));
 await expect.poll(() => page.evaluate(() => window.qaLeafFrames)).toBeGreaterThan(0);
 await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
 await expect.poll(() => leaves.evaluate(canvas => canvas.getBoundingClientRect().top >= innerHeight)).toBe(true);
 const offscreenFrames = await page.evaluate(async () => {
   const nextFrame = () => new Promise(requestAnimationFrame);
   await nextFrame();
   await nextFrame();
   const before = window.qaLeafFrames;
   try {
     for (const hidden of [true,false]) {
       Object.defineProperty(document,'hidden',{configurable:true,value:hidden});
       document.dispatchEvent(new Event('visibilitychange'));
       await nextFrame();
       await nextFrame();
     }
     return window.qaLeafFrames - before;
   } finally {
     delete document.hidden;
   }
 });
 assert.equal(offscreenFrames, 0, 'Returning to the tab does not restart an offscreen canvas');
 const pausedFrames = await page.evaluate(() => window.qaLeafFrames);
 await leaves.evaluate(canvas => canvas.parentElement.scrollIntoView({block:'start',behavior:'instant'}));
 await expect.poll(() => page.evaluate(() => window.qaLeafFrames)).toBeGreaterThan(pausedFrames);
 for(const width of [1440,390])for(const reducedMotion of ['no-preference','reduce']){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion});await page.goto(origin+'/');
  const input=page.locator('#home-search'),form=page.getByRole('search');await input.waitFor();await page.evaluate(()=>document.fonts.ready);await form.scrollIntoViewIfNeeded();await page.waitForTimeout(400);
  await page.mouse.move(0,0);const before=await form.boundingBox();
  await form.hover();await expect.poll(()=>form.evaluate(n=>getComputedStyle(n).borderColor)).toBe('rgb(244, 203, 103)');
  await input.click();await expect.poll(()=>form.evaluate(n=>getComputedStyle(n).boxShadow)).toContain('rgb(244, 203, 103)');
  const inside=await input.evaluate(n=>({outline:getComputedStyle(n).outlineStyle,shadow:getComputedStyle(n).boxShadow}));assert.equal(inside.outline,'none');assert.equal(inside.shadow,'none','only the outer form draws focus');
  const focused=await form.boundingBox();assert.equal(focused.width,before.width);assert.equal(focused.height,before.height);
  await page.mouse.move(0,0);await input.focus();assert.equal(await input.evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await form.getByRole('button').evaluate(n=>n===document.activeElement),true);
  await input.focus();await page.waitForTimeout(180);await form.screenshot({path:path.join(out,`home-${width}-${reducedMotion}.png`)});
  await input.fill('sách cũ & QA');if(width===1440)await input.press('Enter');else await form.getByRole('button',{name:/Tìm sách/}).click();
  await page.waitForURL('**/books?**');const url=new URL(page.url());assert.equal(url.searchParams.get('q'),'sách cũ & QA','query survives Enter and button submit');
  results.push({width,reducedMotion,goldHover:true,singleOuterFocus:true,geometryStable:true,keyboard:true,queryRetained:true});
 }
 const fallback = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
 try {
  fallback.on('pageerror', e => errors.push(e.message));
  await fallback.route('**/api/v1/**', route => route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } }));
  await fallback.route(/\/brand\/(hero-lettering|logo-original)\.webp$/, route => route.fulfill({ status: 404, body: '' }));
  await fallback.goto(origin + '/');
  const fallbackHero = fallback.getByRole('heading', { level: 1 }).locator('img');
  const fallbackLogo = fallback.getByRole('banner').getByRole('link', { name: 'Trang chủ Lật lại' }).locator('img');
  await expect(fallbackHero).toHaveAttribute('src', '/brand/hero-lettering.png');
  await expect.poll(() => fallbackHero.evaluate(img => img.complete && img.naturalWidth === 1313)).toBe(true);
  await expect.poll(() => fallbackLogo.evaluateAll(images => images.length === 2 && images.every(
    img => img.complete && img.naturalWidth === 2000 && img.currentSrc.endsWith('/brand/logo-original.png'),
  ))).toBe(true);
 } finally { await fallback.close(); }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'result.json'),JSON.stringify({status:'PASS',heroPreload:true,losslessBrandAssets:true,pngFallback:true,leafLifecycle:true,results,pageErrors:errors.length,environment:'Home route, intercepted HTTP; no DB'},null,2));console.log('PASS Home hero search: Home-only preload, leaf pause/resume, gold hover/focus, one outer ring, stable dimensions, keyboard, Enter/button query, 1440/390 and reduced-motion. No DB.');
}finally{await browser?.close();await server.close();}
