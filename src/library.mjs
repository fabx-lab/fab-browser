// Adapted from trytotapeout/TapeBrowser src/main/library.js, GPL-3.0-or-later.
// Atomic local persistence and deduplicated recent visits; FAB identity is container.
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const MAX_HISTORY=200, MAX_BOOKMARKS=500, SAVE_DELAY=1000; // Retained upstream library limits.
export function createLibrary(file,{onChange=()=>{},now=Date.now,apps=[]}={}) {
  let data={};try{data=JSON.parse(readFileSync(file,'utf8'))||{};}catch{}
  const known = e => e && apps.some(a => a.container.toLowerCase()===e.container?.toLowerCase());
  let history=Array.isArray(data.history)?data.history.filter(known):[];
  let bookmarks=Array.isArray(data.bookmarks)?data.bookmarks.filter(known):[];
  let timer=null;
  function save(){clearTimeout(timer);timer=null;mkdirSync(dirname(file),{recursive:true});const tmp=file+'.tmp';writeFileSync(tmp,JSON.stringify({history,bookmarks},null,2),{mode:0o600});renameSync(tmp,file);}
  function changed(){if(!timer){timer=setTimeout(save,SAVE_DELAY);timer.unref?.();}onChange();}
  const identity = container => {const a=apps.find(a=>a.container.toLowerCase()===String(container).toLowerCase());if(!a)throw new Error('Unknown application');return {container:a.container.toLowerCase(),title:a.title};};
  return {
    history:()=>history.map(e=>({...e})),bookmarks:()=>bookmarks.map(e=>({...e})),
    visit(container){const app=identity(container);const i=history.findIndex(e=>e.container===app.container);const entry=i>=0?history.splice(i,1)[0]:{...app,visits:0};entry.visits+=1;entry.at=now();history.unshift(entry);if(history.length>MAX_HISTORY)history.length=MAX_HISTORY;changed();},
    toggleBookmark(container){const app=identity(container);const i=bookmarks.findIndex(e=>e.container===app.container);if(i>=0){bookmarks.splice(i,1);changed();return false;}bookmarks.unshift({...app,at:now()});if(bookmarks.length>MAX_BOOKMARKS)bookmarks.length=MAX_BOOKMARKS;changed();return true;},
    flush(){if(timer)save();},
  };
}
