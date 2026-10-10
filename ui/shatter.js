// Text as glass: the glyphs are cut into triangles that assemble, crack under
// the pointer and fly apart. A dependency-free WebGL2 port of the ShatterType
// component (React + three.js); the shell loads nothing from outside ui/.
const FOV=24,SUBSTEP=1/120,COLUMNS=256,MAX_POINTS=3200,HOME=0,FREE=1,WAIT=2;
const DEFAULTS={text:'Shatter',fontFamily:'',fontWeight:700,fontSize:0,letterSpacing:-0.02,lineHeight:1.05,align:'center',colors:['currentColor','currentColor'],accentColor:'currentColor',shardSize:0.09,irregularity:0.6,crack:0.6,crackRadius:0.5,heal:0.9,shatter:true,shatterRadius:0.55,force:1,spin:1,depth:1,gravity:0,reassemble:1.1,stiffness:0.55,glint:0.8,intro:'assemble',introDuration:1.6,interactive:true,quality:1};

const vertexShader=`#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uState;
uniform mat4 uMatrix;
in vec3 position;
in vec3 center;
in vec2 uv;
in vec3 bary;
in float shard;
out vec2 vUv;
out vec3 vBary;
out vec3 vNormal;
out float vCrack;
out float vFlash;
out float vAlpha;
out float vOrigin;
vec4 fetchState(int k){int s=int(shard+0.5);return texelFetch(uState,ivec2((s%${COLUMNS})*3+k,s/${COLUMNS}),0);}
vec3 rotateQ(vec4 q,vec3 v){vec3 t=2.0*cross(q.xyz,v);return v+q.w*t+cross(q.xyz,t);}
void main(){
 vec4 motion=fetchState(0);
 vec4 turn=fetchState(1);
 vec4 extra=fetchState(2);
 vec3 world=center+motion.xyz+rotateQ(turn,position*motion.w);
 vNormal=rotateQ(turn,vec3(0.0,0.0,1.0));
 vUv=uv;vBary=bary;vCrack=extra.x;vFlash=extra.y;vAlpha=extra.z;vOrigin=center.x+position.x;
 gl_Position=uMatrix*vec4(world,1.0);
}`;

