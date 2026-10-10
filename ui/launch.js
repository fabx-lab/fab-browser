// The launch: FAB assembles out of glass, holds a beat, then breaks open into
// the browser. Once per window, never on a reload; a click or key skips it and
// a click breaks the glass from where it lands.
import {createShatter} from './shatter.js';
const host=document.getElementById('launch'),SEEN='fab-launched';
let seen=false;try{seen=sessionStorage.getItem(SEEN)==='1';sessionStorage.setItem(SEEN,'1');}catch{}
const finish=()=>{host?.remove();document.body.dataset.launched='true';};
if(!host||seen)finish();else play();

function play(){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const size=Math.round(Math.min(220,Math.max(72,Math.min(innerWidth,innerHeight)*0.24)));
 host.style.setProperty('--launch-size',`${size}px`);
 const tone=name=>getComputedStyle(host).getPropertyValue(name).trim();
 const glass=reduced?null:createShatter(document.getElementById('launch-stage'),{
  text:'FAB',fontSize:size,fontWeight:700,letterSpacing:-0.035,shardSize:0.075,irregularity:0.7,
  accentColor:tone('--muted'),glint:0.9,crack:0.5,crackRadius:0.7,
  intro:'assemble',introDuration:1.25,shatter:false,
  shatterRadius:6,force:1.5,spin:1.3,depth:2.4,reassemble:10,
 });
 host.dataset.mode=glass?'glass':'still';
 requestAnimationFrame(()=>requestAnimationFrame(()=>{if(host.dataset.phase!=='out')host.dataset.phase='in';}));
 const hold=setTimeout(()=>leave(),glass?2500:1400);
 function leave(x,y){
  if(host.dataset.phase==='out')return;
  clearTimeout(hold);removeEventListener('keydown',skip,true);host.removeEventListener('pointerdown',press);
  host.dataset.phase='out';document.body.dataset.launch='arrive';
  glass?.shatter(x,y);
  setTimeout(()=>{glass?.destroy();finish();},glass?1100:500);
 }
 function skip(event){if(event.metaKey||event.ctrlKey||event.altKey)return;event.preventDefault();event.stopPropagation();leave();}
 function press(event){if(event.button===0)leave(event.clientX,event.clientY);}
 addEventListener('keydown',skip,true);host.addEventListener('pointerdown',press);
}
