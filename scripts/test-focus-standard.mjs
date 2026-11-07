// CSS/browser fixtures only. No auth, application DB, provider or real form submission.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(root,'apps/admin-web/package.json'));
const {chromium}=require('playwright');
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/project-focus');await fs.mkdir(out,{recursive:true});
async function cssFiles(dir){const files=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await cssFiles(p));else if(p.endsWith('.css')&&/focus/.test(await fs.readFile(p,'utf8')))files.push(p);}return files;}
const servers=[];let browser;const results=[];
try{
 browser=await chromium.launch({headless:true});
 for(const [app,port] of [['user-web',5190],['admin-web',5191]]){
  const appRoot=path.join(root,'apps',app);
  const server=await createServer({root:appRoot,cacheDir:path.join(out,'vite-'+app),server:{host:'127.0.0.1',port,strictPort:true}});await server.listen();servers.push(server);
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/v1/**',r=>r.fulfill({status:401,json:{code:'UNAUTHENTICATED'}}));
  await page.goto(`http://127.0.0.1:${port}/login`);await page.locator('input[type="password"]').waitFor();
  // Confirm the actual login field before installing any fixture markup.
  const loginField=page.locator('input[type="password"]').first();await loginField.focus();await page.waitForTimeout(180);
  assert.equal(await loginField.evaluate(n=>getComputedStyle(n).outlineStyle),'none',`${app} actual login focus`);
  const css=await cssFiles(path.join(appRoot,'src'));
  await page.evaluate(async paths=>{for(const p of paths)await import(/* @vite-ignore */p);},css.map(p=>'/'+path.relative(appRoot,p).replaceAll('\\','/')));
  await page.evaluate(()=>{
   const panel=document.createElement('section');panel.id='focus-qa';panel.setAttribute('aria-label','Dữ liệu kiểm tra focus');panel.style.cssText='position:fixed;inset:20px;z-index:2147483647;overflow:auto;background:#fffcf4;padding:24px;display:grid;gap:16px;align-content:start;color:#281914;font:14px sans-serif';
   panel.innerHTML=`<strong>QA — focus fixtures, không gửi dữ liệu</strong>
    <label>Ô nhập<input id="focus-text" style="border:1px solid #d9d0bf;border-radius:8px;padding:12px" /></label>
    <label>Ô lỗi<input id="focus-error" aria-invalid="true" style="border:1px solid #a32d34;padding:12px" /></label>
    <div data-focus-surface id="focus-owner" style="display:flex;border:1px solid #d9d0bf;border-radius:8px;padding:8px"><span>⌕</span><input id="focus-child" style="border:0;background:transparent"/><button type="button">Xóa</button></div>
    <textarea id="focus-area" aria-label="Nội dung"></textarea>
    <select id="focus-select" aria-label="Chọn"><option>Một</option><option>Hai</option></select>
    <label><input id="focus-check" type="checkbox" checked /> Checkbox</label>
    <label><input id="focus-radio" type="radio" name="focus-fixture-radio" checked /> Radio</label>
    <label id="focus-file-owner" style="padding:12px;border:1px solid #d9d0bf;border-radius:8px">Chọn ảnh<input id="focus-file" type="file" style="opacity:0;width:1px;height:1px" /></label>
    <label id="focus-file-label">Ảnh đóng gói<span data-focus-surface id="focus-file-nested-owner" style="display:block;border:1px solid #d9d0bf;padding:12px">Chọn ảnh<input id="focus-file-nested" type="file" style="opacity:0;width:1px;height:1px" /></span></label>
    <div data-focus-inverse style="padding:16px;background:#5c0202;color:#fffcf4"><button id="focus-button" type="button" style="background:#5c0202;color:#fffcf4;padding:12px;border:0">Nút nền đỏ</button></div>
    <button id="focus-tab" type="button" role="tab" aria-selected="true">Tab đã chọn</button>
    <a id="focus-link" href="#focus-qa">Liên kết</a><details><summary id="focus-summary">Chi tiết</summary>Nội dung</details>
    <input id="focus-disabled" disabled aria-label="Đã khóa" />`;
   document.body.append(panel);
  });
  for(const width of [1440,390])for(const reducedMotion of ['no-preference','reduce']){
   await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion,forcedColors:'none'});
   for(const id of ['focus-text','focus-error','focus-child','focus-area','focus-select']){
    const control=page.locator('#'+id);await control.focus();
    await control.evaluate(async(n,{id})=>{
      const until=Date.now()+2500;
      const color=id==='focus-error'?'rgb(163, 45, 52)':'rgb(92, 2, 2)';
      const target=id==='focus-child'?n.closest('[data-focus-surface]'):n;
      while(Date.now()<until){if(getComputedStyle(target).boxShadow.includes(color))break;await new Promise(r=>setTimeout(r,20));}
    },{id});
    const paint=await control.evaluate(n=>{const s=getComputedStyle(n);return {outline:s.outlineStyle,shadow:s.boxShadow,border:s.borderColor,duration:s.transitionDuration};});
    assert.equal(paint.outline,'none',`${app}/${id} no detached outline`);
    if(id==='focus-child'){
     assert.equal(paint.shadow,'none','composite input does not draw a second ring');
     const owner=await page.locator('#focus-owner').evaluate(n=>getComputedStyle(n).boxShadow);assert.ok(owner.includes('rgb(92, 2, 2)')&&owner.includes('1px'),'composite perimeter');
    }else assert.ok(paint.shadow.includes(id==='focus-error'?'rgb(163, 45, 52)':'rgb(92, 2, 2)'),`${app}/${id} semantic focus color: ${JSON.stringify(paint)}`);
    assert.ok(paint.duration.split(',').every(v=>v.trim()==='0.14s'),'140ms even with OS reduce preference');
   }
   await page.locator('#focus-check').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#focus-radio').evaluate(n=>n===document.activeElement),true);
   await page.locator('#focus-file').focus();assert.notEqual(await page.locator('#focus-file-owner').evaluate(n=>getComputedStyle(n).boxShadow),'none','hidden file input highlights its visible owner');
   await page.locator('#focus-file-nested').focus();assert.equal(await page.locator('#focus-file-label').evaluate(n=>getComputedStyle(n).boxShadow),'none','file caption does not get a second ring');assert.notEqual(await page.locator('#focus-file-nested-owner').evaluate(n=>getComputedStyle(n).boxShadow),'none');
   for(const id of ['focus-button','focus-tab','focus-link','focus-summary']){
    await page.locator('#'+id).focus();const s=await page.locator('#'+id).evaluate(n=>({outline:getComputedStyle(n).outlineStyle,shadow:getComputedStyle(n).boxShadow}));assert.equal(s.outline,'none');assert.notEqual(s.shadow,'none','keyboard focus stays visible');
   }
   assert(await page.locator('#focus-check').isChecked());assert(await page.locator('#focus-radio').isChecked());assert(await page.locator('#focus-disabled').isDisabled());assert.equal(await page.locator('#focus-tab').getAttribute('aria-selected'),'true');
   await page.emulateMedia({forcedColors:'active'});await page.locator('#focus-text').focus();const forced=await page.locator('#focus-text').evaluate(n=>({style:getComputedStyle(n).outlineStyle,width:getComputedStyle(n).outlineWidth}));assert.equal(forced.style,'solid');assert.equal(forced.width,'2px');
   results.push({app,width,reducedMotion,controls:13,forcedColors:true,keyboard:true});
  }
  await page.emulateMedia({forcedColors:'none'});await page.locator('#focus-text').focus();await page.waitForTimeout(160);await page.locator('#focus-qa').screenshot({path:path.join(out,app+'.png')});
  assert.deepEqual(errors,[]);await context.close();
 }
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({result:'PASS',views:results,environment:'Vite + injected DOM/CSS fixtures; all API calls intercepted, no DB'},null,2));
 console.log(`PASS focus standard: ${results.length} app/viewport/motion cases; actual login fields + all lazy focus CSS; fields, composite, error, button, tab, link, summary, checkbox, disabled, keyboard and forced colors. No DB.`);
}finally{await browser?.close();for(const s of servers)await s.close();}
