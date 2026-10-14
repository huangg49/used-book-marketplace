// Deterministic authored 2D cloth rig. Time is milliseconds; coordinates are 1920×1080.
export const W = 1920, H = 1080, DURATION = 3000, SETTLED = 2480;
export const clamp = x => Math.max(0, Math.min(1, x));
export const ease = x => { const p = clamp(x); return p*p*p*(p*(p*6-15)+10); };
export const mix = (a,b,p) => a+(b-a)*p;
export function rowState(time,v) {
  const start = 120+210*v;
  const opening = ease((time-start)/1340);
  // Recovery begins while the pull decelerates. The top stays near its gather;
  // only the heavier lower cloth carries a visible, delayed inward drift.
  const returned = ease((time-start-1230)/(470+170*v));
  const closed = 972+18*Math.sin(Math.PI*v);
  const settled = 196+26*Math.cos(2*Math.PI*v)-16*Math.sin(Math.PI*v);
  const pulled = settled-12-42*Math.pow(Math.sin(Math.PI*v/2),1.4);
  return { opening, returned, edge: mix(closed,pulled,opening)+(settled-pulled)*returned };
}
export function innerPoint(time,side,u,v,state=rowState(time,v)) {
  const { opening, returned, edge } = state;
  const materialTime=Math.min(time,SETTLED);
  const energy=opening*(1-returned);
  const outer = -32;
  // Redistribution of fold widths, shear and hem lift; not translation of a rigid PNG.
  const clothU = u+.012*energy*Math.sin(Math.PI*u)*Math.sin(6*Math.PI*u+2.5*v+materialTime/950);
  const x = mix(outer,edge,clothU);
  const lift = 80*Math.sin(Math.PI*opening)*u*u*u*Math.pow(v,8);
  const ripple = 5*energy*Math.sin(Math.PI*v)*Math.sin(Math.PI*u)*Math.sin(3*Math.PI*u+materialTime/900);
  const y = -18+1116*v-lift+ripple;
  return [side === 'left' ? x : W-x,y];
}
export function secondary(time) {
  const p = ease((time-140)/1480);
  const s = Math.max(0,(time-1510)/1000);
  const release = 3*Math.exp(-5*s)*Math.sin(9*s)*ease(s/.16);
  return (8*Math.sin(Math.PI*p)+release)*(1-ease((time-2200)/280));
}
export function outerOffset(time,side,v) {
  const energy = secondary(time), sign = side === 'left' ? -1 : 1;
  return [sign*energy*Math.sin(Math.PI*v),energy*.16*Math.sin(Math.PI*v)];
}
export function outerPoint(time,side,u,v) {
  const [dx,dy] = outerOffset(time,side,v);
  const x = (side === 'left' ? -6 : 1736)+190*u+dx*(.7+.3*Math.sin(Math.PI*u));
  const y = -6+1092*v+dy;
  return [x,y];
}
export function fringeAngle(time,side) {
  const s = Math.max(0,(time-1560)/1000);
  const release = 2*Math.exp(-5*s)*Math.sin(10*s)*ease(s/.12);
  const draw = 1.8*Math.sin(Math.PI*ease((time-240)/1380));
  return (side === 'left' ? 1 : -1)*(draw+release)*(1-ease((time-2260)/220));
}
export function spritePose(time,layer) {
  const side=layer.id.includes('left')?'left':'right';
  let x=0,y=0,angle=0;
  if(layer.motionAnchor){
    const [u,v]=layer.motionAnchor.uv;
    const at=outerPoint(time,side,u,v),rest=outerPoint(0,side,u,v);
    x=at[0]-rest[0];y=at[1]-rest[1];
    if(layer.id.startsWith('tassels-'))angle=fringeAngle(time,side);
  }else{
    const support=layer.attachment?.parent||layer.id;
    if(support==='valance-front')y=secondary(time)*.12;
    else if(support.startsWith('valance-rear-'))y=secondary(time)*.06;
    if(layer.attachment)angle=fringeAngle(time,side)*.3;
  }
  return {x,y,angle};
}
export function frameOpacity(time) { return 1-ease((time-2540)/(DURATION-2540)); }
export function phase(time) {
  if(time<120) return 'Rèm đóng';
  if(time<1550) return 'Hé và kéo mở';
  if(time<2200) return 'Gấu rèm theo đà, lắng dần';
  if(time<2540) return 'Đã gom rèm';
  if(time<DURATION) return 'Khung nhường chỗ cho trang';
  return 'Hoàn tất';
}
export function buildMesh(cols,rows,side,kind) {
  const vertices = new Float32Array((cols+1)*(rows+1)*6);
  const indices = new Uint16Array(cols*rows*6);
  let n=0;
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
    const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;
    indices.set([a,b,c,b,d,c],n);n+=6;
  }
  return {cols,rows,side,kind,vertices,indices};
}
export function updateMesh(mesh,time) {
  const {cols,rows,side,kind,vertices} = mesh;
  let k=0;
  for(let y=0;y<=rows;y++) {
   const v=y/rows,state=rowState(time,v);
   for(let x=0;x<=cols;x++) {
    const u=x/cols;
    const point=kind==='inner'?innerPoint(time,side,u,v,state):outerPoint(time,side,u,v);
    vertices[k++]=point[0];vertices[k++]=point[1];
    vertices[k++]=kind==='inner'&&side==='right'?1-u:u;vertices[k++]=v;
    vertices[k++]=ease(state.opening/.09);vertices[k++]=state.edge+32;
   }
  }
  return mesh;
}