const fragmentShader=`#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uAccent;
uniform vec2 uBounds;
uniform float uGlint;
in vec2 vUv;
in vec3 vBary;
in vec3 vNormal;
in float vCrack;
in float vFlash;
in float vAlpha;
in float vOrigin;
out vec4 outColor;
void main(){
 float alpha=texture(uMask,vUv).a*vAlpha;
 if(alpha<0.004)discard;
 vec3 n=normalize(vNormal);
 bool front=gl_FrontFacing;
 vec3 facing=front?n:-n;
 float t=clamp((vOrigin-uBounds.x)/max(1.0,uBounds.y-uBounds.x),0.0,1.0);
 vec3 base=front?mix(uColorA,uColorB,t):uAccent;
 vec3 light=normalize(vec3(-0.45,0.62,0.64));
 float shade=1.0+0.6*(dot(facing,light)-light.z);
 vec3 bounce=reflect(-light,facing);
 float tilt=smoothstep(0.0,0.3,1.0-facing.z);
 float spark=pow(max(bounce.z,0.0),26.0)*tilt*uGlint;
 float edge=min(min(vBary.x,vBary.y),vBary.z);
 float seam=1.0-smoothstep(0.0,fwidth(edge)*1.5,edge);
 vec3 colour=base*clamp(shade,0.35,1.4);
 colour=mix(colour,vec3(1.0),clamp(spark+seam*vCrack*0.3+vFlash*0.5,0.0,1.0));
 outColor=vec4(colour,alpha);
}`;

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const smoothstep=(edge0,edge1,value)=>{const x=clamp((value-edge0)/(edge1-edge0),0,1);return x*x*(3-2*x);};
const wrap=angle=>angle-Math.PI*2*Math.round(angle/(Math.PI*2));
function createRandom(seed){let state=seed>>>0;return()=>{state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

let probe=null;
function readColor(value,fallback){
 if(!value||!CSS.supports('color',value))return fallback;
 if(!probe){const surface=document.createElement('canvas');surface.width=surface.height=1;probe=surface.getContext('2d',{willReadFrequently:true});}
 if(!probe)return fallback;
 probe.clearRect(0,0,1,1);probe.fillStyle='#000';probe.fillStyle=value;probe.fillRect(0,0,1,1);
 const data=probe.getImageData(0,0,1,1).data;return[data[0]/255,data[1]/255,data[2]/255];
}

// Bowyer–Watson over a sweep in x: triangles whose circumcircle lies wholly to the
// left of the next point can never change again and are closed early.
function triangulate(xs,ys,count){
 const order=Array.from({length:count},(_,i)=>i).sort((a,b)=>xs[a]-xs[b]);
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(let i=0;i<count;i++){minX=Math.min(minX,xs[i]);minY=Math.min(minY,ys[i]);maxX=Math.max(maxX,xs[i]);maxY=Math.max(maxY,ys[i]);}
 const span=Math.max(maxX-minX,maxY-minY,1)*20,midX=(minX+maxX)/2,midY=(minY+maxY)/2;
 const px=new Float64Array(count+3),py=new Float64Array(count+3);
 px.set(xs.subarray(0,count));py.set(ys.subarray(0,count));
 px[count]=midX-span;py[count]=midY-span;px[count+1]=midX;py[count+1]=midY+span;px[count+2]=midX+span;py[count+2]=midY-span;
 const circle=(a,b,c)=>{
  const ax=px[a],ay=py[a],bx=px[b],by=py[b],cx=px[c],cy=py[c];
  const d=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
  if(Math.abs(d)<1e-12)return{a,b,c,x:(ax+bx+cx)/3,y:(ay+by+cy)/3,r:Infinity};
  const aa=ax*ax+ay*ay,bb=bx*bx+by*by,cc=cx*cx+cy*cy;
  const x=(aa*(by-cy)+bb*(cy-ay)+cc*(ay-by))/d,y=(aa*(cx-bx)+bb*(ax-cx)+cc*(bx-ax))/d;
  return{a,b,c,x,y,r:(ax-x)*(ax-x)+(ay-y)*(ay-y)};
 };
 let open=[circle(count,count+1,count+2)];
 const closed=[],edges=[];
 for(const i of order){
  const x=px[i],y=py[i],next=[];edges.length=0;
  for(const tri of open){
   const dx=x-tri.x;
   if(dx>0&&dx*dx>tri.r){closed.push(tri);continue;}
   const dy=y-tri.y;
   if(dx*dx+dy*dy<=tri.r)edges.push(tri.a,tri.b,tri.b,tri.c,tri.c,tri.a);else next.push(tri);
  }
  for(let e=0;e<edges.length;e+=2){
   const u=edges[e],v=edges[e+1];if(u<0)continue;
   let shared=false;
   for(let f=e+2;f<edges.length;f+=2)if((edges[f]===u&&edges[f+1]===v)||(edges[f]===v&&edges[f+1]===u)){edges[f]=edges[f+1]=-1;shared=true;}
   if(!shared)next.push(circle(u,v,i));
  }
  open=next;
 }
 const result=[];
 for(const tri of closed.concat(open))if(tri.a<count&&tri.b<count&&tri.c<count)result.push(tri.a,tri.b,tri.c);
 return result;
}

function compile(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'shader');return shader;}

// Returns null when WebGL2 is unavailable; the caller keeps a still fallback.
export function createShatter(root,options={}){
 const s={...DEFAULTS,...options};
 const doc=root.ownerDocument,view=doc.defaultView;
 const canvas=doc.createElement('canvas');
 canvas.setAttribute('aria-hidden','true');
 canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
 const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:true});
 if(!gl)return null;
 let program;
 try{
  program=gl.createProgram();
  gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,vertexShader));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,fragmentShader));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'link');
 }catch{return null;}
 root.insertBefore(canvas,root.firstChild);
 const reduced=()=>view.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const fine=view.matchMedia('(pointer: fine)');
 const now=()=>performance.now()/1000;
 const uniform=name=>gl.getUniformLocation(program,name);
 const u={state:uniform('uState'),matrix:uniform('uMatrix'),mask:uniform('uMask'),colorA:uniform('uColorA'),colorB:uniform('uColorB'),accent:uniform('uAccent'),bounds:uniform('uBounds'),glint:uniform('uGlint')};
 const vao=gl.createVertexArray(),buffers={};
 gl.bindVertexArray(vao);
 for(const [name,size] of [['position',3],['center',3],['uv',2],['bary',3],['shard',1]]){
  const location=gl.getAttribLocation(program,name);if(location<0)continue;
  buffers[name]=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffers[name]);
  gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
 }
 gl.bindVertexArray(null);
 const texture=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
 const maskCanvas=doc.createElement('canvas'),maskTexture=texture();
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 const stateTexture=texture();
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 const matrix=new Float32Array(16),colour={a:[0.09,0.09,0.09],b:[0.09,0.09,0.09],accent:[0.55,0.55,0.55]},bounds=[0,1];
 let stateData=new Float32Array(4),stateColumns=1,stateRows=1;

 let raf=0,last=0,destroyed=false,lost=false,width=0,height=0,em=64,count=0,layoutKey='',colourKey='',introEnd=0;
 let random=createRandom(0x51ed27);
 let hx,hy,ox,oy,oz,vx,vy,vz,rx,ry,rz,wx,wy,wz,scale,scaleV,crack,flash,alpha,tiltX,tiltY,startAt,releaseAt,mode,homing;
 const pointer={x:0,y:0,inside:false,at:0,speed:0};

 function allocate(n){
  [hx,hy,ox,oy,oz,vx,vy,vz,rx,ry,rz,wx,wy,wz,scaleV,crack,flash,tiltX,tiltY]=Array.from({length:19},()=>new Float32Array(n));
  scale=new Float32Array(n).fill(1);alpha=new Float32Array(n).fill(1);
  startAt=new Float64Array(n);releaseAt=new Float64Array(n);mode=new Uint8Array(n);homing=new Uint8Array(n);
  stateRows=Math.max(1,Math.ceil(n/COLUMNS));stateColumns=COLUMNS*3;stateData=new Float32Array(stateColumns*stateRows*4);
  gl.bindTexture(gl.TEXTURE_2D,stateTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,stateColumns,stateRows,0,gl.RGBA,gl.FLOAT,stateData);
 }
 allocate(0);

 function colours(){
  let computed='';
  const pick=value=>{const trimmed=String(value??'').trim();if(trimmed&&trimmed.toLowerCase()!=='currentcolor')return trimmed;if(!computed)computed=view.getComputedStyle(root).color;return computed;};
  const pair=Array.isArray(s.colors)?s.colors:[],a=pick(pair[0]),b=pick(pair[1]??pair[0]),accent=pick(s.accentColor);
  const key=`${a}|${b}|${accent}`;if(key===colourKey)return;colourKey=key;
  colour.a=readColor(a,colour.a);colour.b=readColor(b,colour.b);colour.accent=readColor(accent,colour.accent);
 }

 function scatter(i,style,time){
  const duration=clamp(finite(s.introDuration,1.6),0.2,6),along=width>0?(hx[i]+width/2)/width:0.5;
  mode[i]=WAIT;startAt[i]=time+(along*0.5+random()*0.14)*duration;
  vx[i]=vy[i]=vz[i]=wx[i]=wy[i]=wz[i]=0;homing[i]=style==='drop'?3:2;
  if(style==='drop'){
   ox[i]=(random()-0.5)*em*0.4;oy[i]=height*(0.55+0.45*random())+em;oz[i]=random()*em*0.6;
   rx[i]=(random()-0.5)*1.2;ry[i]=(random()-0.5)*1.2;rz[i]=(random()-0.5)*1.6;alpha[i]=1;return;
  }
  if(style==='fade'){
   ox[i]=oy[i]=0;oz[i]=em*(0.6+random()*0.8);
   rx[i]=(random()-0.5)*0.5;ry[i]=(random()-0.5)*0.5;rz[i]=(random()-0.5)*0.3;alpha[i]=0;return;
  }
  const angle=random()*Math.PI*2,distance=(0.2+0.8*random())*em*1.1;
  ox[i]=Math.cos(angle)*distance;oy[i]=Math.sin(angle)*distance*0.8;oz[i]=em*(0.5+1.7*random());
  rx[i]=(random()-0.5)*Math.PI*2;ry[i]=(random()-0.5)*Math.PI*2;rz[i]=(random()-0.5)*Math.PI*2;alpha[i]=0;
 }

 function assemble(time){
  const style=reduced()?'none':s.intro;
  for(let i=0;i<count;i++){
   if(style==='none'){mode[i]=HOME;ox[i]=oy[i]=oz[i]=rx[i]=ry[i]=rz[i]=0;alpha[i]=1;homing[i]=0;}
   else scatter(i,style,time);
  }
  introEnd=style==='none'?time:time+clamp(finite(s.introDuration,1.6),0.2,6)*1.1;
 }

 function layout(){
  const rect=root.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
  const ratio=Math.min(view.devicePixelRatio||1,2)*clamp(finite(s.quality,1),0.5,1);
  const family=String(s.fontFamily??'').trim()||view.getComputedStyle(root).fontFamily||'sans-serif';
  const key=[w,h,ratio,s.text,family,s.fontWeight,s.fontSize,s.letterSpacing,s.lineHeight,s.align,s.shardSize,s.irregularity].join('|');
  if(key===layoutKey)return false;
  layoutKey=key;width=w;height=h;
  canvas.width=Math.max(1,Math.floor(w*ratio));canvas.height=Math.max(1,Math.floor(h*ratio));
  const distance=h/2/Math.tan(FOV*Math.PI/360),near=1,far=distance*4,f=1/Math.tan(FOV*Math.PI/360),nf=1/(near-far),depthA=(far+near)*nf;
  matrix.fill(0);matrix[0]=f/(w/h);matrix[5]=f;matrix[10]=depthA;matrix[11]=-1;matrix[14]=-distance*depthA+2*far*near*nf;matrix[15]=distance;

  const lines=String(s.text??'').split('\n');
  const weight=clamp(Math.round(finite(Number(s.fontWeight),700)),100,900),spacing=finite(s.letterSpacing,-0.02),leading=clamp(finite(s.lineHeight,1.05),0.6,3);
  maskCanvas.width=Math.max(1,Math.ceil(w*ratio));maskCanvas.height=Math.max(1,Math.ceil(h*ratio));
  const pen=maskCanvas.getContext('2d',{willReadFrequently:true});if(!pen)return false;
  const fontFor=size=>`${weight} ${size}px ${family}`;
  const widest=size=>{pen.font=fontFor(size);pen.letterSpacing=`${spacing*size}px`;let max=0;for(const line of lines)max=Math.max(max,pen.measureText(line).width);return max;};
  let size=finite(s.fontSize,0);
  if(!(size>0)){size=Math.min(h*0.46,420);for(let i=0;i<60;i++){if(widest(size)<=w*0.86&&lines.length*size*leading<=h*0.82)break;size*=0.95;}}
  size=Math.max(6,size);em=size;
  pen.setTransform(1,0,0,1,0,0);pen.clearRect(0,0,maskCanvas.width,maskCanvas.height);pen.setTransform(ratio,0,0,ratio,0,0);
  pen.font=fontFor(size);pen.letterSpacing=`${spacing*size}px`;pen.fillStyle='#ffffff';pen.textBaseline='alphabetic';
  const sample=pen.measureText(lines.find(line=>line.trim())??'M');
  const ascent=sample.actualBoundingBoxAscent||size*0.72,descent=sample.actualBoundingBoxDescent||size*0.2;
  let top=(h-((lines.length-1)*size*leading+ascent+descent))/2+ascent,minX=Infinity,maxX=-Infinity;
  for(const line of lines){
   const lineWidth=pen.measureText(line).width;
   const x=s.align==='left'?w*0.07:s.align==='right'?w*0.93-lineWidth:(w-lineWidth)/2;
   pen.fillText(line,x,top);
   if(line.trim()){minX=Math.min(minX,x);maxX=Math.max(maxX,x+lineWidth);}
   top+=size*leading;
  }
  if(!Number.isFinite(minX)){minX=0;maxX=w;}
  gl.bindTexture(gl.TEXTURE_2D,maskTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,maskCanvas);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  bounds[0]=minX-w/2;bounds[1]=maxX-w/2;

  const pixels=pen.getImageData(0,0,maskCanvas.width,maskCanvas.height).data,stride=maskCanvas.width;
  const covers=(ax,ay,bx,by,cx,cy)=>{
   const x0=Math.floor(Math.min(ax,bx,cx)*ratio),x1=Math.ceil(Math.max(ax,bx,cx)*ratio),y0=Math.floor(Math.min(ay,by,cy)*ratio),y1=Math.ceil(Math.max(ay,by,cy)*ratio);
   const area=(bx-ax)*(cy-ay)-(cx-ax)*(by-ay);if(Math.abs(area)<1e-6)return false;
   const sign=area>0?1:-1,reach=1.2/ratio,l0=Math.hypot(bx-ax,by-ay),l1=Math.hypot(cx-bx,cy-by),l2=Math.hypot(ax-cx,ay-cy);
   for(let y=Math.max(0,y0);y<=Math.min(maskCanvas.height-1,y1);y++){
    const py=(y+0.5)/ratio;
    for(let x=Math.max(0,x0);x<=Math.min(stride-1,x1);x++){
     if(pixels[(y*stride+x)*4+3]<=2)continue;
     const px=(x+0.5)/ratio;
     const e0=((bx-ax)*(py-ay)-(by-ay)*(px-ax))*sign,e1=((cx-bx)*(py-by)-(cy-by)*(px-bx))*sign,e2=((ax-cx)*(py-cy)-(ay-cy)*(px-cx))*sign;
     if(e0>=-reach*l0&&e1>=-reach*l1&&e2>=-reach*l2)return true;
    }
   }
   return false;
  };
  random=createRandom(0x51ed27);
  const step=Math.max(5,clamp(finite(s.shardSize,0.09),0.03,0.4)*size),rough=clamp(finite(s.irregularity,0.6),0,1);
  const cellSize=step/2,gridW=Math.ceil(w/cellSize)+1,gridH=Math.ceil(h/cellSize)+1,occupied=new Uint8Array(gridW*gridH);
  const colStart=Math.max(0,Math.floor((minX-size*0.2)*ratio)),colEnd=Math.min(stride-1,Math.ceil((maxX+size*0.2)*ratio));
  for(let py=0;py<maskCanvas.height;py++){
   const rowOffset=py*stride,gy=Math.floor(py/ratio/cellSize)*gridW;
   for(let px=colStart;px<=colEnd;px++)if(pixels[(rowOffset+px)*4+3]>2)occupied[gy+Math.floor(px/ratio/cellSize)]=1;
  }
  const near3=(x,y)=>{
   const cx=Math.floor(x/cellSize),cy=Math.floor(y/cellSize);
   for(let dy=-3;dy<=3;dy++){const row=cy+dy;if(row<0||row>=gridH)continue;for(let dx=-3;dx<=3;dx++){const column=cx+dx;if(column>=0&&column<gridW&&occupied[row*gridW+column])return true;}}
   return false;
  };
  const xs=new Float64Array(MAX_POINTS),ys=new Float64Array(MAX_POINTS),rowHeight=step*0.866;
  let n=0,row=0;
  for(let y=-step;y<=h+step&&n<MAX_POINTS;y+=rowHeight,row++)
   for(let x=-step+(row%2?step/2:0);x<=w+step&&n<MAX_POINTS;x+=step){
    if(random()<0.2*rough)continue;
    const jx=x+(random()-0.5)*step*0.75*rough,jy=y+(random()-0.5)*step*0.75*rough;
    if(!near3(jx,jy))continue;
    xs[n]=jx;ys[n]=jy;n++;
   }
  const triangles=n>=3?triangulate(xs,ys,n):[],kept=[];
  for(let t=0;t<triangles.length;t+=3){const a=triangles[t],b=triangles[t+1],c=triangles[t+2];if(covers(xs[a],ys[a],xs[b],ys[b],xs[c],ys[c]))kept.push(a,b,c);}
  count=kept.length/3;allocate(count);
  const position=new Float32Array(count*9),center=new Float32Array(count*9),uv=new Float32Array(count*6),bary=new Float32Array(count*9),shard=new Float32Array(count*3);
  for(let i=0;i<count;i++){
   let a=kept[i*3],b=kept[i*3+1];const c=kept[i*3+2];
   if((xs[b]-xs[a])*(ys[a]-ys[c])-(xs[c]-xs[a])*(ys[a]-ys[b])<0)[a,b]=[b,a];
   const cx=(xs[a]+xs[b]+xs[c])/3,cy=(ys[a]+ys[b]+ys[c])/3;
   hx[i]=cx-w/2;hy[i]=h/2-cy;
   const tilt=random()*Math.PI*2;tiltX[i]=Math.cos(tilt);tiltY[i]=Math.sin(tilt);
   [a,b,c].forEach((vertex,k)=>{
    const o=i*9+k*3;
    position[o]=xs[vertex]-cx;position[o+1]=cy-ys[vertex];
    center[o]=hx[i];center[o+1]=hy[i];bary[o+k]=1;
    uv[i*6+k*2]=xs[vertex]/w;uv[i*6+k*2+1]=1-ys[vertex]/h;shard[i*3+k]=i;
   });
  }
  for(const [name,data] of [['position',position],['center',center],['uv',uv],['bary',bary],['shard',shard]])if(buffers[name]){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[name]);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);}
  if(now()<introEnd)assemble(now());
  return true;
 }

 function shatterAt(x,y,time){
  if(!count||reduced())return;
  const wxp=x-width/2,wyp=height/2-y;
  const reach=clamp(finite(s.shatterRadius,0.55),0.1,6)*em,force=clamp(finite(s.force,1),0,4),spin=clamp(finite(s.spin,1),0,4),depth=clamp(finite(s.depth,1),0,4),hold=clamp(finite(s.reassemble,1.1),0.1,10);
  let hit=false;
  for(let i=0;i<count;i++){
   const dx=hx[i]-wxp,dy=hy[i]-wyp,d=Math.hypot(dx,dy);
   if(d>reach*1.6)continue;
   const fall=1-smoothstep(reach*0.6,reach*1.3,d);
   if(fall<0.3||mode[i]===WAIT||mode[i]===FREE){crack[i]=Math.max(crack[i],0.7*(1-smoothstep(reach,reach*1.6,d)));continue;}
   hit=true;
   const ux=d>1e-3?dx/d:random()-0.5,uy=d>1e-3?dy/d:random()-0.5,scaleSpeed=Math.sqrt(em/160),speed=force*(170+380*random())*fall*scaleSpeed;
   mode[i]=FREE;homing[i]=1;
   releaseAt[i]=time+0.04+(d/reach)*0.09;startAt[i]=releaseAt[i]+hold*(0.85+0.3*random())+(d/reach)*0.16;
   vx[i]=ux*speed+(random()-0.5)*70*force*scaleSpeed;vy[i]=uy*speed+(random()-0.5)*70*force*scaleSpeed;vz[i]=depth*(320+760*random())*fall*scaleSpeed;
   wx[i]=(random()-0.5)*2*spin*(3+6*random())*fall;wy[i]=(random()-0.5)*2*spin*(3+6*random())*fall;wz[i]=(random()-0.5)*2*spin*(1.5+3.5*random())*fall;
   crack[i]=0.55;
  }
  if(hit)schedule();
 }

 function integrate(h,time){
  const stiff=5+9*clamp(finite(s.stiffness,0.55),0,1),introStiff=7.5/Math.max(0.15,clamp(finite(s.introDuration,1.6),0.2,6)*0.55);
  const gravity=clamp(finite(s.gravity,0),0,4)*1500,air=Math.exp(-h*2.6),twist=Math.exp(-h*0.7),healRate=1/Math.max(0.05,finite(s.heal,0.9));
  const crackAmount=clamp(finite(s.crack,0.6),0,1),crackReach=clamp(finite(s.crackRadius,0.5),0.05,4)*em;
  const stroke=Math.exp(-Math.max(0,time-pointer.at)/0.08)*smoothstep(40,900,pointer.speed);
  const pointerActive=pointer.inside&&s.interactive&&crackAmount>0&&stroke>0.01&&!reduced();
  const px=pointer.x-width/2,py=height/2-pointer.y;
  let energy=0;
  for(let i=0;i<count;i++){
   if(mode[i]===WAIT){if(time<startAt[i])continue;mode[i]=HOME;}
   if(mode[i]===FREE){
    if(time>=startAt[i]){mode[i]=HOME;rx[i]=wrap(rx[i]);ry[i]=wrap(ry[i]);rz[i]=wrap(rz[i]);vx[i]*=0.25;vy[i]*=0.25;vz[i]*=0.25;}
    else{
     if(time>=releaseAt[i]){
      vy[i]-=gravity*h;vx[i]*=air;vy[i]*=air;vz[i]*=air;wx[i]*=twist;wy[i]*=twist;wz[i]*=twist;
      ox[i]+=vx[i]*h;oy[i]+=vy[i]*h;oz[i]+=vz[i]*h;rx[i]+=wx[i]*h;ry[i]+=wy[i]*h;rz[i]+=wz[i]*h;
     }
     energy+=1;continue;
    }
   }
   if(pointerActive){const d=Math.hypot(hx[i]-px,hy[i]-py);if(d<crackReach){const push=crackAmount*stroke*Math.pow(1-d/crackReach,1.5);if(push>crack[i])crack[i]=push;}}
   const omega=homing[i]===2?introStiff:homing[i]===3?introStiff*1.25:homing[i]?stiff:18;
   const zeta=homing[i]===2?1:homing[i]===3?0.5:homing[i]?0.68:0.9;
   const k=omega*omega,c=2*zeta*omega,targetRx=tiltY[i]*crack[i]*0.14,targetRy=-tiltX[i]*crack[i]*0.14;
   vx[i]+=(-k*ox[i]-c*vx[i])*h;vy[i]+=(-k*oy[i]-c*vy[i])*h;vz[i]+=(-k*oz[i]-c*vz[i])*h;
   ox[i]+=vx[i]*h;oy[i]+=vy[i]*h;oz[i]+=vz[i]*h;
   wx[i]+=(-k*(rx[i]-targetRx)-c*wx[i])*h;wy[i]+=(-k*(ry[i]-targetRy)-c*wy[i])*h;wz[i]+=(-k*rz[i]-c*wz[i])*h;
   rx[i]+=wx[i]*h;ry[i]+=wy[i]*h;rz[i]+=wz[i]*h;
   const targetScale=1-0.025*crack[i];
   scaleV[i]+=(-324*(scale[i]-targetScale)-30*scaleV[i])*h;scale[i]+=scaleV[i]*h;
   if(alpha[i]<1)alpha[i]=Math.min(1,alpha[i]+h*4.5);
   if(homing[i]&&Math.abs(ox[i])+Math.abs(oy[i])+Math.abs(oz[i])<1.5&&Math.abs(rx[i])+Math.abs(ry[i])+Math.abs(rz[i])<0.06){homing[i]=0;flash[i]=Math.max(flash[i],0.9);}
   crack[i]*=Math.exp(-h*healRate);if(crack[i]<0.015)crack[i]=0;
   flash[i]*=Math.exp(-h/0.16);if(flash[i]<0.01)flash[i]=0;
   const settled=Math.abs(ox[i])+Math.abs(oy[i])+Math.abs(oz[i])<0.3&&Math.abs(vx[i])+Math.abs(vy[i])+Math.abs(vz[i])<3&&
    Math.abs(rx[i]-targetRx)+Math.abs(ry[i]-targetRy)+Math.abs(rz[i])<0.004&&Math.abs(wx[i])+Math.abs(wy[i])+Math.abs(wz[i])<0.06&&
    Math.abs(scale[i]-targetScale)<0.0008&&Math.abs(scaleV[i])<0.02;
   if(settled){
    ox[i]=oy[i]=oz[i]=vx[i]=vy[i]=vz[i]=rz[i]=wx[i]=wy[i]=wz[i]=scaleV[i]=0;rx[i]=targetRx;ry[i]=targetRy;scale[i]=targetScale;
    if(homing[i]){homing[i]=0;flash[i]=Math.max(flash[i],0.9);}
   }
   const motion=(settled?0:1)+crack[i]+flash[i]+(1-alpha[i]);
   if(motion>0.004)energy+=motion;
  }
  return energy;
 }

 function upload(){
  const crackShown=clamp(finite(s.crack,0.6),0,1),glintShown=clamp(finite(s.glint,0.8),0,2);
  for(let i=0;i<count;i++){
   const o=(Math.floor(i/COLUMNS)*COLUMNS*3+(i%COLUMNS)*3)*4;
   stateData[o]=ox[i];stateData[o+1]=oy[i];stateData[o+2]=oz[i];stateData[o+3]=scale[i];
   const c1=Math.cos(rx[i]/2),s1=Math.sin(rx[i]/2),c2=Math.cos(ry[i]/2),s2=Math.sin(ry[i]/2),c3=Math.cos(rz[i]/2),s3=Math.sin(rz[i]/2);
   stateData[o+4]=s1*c2*c3+c1*s2*s3;stateData[o+5]=c1*s2*c3-s1*c2*s3;stateData[o+6]=c1*c2*s3+s1*s2*c3;stateData[o+7]=c1*c2*c3-s1*s2*s3;
   stateData[o+8]=crack[i]*crackShown;stateData[o+9]=flash[i]*glintShown;stateData[o+10]=alpha[i];stateData[o+11]=0;
  }
  gl.bindTexture(gl.TEXTURE_2D,stateTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,stateColumns,stateRows,gl.RGBA,gl.FLOAT,stateData);
 }

 function render(){
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  if(!count)return;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,stateTexture);gl.uniform1i(u.state,0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,maskTexture);gl.uniform1i(u.mask,1);
  gl.uniformMatrix4fv(u.matrix,false,matrix);
  gl.uniform3fv(u.colorA,colour.a);gl.uniform3fv(u.colorB,colour.b);gl.uniform3fv(u.accent,colour.accent);
  gl.uniform2f(u.bounds,bounds[0],bounds[1]);gl.uniform1f(u.glint,clamp(finite(s.glint,0.8),0,2));
  gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLES,0,count*3);gl.bindVertexArray(null);
 }

 function schedule(){if(!destroyed&&!lost&&!raf)raf=view.requestAnimationFrame(frame);}
 function frame(stamp){
  raf=0;if(destroyed||lost)return;
  const dt=last?clamp((stamp-last)/1000,0,1/20):1/60;last=stamp;
  const time=now();let energy=0,remaining=dt,clock=time-dt;
  while(remaining>1e-6){const h=Math.min(SUBSTEP,remaining);remaining-=h;clock+=h;energy=integrate(h,clock);}
  upload();render();
  let pending=false;for(let i=0;i<count&&!pending;i++)if(mode[i]===WAIT)pending=true;
  if(energy>0.004||pending||(pointer.inside&&time-pointer.at<0.2))schedule();else last=0;
 }

 const locate=(clientX,clientY)=>{const rect=root.getBoundingClientRect();pointer.x=clientX-rect.left;pointer.y=clientY-rect.top;};
 const onMove=event=>{
  if(event.pointerType==='touch'||!s.interactive||!fine.matches)return;
  const previousX=pointer.x,previousY=pointer.y,time=now(),gap=Math.max(0.008,time-pointer.at);
  locate(event.clientX,event.clientY);
  const instant=pointer.inside?Math.hypot(pointer.x-previousX,pointer.y-previousY)/gap:0;
  pointer.speed+=(Math.min(instant,4000)-pointer.speed)*Math.min(1,gap/0.05);
  pointer.inside=true;pointer.at=time;schedule();
 };
 const onLeave=event=>{if(event.pointerType!=='touch'){pointer.inside=false;schedule();}};
 const onDown=event=>{if(!s.interactive||!s.shatter||event.button!==0)return;locate(event.clientX,event.clientY);shatterAt(pointer.x,pointer.y,now());};
 const onLost=event=>{event.preventDefault();lost=true;if(raf)view.cancelAnimationFrame(raf);raf=0;};
 const refresh=()=>{colours();layout();schedule();};
 const resizer=new ResizeObserver(refresh);resizer.observe(root);
 root.addEventListener('pointermove',onMove,{passive:true});root.addEventListener('pointerleave',onLeave);root.addEventListener('pointerdown',onDown,{passive:true});
 canvas.addEventListener('webglcontextlost',onLost);
 colours();layout();assemble(now());schedule();

 return {
  get em(){return em;},
  set(next){Object.assign(s,next);refresh();},
  shatter(x,y){if(!count)return;if(!Number.isFinite(x)||!Number.isFinite(y)){x=width/2;y=height/2;}shatterAt(x,y,now());},
  assemble(){assemble(now());schedule();},
  destroy(){
   if(destroyed)return;destroyed=true;if(raf)view.cancelAnimationFrame(raf);
   resizer.disconnect();root.removeEventListener('pointermove',onMove);root.removeEventListener('pointerleave',onLeave);root.removeEventListener('pointerdown',onDown);canvas.removeEventListener('webglcontextlost',onLost);
   for(const buffer of Object.values(buffers))gl.deleteBuffer(buffer);
   gl.deleteVertexArray(vao);gl.deleteTexture(maskTexture);gl.deleteTexture(stateTexture);gl.deleteProgram(program);
   gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.remove();
  },
 };
}
