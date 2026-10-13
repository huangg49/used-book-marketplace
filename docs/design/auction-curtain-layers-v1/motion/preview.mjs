import {W,H,DURATION,SETTLED,frameOpacity,phase,spritePose} from './model.mjs';
import {attachLayers} from '../attachments.mjs';
import {MeshRenderer} from './renderer.mjs';
const $=id=>document.getElementById(id),art=$('art'),stage=$('stage'),status=$('status');
let time=0,playing=false,speed=1,raf=0,last=0,ready=false,disposed=false,visible=true;
let renderers=[],sprites=[],frames=0,lastPhase='',mode='';
const samples=[],renderCosts=[];
function pause(){playing=false;if(raf)cancelAnimationFrame(raf);raf=0;last=0;$('play').textContent='Tiếp tục';stage.dataset.playing='false';}
function play(){if(!ready||disposed||!visible||document.hidden)return;if(time>=DURATION)time=0;playing=true;last=0;$('play').textContent='Tạm dừng';if(!raf)raf=requestAnimationFrame(tick);}
function seek(value){pause();time=Math.max(0,Math.min(DURATION,value));draw();}
function tick(now){
  raf=0;if(!playing||disposed)return;
  const delta=last?Math.max(0,now-last):0;last=now;
  if(delta>0)samples.push(delta);if(samples.length>240)samples.shift();
  const limit=$('hold').checked?SETTLED:DURATION;
  time=Math.min(limit,time+delta*speed);draw();
  if(time>=limit){pause();return;}raf=requestAnimationFrame(tick);
}
function draw(){
  if(!ready||disposed)return;const start=performance.now();frames++;
  for(const renderer of renderers)renderer.draw(time);
  for(const {layer,img} of sprites){
    const {x,y,angle}=spritePose(time,layer);
    img.style.transform=`translate(${x}px,${y}px) rotate(${angle}deg)`;
  }
  art.style.opacity=String(frameOpacity(time));art.style.visibility=time>=DURATION?'hidden':'visible';
  $('seek').value=String(Math.round(time));$('time').textContent=(time/1000).toFixed(2).replace('.',',')+' / 3,00 s';
  const name=phase(time);if(name!==lastPhase){$('phase').textContent=name;lastPhase=name;}
  stage.dataset.time=String(Math.round(time));stage.dataset.phase=name;stage.dataset.playing=String(playing);
  const cost=performance.now()-start;renderCosts.push(cost);if(renderCosts.length>240)renderCosts.shift();stage.dataset.renderMs=cost.toFixed(2);
}
function resize(){
  const width=stage.clientWidth,height=stage.clientHeight;
  art.style.transform=`scale(${width/W},${height/H})`;
  for(const renderer of renderers)renderer.resize(width,height,window.devicePixelRatio||1);
  draw();
}
function nav(){ $('navbar').hidden=!$('nav').checked;$('navbar').style.zIndex=$('slot').value; }
function cleanup(){pause();disposed=true;for(const renderer of renderers)renderer.dispose();resizeObserver.disconnect();intersectionObserver.disconnect();}
const resizeObserver=new ResizeObserver(resize);
const intersectionObserver=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)pause();},{threshold:0});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('pagehide',event=>{if(event.persisted)pause();else cleanup();});
window.addEventListener('pageshow',event=>{if(event.persisted&&!disposed)resize();});
$('replay').onclick=()=>{pause();time=0;draw();play();};$('play').onclick=()=>playing?pause():play();
$('speed').onchange=()=>{speed=Number($('speed').value);last=0;};
$('seek').addEventListener('input',event=>seek(Number(event.target.value)));
$('hold').onchange=()=>{if($('hold').checked&&time>SETTLED)seek(SETTLED);};
for(const button of document.querySelectorAll('[data-time]'))button.onclick=()=>seek(Number(button.dataset.time));
$('nav').onchange=nav;$('slot').onchange=nav;nav();
// Small readonly diagnostics surface for scoped browser verification and deterministic scrubbing.
window.curtainPreview={seek,play,pause,get state(){return {ready,time,playing,mode,frames,frameIntervals:[...samples],renderCosts:[...renderCosts],opacity:frameOpacity(time),phase:phase(time),disposed};}};
async function image(file){const img=new Image();img.src='../'+file;await img.decode();return img;}
async function initialize(){
  const response=await fetch('../manifest.json');if(!response.ok)throw new Error('Không tải được bản đồ lớp.');
  const manifest=attachLayers(await response.json());
  const staticLayers=manifest.layers.filter(l=>l.pose==='both'&&!l.id.startsWith('outer-'));
  const staticImages=await Promise.all(staticLayers.map(l=>image(l.file)));
  const mainImages=await Promise.all(['left','right'].map(side=>image(`assets/inner-closed-${side}.png`)));
  const outerImages=await Promise.all(['left','right'].map(side=>image(`assets/outer-${side}.png`)));
  for(let i=0;i<staticLayers.length;i++){
    const layer=staticLayers[i],img=staticImages[i];img.className='sprite';img.alt='';img.dataset.layer=layer.id;
    Object.assign(img.style,{left:layer.x+'px',top:layer.y+'px',width:layer.width+'px',height:layer.height+'px',zIndex:layer.z,clipPath:layer.clip||'none',transformOrigin:layer.pivot[0]*100+'% '+layer.pivot[1]*100+'%'});
    art.appendChild(img);sprites.push({layer,img});
  }
  const forced=new URLSearchParams(location.search).get('renderer')==='canvas';
  const create=(kind,images,z,force)=>{
    const canvas=document.createElement('canvas');canvas.className='mesh';canvas.style.zIndex=z;canvas.setAttribute('aria-hidden','true');art.appendChild(canvas);
    let renderer;
    try{renderer=new MeshRenderer(canvas,images,kind,force);}catch(error){canvas.remove();throw error;}
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();pause();renderer.dispose();canvas.remove();renderers=renderers.filter(r=>r!==renderer);
      try{const fallback=create(kind,images,z,true);renderers.push(fallback);mode=renderers.map(r=>r.mode).join(' + ');status.textContent='Đã chuyển sang Canvas 2D tại cùng thời điểm.';resize();}
      catch(error){ready=false;status.classList.add('error');status.textContent='Không dựng được chuyển động. Cậu vẫn có thể mở bộ lớp hình.';}
    },{once:true});
    return renderer;
  };
  renderers=[create('inner',mainImages,20,forced),create('outer',outerImages,60,forced)];
  mode=renderers.map(r=>r.mode).join(' + ');
  ready=true;stage.dataset.renderer=mode;status.textContent='Đã sẵn sàng · '+mode+' · chuỗi 3 giây, có thể kéo từng thời điểm.';
  $('replay').disabled=false;$('play').disabled=false;resizeObserver.observe(stage);intersectionObserver.observe(stage);resize();
  if(new URLSearchParams(location.search).get('autoplay')!=='0')play();
}
initialize().catch(error=>{pause();status.classList.add('error');status.textContent='Không tải được bản thử: '+error.message+' Cậu có thể mở bộ lớp hình phía dưới.';art.style.visibility='hidden';for(const renderer of renderers)renderer.dispose();});
