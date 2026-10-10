// The start page's featured shelf: game cases on a rail, after React Bits' Album Rail, with the
// vinyl record swapped for a game disc. Opening a game starts it at once in a new tab, through the
// same chain check as every other entry point.
const $=id=>document.getElementById(id);
const TAU=Math.PI*2,TICKS=29,TICK_GAP=18,NEEDLE_CLEAR=27,LIMIT=7;
const SPREAD=.58,STACK=.5,FAN=6*Math.PI/180,TURN=22*Math.PI/180,DEPTH=.5,REACH=3,DIM=.45,INTERVAL=5;

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const smooth=(edge0,edge1,value)=>{const t=clamp((value-edge0)/(edge1-edge0),0,1);return t*t*(3-2*t);};
function springTo(x,v,target,dt,response,ratio){
 const omega=TAU/Math.max(response,.02),steps=Math.max(1,Math.ceil(dt*240)),h=dt/steps;
 for(let i=0;i<steps;i++){v+=(omega*omega*(target-x)-2*ratio*omega*v)*h;x+=v*h;}
 return [x,v];
}

const rail=$('rail'),stage=$('rail-stage'),ruler=$('rail-ruler'),caption=$('rail-caption'),title=$('rail-title'),summary=$('rail-summary');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const cases=[...stage.querySelectorAll('.disc-case')];
const ticks=Array.from({length:TICKS},()=>{const node=document.createElement('span');ruler.append(node);return {node,x:NaN,on:false};});
const geo={size:240,step:140,perspective:800};
const hoverMix=new Map();

let sized=false,pos=0,posV=0,target=0,open=0,openV=0,peek=0,peekV=0,owner=0;
let raf=0,timer=0,last=0,visible=true,current=-1,shown=NaN,captionX=NaN,captionOpacity=-1,rulerPos=NaN;
let inside=false,pointerX=0,pointerY=0,hovered=null,overFocus=false,press=null,scrub=null,consumed=false;
let wheeling=false,wheelAt=0,holdUntil=0,nextStepAt=0;

const count=()=>Math.max(cases.length,1);
const wrap=index=>((index%count())+count())%count();
const clock=()=>performance.now()/1000;
const reach=()=>Math.min(REACH,Math.max(1,Math.floor((count()-1)/2)));
const field=(node,name)=>node?.querySelector(`[data-field=${name}]`)?.textContent||'';

function measure(){
 const width=stage.clientWidth,height=stage.clientHeight;
 if(width<2||height<2){sized=false;return false;}
 sized=true;
 geo.size=Math.min(height*.84,width*(.46+.3*smooth(900,360,width)));
 geo.step=geo.size*SPREAD;
 geo.perspective=Math.max(geo.size*3.1,600);
 stage.style.setProperty('--case',`${geo.size.toFixed(1)}px`);
 return true;
}

// Where a case sits d places from the centre: packed towards the edges, turned towards the middle.
function place(d,openness){
 const a=Math.abs(d)*openness,sign=Math.sign(d),pack=1-.85*STACK;
 const along=pack*a+(1-pack)*Math.tanh(1.5*a)/Math.tanh(1.5);
 const soft=Math.sqrt(a*a+.09)-.3;
 const passing=a<1?Math.sin(Math.PI*a)**2:0;
 const middle=pack*.5+(1-pack)*Math.tanh(.75)/Math.tanh(1.5);
 const clearance=Math.max(0,geo.size*.52-geo.step*middle);
 return {
  x:sign*(geo.step*along+clearance*passing),
  y:geo.size*.035*along*along,
  z:-geo.size*(.24+.46*DEPTH)*soft,
  rz:sign*FAN*along,
  ry:Math.tanh(1.4*d*openness)*TURN,
  scale:1-(.04+.12*DEPTH)*Math.tanh(soft*1.2),
 };
}

