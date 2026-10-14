import { it as test } from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {W,H,DURATION,SETTLED,SIDE_WIDTH,innerPoint,frameOpacity,rowState,buildMesh,updateMesh,spritePose,outerPoint} from './model.mjs';
test('closed cloth covers viewport and starts with overlap, then top opens before hem',()=>{
  for(let v=0;v<=1;v+=.025){assert.ok(innerPoint(0,'left',1,v)[0]>=W/2);assert.ok(innerPoint(0,'right',1,v)[0]<=W/2);}
  assert.ok(rowState(550,0).edge<rowState(550,1).edge-100);
  assert.ok(innerPoint(0,'left',0,0)[1]<0);assert.ok(innerPoint(0,'left',1,1)[1]>H);
});
test('open silhouettes occupy twenty percent less width while retaining mirror symmetry',()=>{
  for(const v of [0,.25,.5,.75,1]){
    const reference=196+26*Math.cos(2*Math.PI*v)-16*Math.sin(Math.PI*v);
    const left=innerPoint(SETTLED,'left',1,v),right=innerPoint(SETTLED,'right',1,v);
    assert.ok(Math.abs(left[0]-reference*SIDE_WIDTH)<1e-6);
    assert.ok(Math.abs(left[0]+right[0]-W)<1e-6);
  }
  const width=outerPoint(SETTLED,'left',1,.5)[0]-outerPoint(SETTLED,'left',0,.5)[0];
  assert.ok(Math.abs(width-152)<1e-6);
});
test('opening overpull returns into a larger settled soft fold, with exact finite ending',()=>{
  for(const v of [0,.25,.5,.75,1])assert.ok(rowState(SETTLED,v).edge>rowState(1450+160*v,v).edge);
  assert.equal(frameOpacity(0),1);assert.equal(frameOpacity(SETTLED),1);assert.equal(frameOpacity(DURATION),0);
  assert.deepEqual(innerPoint(SETTLED,'left',1,.5),innerPoint(DURATION,'left',1,.5));
});
test('no pose switching discontinuity or inverted mesh across the entire authored sequence',()=>{
  const mesh=buildMesh(24,48,'left','inner');let previous;
  for(let t=0;t<=DURATION;t+=10){
    updateMesh(mesh,t);assert.ok(mesh.vertices.every(Number.isFinite));
    for(let row=0;row<=48;row++)for(let col=1;col<=24;col++){
      const k=(row*25+col)*6;assert.ok(mesh.vertices[k]>mesh.vertices[k-6],'fold columns must retain order');
    }
    for(let i=0;i<mesh.indices.length;i+=3){const a=mesh.indices[i]*6,b=mesh.indices[i+1]*6,c=mesh.indices[i+2]*6,v=mesh.vertices;
      const area=(v[b]-v[a])*(v[c+1]-v[a+1])-(v[c]-v[a])*(v[b+1]-v[a+1]);assert.ok(area>0,'mesh triangles must not flip');
    }
    const current=Array.from({length:49},(_,row)=>innerPoint(t,'left',1,row/48));
    if(previous)for(let row=0;row<49;row++)assert.ok(Math.hypot(current[row][0]-previous[row][0],current[row][1]-previous[row][1])<25,'no edge jump between adjacent 10ms samples');
    previous=current;
  }
});
test('phase boundaries preserve geometric continuity',()=>{
  for(const t of [120,1240,1500,1600,1680,2260,2480,2540,3000])for(const v of [0,.5,1]){
    const a=innerPoint(t-.001,'left',1,v),b=innerPoint(t+.001,'left',1,v);
    assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<.01);
  }
});
test('recovery stays local and does not bounce the gathered cloth back and forth',()=>{
  for(const v of [0,.25,.5,.75,1]){
    const edges=Array.from({length:249},(_,i)=>rowState(i*10,v).edge);
    const minimum=Math.min(...edges),final=rowState(SETTLED,v).edge;
    assert.ok(final-minimum<55,'recovery must not push a wide panel back into the page');
    let recovering=false;
    for(let i=1;i<edges.length;i++){
      const delta=edges[i]-edges[i-1];
      if(delta>.001)recovering=true;
      if(recovering)assert.ok(delta>=-.001,'cloth must settle without a second outward bounce');
    }
  }
  assert.ok(rowState(1950,0).returned>rowState(1950,1).returned,'hem follows after gathered top');
});
test('ornaments retain contact with their supporting hem or gather throughout playback',()=>{
  const layers=JSON.parse(readFileSync(new URL('./layers.json',import.meta.url)));
  for(let time=0;time<=DURATION;time+=10)for(const layer of layers){
    const pose=spritePose(time,layer);
    if(layer.attachment){
      const parent=layers.find(p=>p.id===layer.attachment.parent),support=spritePose(time,parent);
      const gap=layer.y+pose.y-(parent.y+support.y+layer.attachment.edgeY-layer.attachment.overlap);
      assert.ok(Math.abs(gap)<1e-9,'attachment must retain its overlap with the parent hem');
      assert.ok(layer.z>parent.z,'hanging ornament must not sit behind its supporting cloth');
    }
    if(layer.motionAnchor){
      const side=layer.id.includes('left')?'left':'right',[u,v]=layer.motionAnchor.uv;
      const at=outerPoint(time,side,u,v),rest=outerPoint(0,side,u,v);
      assert.equal(pose.x,at[0]-rest[0]);assert.equal(pose.y,at[1]-rest[1]);
    }
  }
});
