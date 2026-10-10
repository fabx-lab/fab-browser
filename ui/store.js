// The start page as a storefront: every application published to the Registry, named
// and described by its own verified release. Opening one still checks it on chain first.
import {updateRail} from './rail.js';
const api=window.fabBrowser,$=id=>document.getElementById(id);
const settings=await api.settings(),lang=settings.effectiveLanguage==='en'?'en':'zh';
const today=new Intl.DateTimeFormat(lang==='en'?'en-US':'zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
$('store-date').textContent=today;

function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
const nameOf=app=>app.localized?.[lang]?.name||app.name||`#${app.tokenId}`;
const summaryOf=app=>app.localized?.[lang]?.description||app.summary||'';
const letter=name=>(Array.from(String(name).replace(/^FAB\s+/,'').trim())[0]||'·').toUpperCase();
function iconOf(app){
 const src=app.icon||(app.iconKey?`apps/${app.iconKey}.png`:null);
 if(src){const img=element('img',undefined,'app-icon');img.src=src;img.alt='';return img;}
 const tile=element('span',letter(nameOf(app)),'app-icon letter');tile.setAttribute('aria-hidden','true');return tile;
}
const open=app=>document.dispatchEvent(new CustomEvent('fab:open',{detail:app.container}));

function render(apps){
 const list=$('store-list');list.replaceChildren();
 for(const app of apps){
  const row=element('button',undefined,'store-row'+(app.described?'':' pending'));row.type='button';row.dataset.container=app.container.toLowerCase();row.setAttribute('role','listitem');
  const text=element('span',undefined,'store-text');text.append(element('b',nameOf(app)),element('small',summaryOf(app)||`电路 #${app.tokenId} · v${app.version}`));
  row.append(iconOf(app),text,element('span','打开','get'));row.onclick=()=>open(app);list.append(row);
 }
 list.dataset.count=String(apps.length);
 // The featured shelf takes the name, line and icon each release declares.
 updateRail(apps.filter(app=>app.described).map(app=>({container:app.container,name:nameOf(app),summary:summaryOf(app),icon:app.icon||(app.iconKey?`apps/${app.iconKey}.png`:null),letter:letter(nameOf(app))})));
}
async function refresh(){try{render(await api.store());}catch{}}
api.onStoreChanged(()=>void refresh());
await refresh();
document.body.dataset.storeReady='true';