function schedule(){
 if(!visible||raf)return;
 if(timer){clearTimeout(timer);timer=0;}
 raf=requestAnimationFrame(frame);
}
function hold(seconds=2.6){const at=clock();holdUntil=Math.max(holdUntil,at+seconds);nextStepAt=Math.max(nextStepAt,at+Math.max(INTERVAL,seconds));}
function goTo(index){
 const n=count(),base=Math.round(target);
 target=base+((((index-wrap(base))%n)+n+Math.floor(n/2))%n)-Math.floor(n/2);
 hold();schedule();
}
function step(direction){target=Math.round(target)+direction;hold();schedule();}

/** Opens the game in a new tab. */
function launch(index){
 const node=cases[index];if(!node)return;
 if(wrap(Math.round(target))!==index)goTo(index);
 hold();
 document.dispatchEvent(new CustomEvent('fab:open',{detail:node.dataset.container}));
}

function frame(time){
 raf=0;
 if(!visible||(!sized&&!measure()))return;
 const dt=last&&time-last<100?clamp((time-last)/1000,0,.05):1/60;last=time;
 const now=clock(),reduced=motion.matches;
 let busy=false;

 if(open<1){
  [open,openV]=springTo(open,openV,1,dt,reduced?.05:1.5,.92);
  if(Math.abs(1-open)<1e-4&&Math.abs(openV)<1e-4){open=1;openV=0;}else busy=true;
 }

 const touching=!!press||!!scrub||inside;
 if(!reduced&&count()>1){
  if(touching||now<holdUntil||!nextStepAt)nextStepAt=Math.max(nextStepAt,now+INTERVAL*(touching?.6:1));
  else if(now>=nextStepAt){nextStepAt=now+INTERVAL;target=Math.round(target)+1;}
 }else nextStepAt=0;

 if(wheeling&&now-wheelAt>.14){wheeling=false;target=Math.round(target);}
 const dragging=!!press?.moved||!!scrub?.moved;
 if(dragging)busy=true;
 else{
  [pos,posV]=springTo(pos,posV,target,dt,reduced?.06:wheeling?.6:.85,.88);
  if(Math.abs(pos-target)<1e-4&&Math.abs(posV)<1e-4){pos=target;posV=0;}else busy=true;
 }

 const focus=Math.round(target),settled=Math.abs(pos-Math.round(pos))<.04&&!dragging;
 if(owner!==focus&&peek<.01){owner=focus;peek=peekV=0;}
 const owned=owner===focus;
 const peekTarget=owned&&overFocus&&settled?1:0;
 [peek,peekV]=springTo(peek,peekV,peekTarget,dt,reduced?.05:dragging?.14:.42,dragging?1:.95);
 if(Math.abs(peek-peekTarget)>1e-4||Math.abs(peekV)>1e-4)busy=true;else{peek=peekTarget;peekV=0;}

 if(inside&&!press)refreshHover();
 const active=wrap(Math.round(pos));
 if(active!==current){
  const hadFocus=cases.includes(document.activeElement);
  current=active;
  cases.forEach((node,index)=>{const on=index===active;node.classList.toggle('current',on);node.tabIndex=on?0:-1;if(on)node.setAttribute('aria-current','true');else node.removeAttribute('aria-current');});
  if(hadFocus)cases[active].focus({preventScroll:true});
 }

 // Cases nearest the centre claim their slot first, so a short shelf never shows one game twice.
 const side=reach(),centre=Math.round(pos),discR=geo.size*.465;
 const travel=discR*2*.15*peek;
 const slots=[];for(let offset=-side-1;offset<=side+1;offset++)slots.push(centre+offset);
 slots.sort((a,b)=>Math.abs(a-pos)-Math.abs(b-pos));
 const used=new Set();
 for(const index of slots){
  const d=index-pos,k=wrap(index);
  if(Math.abs(d)>side+.6||used.has(k))continue;
  used.add(k);
  const node=cases[k],spot=place(d,open);
  const vanish=smooth(side-.4,side+.55,Math.abs(d)),reveal=smooth(0,.5,open*(1.4-Math.abs(d)*.18));
  let hover=hoverMix.get(k)??0;const hoverTarget=hovered===k?1:0;
  hover+=(hoverTarget-hover)*(1-Math.exp(-dt/.16));
  if(Math.abs(hover-hoverTarget)>1e-3)busy=true;else hover=hoverTarget;
  hoverMix.set(k,hover);
  const dim=Math.max(vanish,DIM*smooth(.35,3.2,Math.abs(d))*(1-.6*hover),1-reveal);
  node.classList.toggle('on',dim<.999);
  node.style.zIndex=String(Math.round(1000-Math.abs(d)*100));
  node.style.transform=`perspective(${geo.perspective.toFixed(0)}px) translate3d(${spot.x.toFixed(2)}px,${spot.y.toFixed(2)}px,${spot.z.toFixed(2)}px) rotateY(${spot.ry.toFixed(4)}rad) rotateZ(${spot.rz.toFixed(4)}rad) scale(${spot.scale.toFixed(4)})`;
  node.style.setProperty('--dim',dim.toFixed(3));
  const holdsDisc=index===owner&&travel>.5;
  node.classList.toggle('disc-out',holdsDisc);
  if(holdsDisc)node.style.setProperty('--travel',`${travel.toFixed(2)}px`);
 }
 cases.forEach((node,k)=>{if(!used.has(k))node.classList.remove('on','disc-out');});

 paintOverlay(reduced);
 if(busy||press||scrub)schedule();
 else if(!reduced&&!touching&&count()>1){
  timer=setTimeout(()=>{timer=0;last=0;schedule();},Math.max(Math.max(nextStepAt,holdUntil)-now,.02)*1000+16);
 }
}

