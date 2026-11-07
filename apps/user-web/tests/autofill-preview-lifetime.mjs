// Real PhotoAutofill in StrictMode dev and production; no upload or AI calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),app=path.join(root,'apps/user-web');
const require=createRequire(path.join(app,'package.json'));
const {chromium,expect}=createRequire(new URL('../../admin-web/package.json',import.meta.url))('playwright/test');
const {build,preview,createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const {default:react}=await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
const baseline=process.env.AUTOFILL_PREVIEW_BASELINE==='1';
const out=path.join(root,'.tmp/member-web-autofill-preview-lifetime'),fixture=path.join(app,'.tmp/autofill-preview-lifetime');
await mkdir(out,{recursive:true});await mkdir(fixture,{recursive:true});
await writeFile(path.join(fixture,'index.html'),'<html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./entry.tsx"></script></html>');
await writeFile(path.join(fixture,'entry.tsx'),`
import React,{StrictMode,useMemo,useState} from 'react';import {createRoot} from 'react-dom/client';
import {PhotoAutofill} from '../../src/components/PhotoAutofill';
import {createDraftAttempt} from '../../src/services/listing-submission';
import '../../src/styles/global.css';import '../../../../packages/brand/v1.1/focus.css';
function App(){const [show,setShow]=useState(true),attempt=useMemo(createDraftAttempt,[]);
 return <main style={{maxWidth:720,margin:'auto',padding:16}}><button onClick={()=>setShow(v=>!v)}>Đóng khung QA</button>
 {show&&<PhotoAutofill attempt={attempt} onUseField={()=>{}} onPickBook={()=>{}}/>}</main>}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
`);
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const mode of ['development','production']){
  // Vite dev initializes NODE_ENV in this fixture process; reset it before build.
  process.env.NODE_ENV=mode;
  const origin='http://127.0.0.1:4235';let server;
  try{
   if(mode==='development'){
    server=await createServer({configFile:false,root:app,plugins:[react()],logLevel:'error',server:{host:'127.0.0.1',port:4235,strictPort:true}});await server.listen();
   }else{
    const dist=path.join(out,baseline?'before-fixture':'after-fixture');
    await build({configFile:false,root:app,plugins:[react()],logLevel:'error',build:{outDir:dist,emptyOutDir:false,rolldownOptions:{input:path.join(fixture,'index.html')}}});
    server=await preview({configFile:false,root:app,build:{outDir:dist},preview:{host:'127.0.0.1',port:4235,strictPort:true}});
   }
   for(const width of [390,1440])for(const count of [1,3]){
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    await context.routeWebSocket('**/*',socket=>socket.close());
    await context.addInitScript(()=>{
     const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),live=new Set();let created=0,revoked=0;
     URL.createObjectURL=file=>{const url=create(file);if(file instanceof File&&file.name.startsWith('qa-')){created++;live.add(url)}return url};
     URL.revokeObjectURL=url=>{if(live.delete(url))revoked++;revoke(url)};
     window.qaPreviews=()=>({created,revoked,live:live.size});
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',route=>{
     const req=route.request(),url=new URL(req.url());assert.equal(req.method(),'GET');assert.equal(url.origin,origin);
     assert.equal(url.pathname.startsWith('/api/'),false,'No auth/API/storage/AI in preview lifetime fixture');return route.continue();
    });
    await page.goto(origin+'/.tmp/autofill-preview-lifetime/index.html');
    const panel=page.locator('section[aria-labelledby="photo-autofill-title"]'),input=panel.locator('input[type=file]');
    await expect(panel).toBeVisible();
    const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=120;return c.toDataURL('image/png').split(',')[1]}),'base64');
    await input.setInputFiles({name:'qa-invalid.txt',mimeType:'text/plain',buffer:Buffer.from('QA')});
    await expect(panel.getByRole('alert')).toHaveText(/Ảnh cần là/);
    const photos=Array.from({length:4},(_,i)=>({name:'qa-'+i+'.png',mimeType:'image/png',buffer:png}));
    await input.setInputFiles(photos);await expect(panel.getByRole('alert')).toHaveText(/Chọn tối đa 3/);
    assert.deepEqual(await page.evaluate(()=>window.qaPreviews()),{created:0,revoked:0,live:0},'Rejected selections allocate no previews');
    await input.setInputFiles(photos.slice(0,count));await expect(panel.getByRole('img')).toHaveCount(count);
    const created=baseline&&mode==='development'?count*2:count;
    await expect.poll(async()=> (await page.evaluate(()=>window.qaPreviews())).created).toBe(created);
    const remove=panel.getByRole('button',{name:'Bỏ ảnh để đọc 1',exact:true});
    if(count===3)await remove.evaluate(button=>{button.click();button.click()});else await remove.click();
    await expect(panel.getByRole('img')).toHaveCount(count-(count===3&&baseline?2:1));
    await page.getByRole('button',{name:'Đóng khung QA',exact:true}).click();await expect(panel).toHaveCount(0);
    const resources=await page.evaluate(()=>window.qaPreviews());
    assert.equal(resources.revoked,count);assert.equal(resources.live,baseline&&mode==='development'?count:0);
    if(!baseline)assert.equal(resources.created===resources.revoked,true,'Every accepted preview is released on remove/unmount');
    assert.deepEqual(errors,[]);checks.push({mode,width,count,resources});await context.close();
   }
  }finally{if(mode==='development')await server?.close();else if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,checks}));
}finally{await browser?.close();}
