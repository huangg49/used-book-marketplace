// Production catalog chips with unknown/prototype URL values. Every HTTP read is synthetic.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../admin-web/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test'),{preview}=await import(pathToFileURL(require.resolve('vite')).href);
const out=path.join(root,'.tmp/member-web-search-condition-label-recovery');await mkdir(out,{recursive:true});
const baseline=process.env.SEARCH_CONDITION_BASELINE==='1',origin='http://127.0.0.1:4256';
const server=await preview({configFile:false,root:path.join(root,'apps/user-web'),build:{outDir:path.resolve(root,process.env.SEARCH_CONDITION_BUILD??'apps/user-web/dist')},preview:{host:'127.0.0.1',port:4256,strictPort:true}});
const labels={LikeNew:'Gần như mới',Good:'Còn tốt',Fair:'Đã dùng nhiều',Worn:'Cũ nhiều'};
const samples=['__proto__','constructor','toString','hasOwnProperty','unknown',...Object.keys(labels)];
const checks=[];let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440])for(const value of samples){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage(),errors=[],queries=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;assert.equal(request.method(),'GET','Catalog fixture performs no commands');
   if(p==='/api/v1/listings'){
    queries.push(new URLSearchParams(url.searchParams));const condition=url.searchParams.get('condition');
    assert.equal(url.searchParams.get('q'),'nhan-qa');assert.equal(url.searchParams.get('mode'),'Sale');assert.equal(url.searchParams.get('sort'),'newest');
    return condition&&!Object.hasOwn(labels,condition)?route.fulfill({status:400,json:{code:'QA_INVALID_CONDITION'}}):route.fulfill({json:{items:[],nextCursor:null,serverTime:new Date().toISOString()}});
   }
   if(p.startsWith('/api/v1/')||p.startsWith('/socket.io/'))return route.fulfill({status:503,json:{code:'QA_UNAVAILABLE'}});
   return url.origin===origin?route.continue():route.abort();
  });
  const params=new URLSearchParams({data:'live',q:'nhan-qa',mode:'Sale',sort:'newest',condition:value});await page.goto(origin+'/books?'+params);
  const crash=baseline&&value==='__proto__',known=Object.hasOwn(labels,value);
  if(crash)await expect(page.getByRole('heading',{name:'Chưa mở được trang',exact:true})).toBeVisible();
  else{
   const region=page.getByRole('region',{name:'Bộ lọc đang áp dụng',exact:true}),chip=region.locator('button[aria-label^="Bỏ lọc "]');
   await expect(chip).toHaveCount(1);
   const text=known?labels[value]:baseline&&['constructor','toString','hasOwnProperty'].includes(value)?'':value;
   await expect(chip.locator('span')).toHaveText(text);
   if(!baseline||known||value==='unknown')await expect(chip).toHaveAttribute('aria-label','Bỏ lọc '+text);
   const failure=page.getByRole('heading',{name:'Chưa tải được kệ sách',exact:true}),empty=page.getByRole('heading',{name:'Chưa có cuốn sách nào phù hợp.',exact:true});
   await expect(known?empty:failure).toBeVisible();if(!known)await expect(empty).toHaveCount(0);
   assert.equal(queries[0].get('condition'),value,'Unsupported values remain subject to server validation');
   if(value==='constructor'){
    await page.waitForFunction(()=>{
     let node=document.querySelector('#catalog-results');
     if(!node)return false;
     while(node){if(Number(getComputedStyle(node).opacity)<0.99)return false;node=node.parentElement;}
     return true;
    });
    await page.screenshot({path:path.join(out,`${baseline?'before':'after'}-${width}.png`)});
   }
   await chip.click();await expect(empty).toBeVisible();await expect(failure).toHaveCount(0);
   await expect(region).toHaveCount(0);const current=new URL(page.url());assert.equal(current.searchParams.has('condition'),false);
   for(const [key,expected]of [['data','live'],['q','nhan-qa'],['mode','Sale'],['sort','newest']])assert.equal(current.searchParams.get(key),expected);
   assert.equal(queries.at(-1).has('condition'),false);
   await page.goBack();await expect(chip).toHaveCount(1);await expect(chip.locator('span')).toHaveText(text);await expect(known?empty:failure).toBeVisible();
   assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  checks.push({width,value,routeUsable:!crash,labelCorrect:!baseline||known||value==='unknown',readOnly:true});await context.close();
 }
 await writeFile(path.join(out,baseline?'before.json':'after.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({baseline,profiles:checks.length,routeCrashes:checks.filter(check=>!check.routeUsable).length,labelsCorrect:checks.every(check=>check.labelCorrect),readOnly:true}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