function paintOverlay(reduced){
 const nearest=Math.round(pos);
 if(nearest!==shown){
  shown=nearest;
  const node=cases[wrap(nearest)];
  title.textContent=field(node,'name');summary.textContent=field(node,'summary');summary.hidden=!summary.textContent;
 }
 const frac=pos-nearest,speed=Math.abs(press?.moved||scrub?.moved?0:posV);
 const opacity=(1-smooth(.08,.42,Math.abs(frac)))*(1-smooth(2.5,7,speed))*(reduced?1:smooth(.35,.9,open));
 const x=reduced?0:-frac*46;
 if(Number.isNaN(captionX)||Math.abs(x-captionX)>.02){captionX=x;caption.style.transform=`translate3d(${x.toFixed(2)}px,0,0)`;}
 if(Math.abs(opacity-captionOpacity)>.002){captionOpacity=opacity;caption.style.opacity=opacity.toFixed(3);}

 const width=ruler.clientWidth;
 if(width>0&&pos!==rulerPos){
  rulerPos=pos;
  const middle=width/2,base=Math.round(pos),half=Math.floor(TICKS/2);
  ticks.forEach((tick,k)=>{
   const x=middle+(base-half+k-pos)*TICK_GAP,on=x>0&&x<width&&Math.abs(x-middle)>NEEDLE_CLEAR;
   if(on!==tick.on){tick.on=on;tick.node.style.opacity=on?'.34':'0';}
   if(on&&(Number.isNaN(tick.x)||Math.abs(x-tick.x)>.01)){tick.x=x;tick.node.style.transform=`translate3d(${(x-.5).toFixed(2)}px,0,0)`;}
  });
 }
}

function refreshHover(){
 const node=document.elementFromPoint(pointerX,pointerY)?.closest('.disc-case.on'),k=cases.indexOf(node),focus=wrap(Math.round(target));
 hovered=k>=0&&k!==focus?k:null;
 overFocus=k>=0&&k===focus;
}
function release(samples,limit){
 const t=performance.now(),recent=samples.filter(s=>t-s.t<110);let velocity=0;
 if(recent.length>1&&t-recent[recent.length-1].t<60){const span=Math.max((recent[recent.length-1].t-recent[0].t)/1000,1/120);velocity=(recent[recent.length-1].p-recent[0].p)/span;}
 return motion.matches?0:clamp(velocity,-limit,limit);
}
function stopPeek(){overFocus=false;}

