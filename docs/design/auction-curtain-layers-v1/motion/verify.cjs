const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CURTAIN_PLAYWRIGHT_PATH||'playwright');
const sharp=require(process.env.CURTAIN_SHARP_PATH||'sharp');
const folder=path.join(__dirname,'evidence');let browser;
const url='http://127.0.0.1:5191/motion/?autoplay=0';
async function ready(page){await page.waitForFunction(()=>window.curtainPreview?.state.ready);}
async function pixels(a,b){const x=await sharp(a).removeAlpha().raw().toBuffer(),y=await sharp(b).removeAlpha().raw().toBuffer();let n=0;for(let i=0;i<x.length;i+=3)if(x[i]!==y[i]||x[i+1]!==y[i+1]||x[i+2]!==y[i+2])n++;return n;}
(async()=>{
 await fs.mkdir(folder,{recursive:true});browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle'});await ready(page);
 const mode=await page.evaluate(()=>curtainPreview.state.mode);assert.match(mode,/WebGL/);
 const stage=page.locator('#stage');const captures=[];
 for(const time of [0,420,900,1400,1780,2080,2480,3000]){
  await page.evaluate(t=>curtainPreview.seek(t),time);const file=`${String(time).padStart(4,'0')}.png`;await stage.screenshot({path:path.join(folder,file)});captures.push({time,file});
 }
 await page.evaluate(()=>curtainPreview.seek(0));const cream=await stage.screenshot();
 await stage.evaluate(el=>el.style.background='#1266ba');const blue=await stage.screenshot();await stage.evaluate(el=>el.style.background='');
 const closedPixels=pixels(cream,blue);assert.equal(await closedPixels,0,'closed mesh must conceal contrasting backdrop');
 await page.evaluate(()=>curtainPreview.seek(1780));const before=await stage.screenshot();
 await page.evaluate(()=>curtainPreview.seek(2480));
 const stageBounds=await stage.boundingBox();
 await page.screenshot({path:path.join(folder,'attachment-detail.png'),clip:{x:stageBounds.x+stageBounds.width*.19,y:stageBounds.y,width:stageBounds.width*.62,height:stageBounds.height*.17}});
 await page.evaluate(()=>curtainPreview.seek(1780));
 await page.evaluate(()=>curtainPreview.seek(3000));await page.evaluate(()=>curtainPreview.seek(1780));
 assert.equal(await pixels(before,await stage.screenshot()),0,'scrubbing must restore the identical pose');
 await page.locator('#nav').check();await page.locator('#slot').selectOption('45');assert.equal(await page.locator('#navbar').evaluate(el=>getComputedStyle(el).zIndex),'45');
 await page.screenshot({path:path.join(folder,'desktop-controls.png'),fullPage:true});await page.locator('#nav').uncheck();
 await page.locator('#speed').selectOption('0.5');
 // Measure and pause in the same browser task: protocol/click latency is not playback time.
 const slow=await page.evaluate(()=>new Promise(resolve=>{curtainPreview.seek(0);const start=performance.now();curtainPreview.play();setTimeout(()=>{curtainPreview.pause();resolve({time:curtainPreview.state.time,elapsed:performance.now()-start});},300);}));
 const slowTime=slow.time;assert.ok(slowTime>0&&slowTime<=slow.elapsed*.5+20,JSON.stringify(slow));
 await page.waitForTimeout(160);assert.equal(await page.evaluate(()=>curtainPreview.state.time),slowTime,'pause must freeze timeline');
 await page.locator('#speed').selectOption('1');await page.locator('#hold').check();await page.locator('#replay').click();
 await page.waitForFunction(()=>curtainPreview.state.time===2480&&!curtainPreview.state.playing);assert.equal(await page.evaluate(()=>curtainPreview.state.opacity),1);
 await page.locator('#hold').uncheck();await page.locator('#play').click();await page.waitForFunction(()=>curtainPreview.state.time===3000&&!curtainPreview.state.playing);
 assert.equal(await page.locator('#art').evaluate(el=>getComputedStyle(el).visibility),'hidden');
 await page.locator('#seek').focus();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>curtainPreview.state.time),0);
 await page.keyboard.press('End');assert.equal(await page.evaluate(()=>curtainPreview.state.time),3000);
 await page.locator('#replay').click();await page.evaluate(()=>{const el=document.createElement('div');el.id='qa-space';el.style.height='2000px';document.body.appendChild(el);window.scrollTo(0,document.body.scrollHeight);});
 await page.waitForFunction(()=>!curtainPreview.state.playing);await page.evaluate(()=>{document.getElementById('qa-space').remove();window.scrollTo(0,0);});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>curtainPreview.seek(900));
 await page.screenshot({path:path.join(folder,'mobile-controls.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#replay').click();await page.waitForFunction(()=>curtainPreview.state.time===3000&&!curtainPreview.state.playing);
 const reduced=await page.evaluate(()=>({time:curtainPreview.state.time,frames:curtainPreview.state.frames}));assert.ok(reduced.frames>20);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto(url+'&renderer=canvas',{waitUntil:'networkidle'});await ready(page);assert.match(await page.evaluate(()=>curtainPreview.state.mode),/Canvas 2D/);
 for(const time of [0,900,1780,2480]){await page.evaluate(t=>curtainPreview.seek(t),time);await stage.screenshot({path:path.join(folder,`canvas-${time}.png`)});}
 await page.goto(url,{waitUntil:'networkidle'});await ready(page);
 await page.evaluate(()=>{curtainPreview.seek(1780);const c=document.querySelector('canvas');c.getContext('webgl').getExtension('WEBGL_lose_context').loseContext();});
 await page.waitForFunction(()=>curtainPreview.state.mode.includes('Canvas 2D'));assert.equal(await page.evaluate(()=>curtainPreview.state.time),1780);
 assert.deepEqual(errors,[]);
 await page.setViewportSize({width:1280,height:950});await page.goto(url,{waitUntil:'networkidle'});await ready(page);await page.locator('#replay').click();
 await page.waitForFunction(()=>curtainPreview.state.time===3000&&!curtainPreview.state.playing);
 const noVideo=await page.evaluate(()=>curtainPreview.state);
 const intervalSorted=[...noVideo.frameIntervals].sort((a,b)=>a-b),costSorted=[...noVideo.renderCosts].sort((a,b)=>a-b);
 const noVideoTiming={samples:intervalSorted.length,medianFrameIntervalMs:intervalSorted[Math.floor(intervalSorted.length*.5)],p95FrameIntervalMs:intervalSorted[Math.floor(intervalSorted.length*.95)],medianDrawMs:costSorted[Math.floor(costSorted.length*.5)],p95DrawMs:costSorted[Math.floor(costSorted.length*.95)],note:'No video recorder; still headless local Chromium, not physical-device acceptance.'};
 await page.close();
 const context=await browser.newContext({viewport:{width:1280,height:950},recordVideo:{dir:folder,size:{width:1280,height:950}}});
 const videoPage=await context.newPage();await videoPage.goto(url,{waitUntil:'networkidle'});await ready(videoPage);await videoPage.locator('#replay').click();
 await videoPage.waitForFunction(()=>curtainPreview.state.time===3000&&!curtainPreview.state.playing);
 const intervals=await videoPage.evaluate(()=>curtainPreview.state.frameIntervals);const sorted=[...intervals].sort((a,b)=>a-b);
 const timing={samples:intervals.length,medianFrameIntervalMs:sorted[Math.floor(sorted.length*.5)]||null,p95FrameIntervalMs:sorted[Math.floor(sorted.length*.95)]||null,over50Ms:intervals.filter(x=>x>50).length,note:'Headless Chromium local capture; not physical-device FPS acceptance.'};
 const video=videoPage.video();await videoPage.close();await context.close();await video.saveAs(path.join(folder,'opening.webm'));
 const result={scope:'standalone motion preview; application unchanged',renderer:mode,viewports:['1440×1080','390×844','1280×950 video'],durationMs:3000,closedBackdropChangedPixels:await closedPixels,scrubPixelIdentity:'PASS',pauseReplaySpeedHoldKeyboard:'PASS',offscreenPause:'PASS',reducedPreferenceFullSequence:'PASS',canvasFallback:'PASS',contextLossPreservesTime:'PASS',jsErrors:errors,captures,timing,noVideoTiming,physicalMobileSafari:'NOT RUN',applicationIntegration:'NOT RUN'};
 await fs.writeFile(path.join(folder,'checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
