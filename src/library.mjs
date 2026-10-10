// Adapted from trytotapeout/TapeBrowser src/main/library.js, GPL-3.0-or-later.
// Atomic local persistence and deduplicated recent visits; FAB identity is container.
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {parseBrowserTarget} from './navigation.mjs';
const MAX_HISTORY=200, MAX_BOOKMARKS=500, SAVE_DELAY=1000; // Retained upstream library limits.
const MAX_PINS=48, MAX_ICON=270*1024;
// First run pins the X Layer explorer and the FAB site; afterwards the list is the user's.
export const DEFAULT_PINS=[{container:'https://www.oklink.com/x-layer',title:'OKLink'},{container:'https://fabx.tech/',title:'FAB'}];
export function createLibrary(file,{onChange=()=>{},now=Date.now,apps=[]}={}) {
  let data={};try{data=JSON.parse(readFileSync(file,'utf8'))||{};}catch{}
  const identity = container => {const a=apps.find(a=>a.container.toLowerCase()===String(container).toLowerCase());if(a)return {container:a.container.toLowerCase(),title:a.title};const target=parseBrowserTarget(container,apps);if(target.kind!=='web')throw new Error('Unknown application');return {container:target.url,title:target.title,kind:'web'};};
  const known = e => {try{return !!e&&identity(e.container).container===e.container;}catch{return false;}};
  let history=Array.isArray(data.history)?data.history.filter(known):[];
  let bookmarks=Array.isArray(data.bookmarks)?data.bookmarks.filter(known):[];
  // Pins keep a short title and the favicon (a small data: URL) the shell last saw for them.
  const pinOf=(container,{title,icon}={})=>{const app=identity(container);return {...app,title:String(title||app.title).slice(0,200),icon:typeof icon==='string'&&/^data:image\/(png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/.test(icon)&&icon.length<=MAX_ICON?icon:''};};
  let pins=Array.isArray(data.pins)?data.pins.filter(known).map(e=>pinOf(e.container,e)):DEFAULT_PINS.map(e=>pinOf(e.container,e));
  let timer=null;
  function save(){clearTimeout(timer);timer=null;mkdirSync(dirname(file),{recursive:true});const tmp=file+'.tmp';writeFileSync(tmp,JSON.stringify({history,bookmarks,pins},null,2),{mode:0o600});renameSync(tmp,file);}
  function changed(){if(!timer){timer=setTimeout(save,SAVE_DELAY);timer.unref?.();}onChange();}
  return {
    history:()=>history.map(e=>({...e})),bookmarks:()=>bookmarks.map(e=>({...e})),
    visit(container){const app=identity(container);const i=history.findIndex(e=>e.container===app.container);const entry=i>=0?history.splice(i,1)[0]:{...app,visits:0};entry.visits+=1;entry.at=now();history.unshift(entry);if(history.length>MAX_HISTORY)history.length=MAX_HISTORY;changed();},
    toggleBookmark(container){const app=identity(container);const i=bookmarks.findIndex(e=>e.container===app.container);if(i>=0){bookmarks.splice(i,1);changed();return false;}bookmarks.unshift({...app,at:now()});if(bookmarks.length>MAX_BOOKMARKS)bookmarks.length=MAX_BOOKMARKS;changed();return true;},
    removeHistory(container){history=history.filter(e=>e.container!==container);changed();},
    removeBookmark(container){bookmarks=bookmarks.filter(e=>e.container!==container);changed();},
    clearHistory(){history=[];changed();},
    pins:()=>pins.map(e=>({...e})),
    isPinned(container){try{const key=identity(container).container;return pins.some(e=>e.container===key);}catch{return false;}},
    pin(container,meta){const entry=pinOf(container,meta);if(pins.some(e=>e.container===entry.container))return false;pins.push(entry);if(pins.length>MAX_PINS)pins.length=MAX_PINS;changed();return true;},
    unpin(container){const key=identity(container).container,before=pins.length;pins=pins.filter(e=>e.container!==key);if(pins.length!==before)changed();},
    /** Remembers a pinned site's logo. A tab's favicon only fills an empty tile; a redirected web pin matches by origin. */
    pinIcon(container,icon,{replace=false}={}){let key;try{key=identity(container).container;}catch{return false;}const origin=e=>{try{return new URL(e).origin;}catch{return '';}};let i=pins.findIndex(e=>e.container===key);if(i<0)i=pins.findIndex(e=>e.kind==='web'&&!e.icon&&origin(e.container)===origin(key));if(i<0)return false;const next=pinOf(key,{title:pins[i].title,icon}).icon;if(!next||next===pins[i].icon||(pins[i].icon&&!replace))return false;pins[i]={...pins[i],icon:next};changed();return true;},
    flush(){if(timer)save();},
  };
}
