import {W,H,buildMesh,updateMesh,rowState,ease,innerPoint} from './model.mjs';
function shader(gl,type,source) {
  const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
export class MeshRenderer {
  constructor(canvas,images,kind,forceCanvas=false) {
    this.canvas=canvas;this.kind=kind;this.disposed=false;
    const gl=!forceCanvas&&canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:false,powerPreference:'default'});
    this.gl=gl||null;this.mode=gl?'WebGL':'Canvas 2D';
    this.meshes=['left','right'].map((side,i)=>Object.assign(buildMesh(gl?24:12,gl?48:28,side,kind),{image:images[i]}));
    if(!gl) {
      this.ctx=canvas.getContext('2d');
      if(!this.ctx) throw new Error('Không có Canvas renderer.');
      return;
    }
    const vs=shader(gl,gl.VERTEX_SHADER,'attribute vec2 position; attribute vec2 uv; attribute vec2 edging; varying vec2 tex; varying vec2 trim; void main(){tex=uv;trim=edging;gl_Position=vec4(position.x/960.0-1.0,1.0-position.y/540.0,0.0,1.0);}');
    const fs=shader(gl,gl.FRAGMENT_SHADER,'precision mediump float; uniform sampler2D picture; uniform float opaqueCloth; uniform float rightPanel; varying vec2 tex; varying vec2 trim; void main(){vec4 c=texture2D(picture,tex);vec3 wine=vec3(0.360784,0.007843,0.007843);if(opaqueCloth>0.5){float distanceToEdge=(rightPanel>0.5?tex.x:1.0-tex.x)*trim.y;float gold=(1.0-smoothstep(2.8,4.5,distanceToEdge))*trim.x;gl_FragColor=vec4(mix(mix(wine,c.rgb,c.a),vec3(0.956863,0.796078,0.403922),gold),1.0);}else{gl_FragColor=c;}}');
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);this.position=gl.getAttribLocation(this.program,'position');this.uv=gl.getAttribLocation(this.program,'uv');this.edging=gl.getAttribLocation(this.program,'edging');this.side=gl.getUniformLocation(this.program,'rightPanel');
    gl.uniform1i(gl.getUniformLocation(this.program,'picture'),0);gl.uniform1f(gl.getUniformLocation(this.program,'opaqueCloth'),kind==='inner'?1:0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
    for(const mesh of this.meshes) {
      mesh.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices.byteLength,gl.DYNAMIC_DRAW);
      mesh.indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
      mesh.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
      // UV v=0 is the first uploaded image row, matching our top-down geometry.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,mesh.image);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    }
  }
  resize(width,height,dpr) {
    const ratio=Math.min(dpr,1.5,1500/Math.max(width,1));
    this.canvas.width=Math.max(1,Math.round(width*ratio));this.canvas.height=Math.max(1,Math.round(height*ratio));
    if(this.gl)this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
  }
  draw(time) {
    if(this.disposed)return;
    if(this.gl){this.drawGL(time);return;}
    const ctx=this.ctx;ctx.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0);ctx.clearRect(0,0,W,H);
    for(const mesh of this.meshes) {
      updateMesh(mesh,time);
      if(this.kind==='inner') {
        ctx.beginPath();const v=mesh.vertices,stride=(mesh.cols+1)*6;
        ctx.moveTo(v[0],v[1]);
        for(let x=1;x<=mesh.cols;x++)ctx.lineTo(v[x*6],v[x*6+1]);
        for(let y=1;y<=mesh.rows;y++)ctx.lineTo(v[y*stride+mesh.cols*6],v[y*stride+mesh.cols*6+1]);
        for(let x=mesh.cols-1;x>=0;x--)ctx.lineTo(v[mesh.rows*stride+x*6],v[mesh.rows*stride+x*6+1]);
        for(let y=mesh.rows-1;y>=0;y--)ctx.lineTo(v[y*stride],v[y*stride+1]);
        ctx.closePath();ctx.fillStyle='#5c0202';ctx.fill();
      }
      for(let i=0;i<mesh.indices.length;i+=3)this.triangle(ctx,mesh,mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]);
      if(this.kind==='inner') {
        ctx.strokeStyle='#f4cb67';ctx.lineJoin='round';
        for(let row=1;row<=64;row++){
          const opacity=ease(rowState(time,(row-.5)/64).opening/.09);
          if(!opacity)continue;
          const a=innerPoint(time,mesh.side,1,(row-1)/64),b=innerPoint(time,mesh.side,1,row/64);
          ctx.globalAlpha=opacity;ctx.lineWidth=4.5;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
        }
        ctx.globalAlpha=1;
      }
    }
  }
  drawGL(time) {
    const gl=this.gl;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);
    for(const mesh of this.meshes){
      updateMesh(mesh,time);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,mesh.vertices);
      gl.enableVertexAttribArray(this.position);gl.vertexAttribPointer(this.position,2,gl.FLOAT,false,24,0);
      gl.enableVertexAttribArray(this.uv);gl.vertexAttribPointer(this.uv,2,gl.FLOAT,false,24,8);
      gl.enableVertexAttribArray(this.edging);gl.vertexAttribPointer(this.edging,2,gl.FLOAT,false,24,16);
      gl.uniform1f(this.side,mesh.side==='right'?1:0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.indexBuffer);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
      gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);
    }
  }
  triangle(ctx,mesh,ia,ib,ic) {
    const v=mesh.vertices,img=mesh.image;
    const [ax,ay,au,av]=v.subarray(ia*6,ia*6+4),[bx,by,bu,bv]=v.subarray(ib*6,ib*6+4),[cx,cy,cu,cv]=v.subarray(ic*6,ic*6+4);
    const sx=au*img.width,sy=av*img.height,tx=bu*img.width,ty=bv*img.height,ux=cu*img.width,uy=cv*img.height;
    const det=(tx-sx)*(uy-sy)-(ux-sx)*(ty-sy);
    if(Math.abs(det)<1e-5)return;
    const a=((bx-ax)*(uy-sy)-(cx-ax)*(ty-sy))/det,b=((by-ay)*(uy-sy)-(cy-ay)*(ty-sy))/det;
    const c=((cx-ax)*(tx-sx)-(bx-ax)*(ux-sx))/det,d=((cy-ay)*(tx-sx)-(by-ay)*(ux-sx))/det;
    const midX=(ax+bx+cx)/3,midY=(ay+by+cy)/3,overlap=.65*W/this.canvas.width;
    const expand=(x,y)=>{const distance=Math.hypot(x-midX,y-midY)||1;return [x+(x-midX)*overlap/distance,y+(y-midY)*overlap/distance];};
    ctx.save();ctx.beginPath();ctx.moveTo(...expand(ax,ay));ctx.lineTo(...expand(bx,by));ctx.lineTo(...expand(cx,cy));ctx.closePath();ctx.clip();
    ctx.transform(a,b,c,d,ax-a*sx-c*sy,ay-b*sx-d*sy);ctx.drawImage(img,0,0);ctx.restore();
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    if(this.gl){for(const mesh of this.meshes){this.gl.deleteBuffer(mesh.buffer);this.gl.deleteBuffer(mesh.indexBuffer);this.gl.deleteTexture(mesh.texture);}this.gl.deleteProgram(this.program);}
  }
}