stage.addEventListener('pointerdown',event=>{
 if(!event.isPrimary||event.button>0)return;
 consumed=false;press={id:event.pointerId,x:event.clientX,origin:pos,moved:false,samples:[{t:performance.now(),p:pos}]};
 posV=0;hold();schedule();
});
stage.addEventListener('pointermove',event=>{
 if(event.pointerType!=='touch'&&!press){inside=true;pointerX=event.clientX;pointerY=event.clientY;refreshHover();}
 if(press&&press.id===event.pointerId){
  if(!press.moved&&Math.abs(event.clientX-press.x)>6){
   press.moved=true;stopPeek();hovered=null;stage.classList.add('dragging');
   try{stage.setPointerCapture(event.pointerId);}catch{}
  }
  if(press.moved){
   pos=press.origin-(event.clientX-press.x)/Math.max(geo.step,1);
   const t=performance.now();press.samples.push({t,p:pos});
   while(press.samples.length>2&&t-press.samples[0].t>110)press.samples.shift();
  }
 }
 schedule();
});
const finish=event=>{
 if(!press||press.id!==event.pointerId)return;
 const ended=press;press=null;
 try{if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);}catch{}
 if(ended.moved){
  consumed=true;stage.classList.remove('dragging');
  const velocity=release(ended.samples,16);
  posV=velocity;target=Math.round(pos+velocity*.22);hold();
 }
 schedule();
};
stage.addEventListener('pointerup',finish);
stage.addEventListener('pointercancel',finish);
stage.addEventListener('pointerleave',event=>{if(press&&press.id===event.pointerId)return;inside=false;hovered=null;overFocus=false;schedule();});
// Only a sideways wheel turns the shelf; an upright one keeps scrolling the page.
stage.addEventListener('wheel',event=>{
 if(Math.abs(event.deltaX)<=Math.abs(event.deltaY))return;
 event.preventDefault();
 const unit=event.deltaMode===1?16:event.deltaMode===2?stage.clientWidth:1;
 target=(wheeling?target:Math.round(target))+clamp(event.deltaX*unit,-240,240)/100;
 wheeling=true;wheelAt=clock();hold();schedule();
},{passive:false});

ruler.addEventListener('pointerdown',event=>{
 if(!event.isPrimary||event.button>0)return;
 scrub={id:event.pointerId,x:event.clientX,origin:pos,moved:false,samples:[{t:performance.now(),p:pos}]};
 posV=0;hold();
 try{ruler.setPointerCapture(event.pointerId);}catch{}
 schedule();
});
ruler.addEventListener('pointermove',event=>{
 if(!scrub||scrub.id!==event.pointerId)return;
 const dx=event.clientX-scrub.x;
 if(!scrub.moved&&Math.abs(dx)>3){scrub.moved=true;stopPeek();}
 if(!scrub.moved)return;
 pos=target=scrub.origin-dx/TICK_GAP;
 const t=performance.now();scrub.samples.push({t,p:pos});
 while(scrub.samples.length>2&&t-scrub.samples[0].t>110)scrub.samples.shift();
 schedule();
});
const endScrub=event=>{
 if(!scrub||scrub.id!==event.pointerId)return;
 const ended=scrub;scrub=null;
 try{if(ruler.hasPointerCapture(event.pointerId))ruler.releasePointerCapture(event.pointerId);}catch{}
 if(ended.moved){const velocity=release(ended.samples,14);posV=velocity;target=Math.round(pos+velocity*.2);}
 else{const rect=ruler.getBoundingClientRect();target=Math.round(target)+Math.round((event.clientX-rect.left-rect.width/2)/TICK_GAP);}
 hold();schedule();
};
ruler.addEventListener('pointerup',endScrub);
ruler.addEventListener('pointercancel',endScrub);

