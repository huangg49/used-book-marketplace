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
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'result.json'),JSON.stringify({status:'PASS',results,pageErrors:errors.length,environment:'Home route, intercepted HTTP; no DB'},null,2));console.log('PASS Home hero search: gold hover/focus, one outer ring, stable dimensions, keyboard, Enter/button query, 1440/390 and reduced-motion. No DB.');
}finally{await browser?.close();await server.close();}