rail.addEventListener('keydown',event=>{
 const keys={ArrowRight:()=>step(1),ArrowLeft:()=>step(-1),Home:()=>goTo(0),End:()=>goTo(count()-1)};
 if(!keys[event.key]||event.target.closest('.rail-deck'))return;
 event.preventDefault();keys[event.key]();
});
$('rail-prev').onclick=()=>step(-1);
$('rail-next').onclick=()=>step(1);
$('rail-play').onclick=()=>launch(wrap(Math.round(target)));

// A pointer click on a side case brings it to the front; on the front case, or from the
// keyboard or a script, it opens the game.
function bind(node){
 node.addEventListener('click',event=>{
  if(consumed){consumed=false;return;}
  const index=cases.indexOf(node);
  if(event.detail>0&&index!==wrap(Math.round(target)))goTo(index);
  else launch(index);
 });
}
cases.forEach(bind);

function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function artOf(entry,className){
 if(entry.icon){const img=element('img',className);img.src=entry.icon;img.alt='';img.draggable=false;return img;}
 return element('span',`${className} letter`,entry.letter);
}
function makeCase(entry){
 const node=element('button','disc-case generated');node.type='button';node.dataset.container=entry.container;
 const disc=element('span','disc'),body=element('span','disc-body'),spinner=element('span','disc-spin');
 disc.setAttribute('aria-hidden','true');spinner.append(artOf(entry,'disc-label'));body.append(spinner,element('span','disc-shine'));disc.append(body);
 const cover=element('span','case-cover');cover.setAttribute('aria-hidden','true');
 if(entry.icon)cover.append(artOf(entry,'cover-glow'));
 cover.append(artOf(entry,'cover-icon'));
 const text=element('span','case-text');text.hidden=true;
 text.append(element('b','',''),element('small','',''));text.children[0].dataset.field='name';text.children[1].dataset.field='summary';
 node.append(disc,cover,text);
 return node;
}

/** Puts the published games on the shelf: featured cases keep their artwork, others come after. */
export function updateRail(entries){
 const base=Math.round(target),focus=wrap(base);
 const find=container=>cases.find(n=>n.dataset.container.toLowerCase()===container.toLowerCase());
 const ordered=[...entries.filter(e=>find(e.container)||e.icon),...entries.filter(e=>!find(e.container)&&!e.icon)];
 for(const entry of ordered){
  let node=find(entry.container);
  if(!node){
   if(cases.length>=LIMIT)continue;
   node=makeCase(entry);stage.append(node);cases.push(node);bind(node);
  }
  node.querySelector('[data-field=name]').textContent=entry.name;
  if(entry.summary)node.querySelector('[data-field=summary]').textContent=entry.summary;
  node.setAttribute('aria-label',entry.name);
  const label=node.querySelector('img.disc-label');
  if(label&&entry.icon&&label.getAttribute('src')!==entry.icon)label.src=entry.icon;
 }
 // Keep the same game in front now that the shelf wraps at a different length.
 const shift=focus-base;pos+=shift;target+=shift;owner+=shift;
 hoverMix.clear();shown=NaN;current=-1;rulerPos=NaN;
 rail.dataset.count=String(cases.length);
 schedule();
}

new ResizeObserver(()=>{if(measure()){rulerPos=NaN;schedule();}}).observe(stage);
new IntersectionObserver(([entry])=>{
 visible=entry.isIntersecting;
 if(visible){last=0;schedule();}
 else{
  if(raf)cancelAnimationFrame(raf);if(timer)clearTimeout(timer);raf=timer=0;
  peek=peekV=0;
 }
},{rootMargin:'80px'}).observe(rail);
motion.addEventListener('change',()=>schedule());
measure();schedule();
