const api=window.fabBrowser;
const $=id=>document.getElementById(id);
const initial=await api.initial();
let current,activeId,lastFind='',library={history:[],bookmarks:[],pins:[]};
document.body.dataset.platform=initial.platform;
const fail=error=>{
 $('status').textContent=error.message;$('status').title=error.message;
 document.body.dataset.state='error';
};
const open=()=>api.navigate($('input').value).catch(fail);
const go=value=>{$('input').value=value;if(layout.overlay)setOverlay(false);return open();};
// The start page's shelf and storefront open each app in a tab of its own.
const openTab=value=>{$('input').value=value;if(layout.overlay)setOverlay(false);return api.openTab(value).catch(fail);};
const letter=title=>(Array.from(String(title||'').replace(/^FAB\s+/,'').trim())[0]||'·').toUpperCase();

// Two ways to hold the window: tabs down the side, or across the top. Narrow
// windows always use the bar and open the column over the page on request.
const layout={preferred:initial.sidebar?'side':'strip',overlay:false,applied:undefined};
function applyLayout(){
 const narrow=innerWidth<700;if(!narrow)layout.overlay=false;
 const mode=narrow?(layout.overlay?'over':'strip'):layout.preferred;
 document.body.dataset.layout=mode;document.body.dataset.narrow=String(narrow);
 const side=layout.preferred==='side';
 $('panel-toggle').setAttribute('aria-expanded',String(mode!=='strip'));
 const label=narrow?'显示标签页':side?'标签移到顶部':'标签移到侧边';
 $('panel-toggle').setAttribute('aria-label',label);$('panel-toggle').title=`${label}（Shift+Cmd/Ctrl+S）`;
 $('panel-toggle').querySelector('use').setAttribute('href',side||narrow?'#i-panel':'#i-strip');
 const wanted=mode!=='strip';
 if(layout.applied!==wanted){layout.applied=wanted;void api.sidebar(wanted,false).catch(fail);}
}
function toggleLayout(){
 if(innerWidth<700){setOverlay(!layout.overlay);return;}
 setPreferred(layout.preferred==='side'?'strip':'side');
}
function setOverlay(open){layout.overlay=open;applyLayout();if(open)$('tabs').querySelector('[aria-selected="true"]')?.focus();else $('panel-toggle').focus();}
// Remember the choice first; applyLayout then corrects the live state for a narrow window.
function setPreferred(value){layout.preferred=value;document.body.dataset.preferred=value;void api.sidebar(value==='side',true).catch(fail);layout.applied=value==='side';applyLayout();}
document.body.dataset.preferred=layout.preferred;
document.addEventListener('fab:layout',event=>setPreferred(event.detail==='side'?'side':'strip'));
addEventListener('resize',applyLayout);applyLayout();
$('panel-toggle').onclick=toggleLayout;api.onToggleSidebar(toggleLayout);
$('panel-close').onclick=()=>setOverlay(false);

function renderTabs(snapshot){
 const changed=activeId!==snapshot.activeId;activeId=snapshot.activeId;
 if(changed)void setFind(false);
 const list=$('tabs');list.replaceChildren();
 for(const tab of snapshot.tabs){
  const row=document.createElement('div');row.className='browser-tab'+(tab.loading||tab.status==='loading'?' loading':'')+(tab.id===activeId?' selected':'');row.setAttribute('role','presentation');
  const select=document.createElement('button');select.className='tab-select';select.type='button';select.setAttribute('role','tab');select.setAttribute('aria-selected',String(tab.id===activeId));select.tabIndex=tab.id===activeId?0:-1;select.title=tab.title;
  let mark;if(tab.icon){mark=document.createElement('img');mark.src=tab.icon;mark.alt='';mark.className='tab-favicon';}else{mark=document.createElement('span');mark.className='tab-letter';mark.textContent=letter(tab.title);}mark.setAttribute('aria-hidden','true');
  const title=document.createElement('span');title.className='tab-title';title.textContent=tab.title;
  select.append(mark,title);select.onclick=()=>{void api.activateTab(tab.id).catch(fail);if(layout.overlay)setOverlay(false);};
  select.onkeydown=event=>{const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];if(!keys.includes(event.key))return;event.preventDefault();const step=['ArrowRight','ArrowDown'].includes(event.key)?1:snapshot.tabs.length-1,i=snapshot.tabs.findIndex(t=>t.id===tab.id),next=snapshot.tabs[(i+step)%snapshot.tabs.length];void api.activateTab(next.id).then(()=>list.querySelector('[aria-selected="true"]')?.focus()).catch(fail);};
  const close=document.createElement('button');close.type='button';close.className='icon-button tab-close';close.setAttribute('aria-label',`关闭 ${tab.title}`);close.title='关闭标签页（Cmd/Ctrl+W）';
  close.innerHTML='<svg class="icon"><use href="#i-close"/></svg>';close.onclick=()=>api.closeTab(tab.id).catch(fail);
  row.oncontextmenu=event=>{event.preventDefault();void api.tabMenu(tab.id).catch(fail);};
  row.onauxclick=event=>{if(event.button===1){event.preventDefault();void api.closeTab(tab.id).catch(fail);}};
  row.append(select,close);list.append(row);
 }
 if(changed){const tab=snapshot.tabs.find(t=>t.id===activeId);$('input').value=tab?.url||tab?.target||'';}
 list.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
api.onTabs(renderTabs);renderTabs(initial);
api.onFocusAddress(()=>{if(innerWidth<700&&layout.overlay)setOverlay(false);$('input').focus();$('input').select();});
$('new-tab').onclick=async()=>{try{await api.newTab();if(layout.overlay)setOverlay(false);$('input').focus();}catch(error){fail(error);}};
$('address').onsubmit=event=>{event.preventDefault();void open();};
document.addEventListener('fab:open',event=>void openTab(event.detail));$('start-catalog').onclick=()=>$('catalog-open').click();
for(const name of ['back','forward','reload'])$(name).onclick=()=>api[name]().catch(fail);
$('stop').onclick=()=>api.stop().catch(fail);
$('zoom-reset').onclick=()=>api.zoom(0).catch(fail);

async function setFind(open){$('find-bar').hidden=!open;document.body.dataset.find=String(open);await api.findOpen(open);if(open){$('find-input').focus();$('find-input').select();}}
function search(again=false,forward=true){lastFind=$('find-input').value;return api.find(lastFind,{again,forward}).catch(fail);}
$('find-button').onclick=()=>void setFind(true).catch(fail);
$('find-close').onclick=()=>void setFind(false).catch(fail);
$('find-input').oninput=()=>void search();
$('find-bar').onsubmit=event=>{event.preventDefault();void search(true);};
$('find-prev').onclick=()=>void search(true,false);$('find-next').onclick=()=>void search(true);
$('find-input').onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void setFind(false).catch(fail);}if(event.key==='Enter'&&event.shiftKey){event.preventDefault();void search(true,false);}};
api.onFindResult(value=>{$('find-result').textContent=`${value.active} / ${value.matches}`;});
api.onShowFind(async({again,forward})=>{try{await setFind(true);if(again&&lastFind)await search(true,forward);}catch(error){fail(error);}});
api.onCloseFind(()=>void setFind(false).catch(fail));
api.onLibraryChanged(()=>void refreshLibrary().catch(fail));
document.addEventListener('fab:library-changed',()=>void refreshLibrary().catch(fail));
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&layout.overlay&&$('management').hidden&&$('welcome').hidden)setOverlay(false);
 if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='l'){event.preventDefault();$('input').focus();$('input').select();}
});

// Pins: sites pinned from a tab's right-click menu, a tile each, one click away.
// Container addresses compare without case; ordinary URLs keep their path and query case.
const identity=value=>/^0x[0-9a-f]{40}$/i.test(String(value))?String(value).toLowerCase():String(value);
const sameApp=(row,state)=>!!state&&identity(row.container)===identity(state.container||state.url);
const origin=value=>{try{return new URL(value).origin;}catch{return '';}};
const showing=(row,state)=>sameApp(row,state)||(!!state&&state.kind==='web'&&row.kind==='web'&&origin(row.container)===origin(state.url));
function renderPins(){
 const pins=$('pins');pins.replaceChildren();
 for(const row of library.pins||[]){
  const pin=document.createElement('button');pin.type='button';pin.className='pin'+(showing(row,current)?' live':'');
  if(row.icon){const img=document.createElement('img');img.src=row.icon;img.alt='';pin.append(img);}else pin.textContent=letter(row.title);
  pin.title=row.title;pin.setAttribute('aria-label',row.title);
  pin.onclick=()=>void go(row.container);
  pin.oncontextmenu=event=>{event.preventDefault();void api.pinMenu(row.container).catch(fail);};
  pins.append(pin);
 }
}
async function refreshLibrary(){
 library=await api.library();renderPins();
 const bookmarked=!!current&&library.bookmarks.some(row=>sameApp(row,current));
 $('bookmark').setAttribute('aria-pressed',String(bookmarked));
 $('bookmark').setAttribute('aria-label',bookmarked?'移除书签':'添加书签');
 $('bookmark').title=bookmarked?'移除书签':'添加书签（Cmd/Ctrl+D）';
}
$('bookmark').onclick=async()=>{try{await api.bookmark();await refreshLibrary();}catch(error){fail(error);}};

function renderState(state){
 const kind=state.status==='ready'?(state.kind==='local'?'local':state.kind==='web'?'web':state.offline?'cache':'chain'):'';
 document.body.dataset.state=state.status;document.body.dataset.kind=kind;
 $('site-info').disabled=!state.container||state.status!=='ready';$('site-info').title=kind==='cache'?'历史缓存 · 当前链上版本和所有权未核验':'版本、文件与安全检查';$('offline-open').hidden=state.status!=='error';
 $('site-info').querySelector('use').setAttribute('href',kind==='chain'||kind==='cache'?'#i-chain':kind==='local'?'#i-folder':'#i-globe');
 $('status').textContent=state.offline?'历史缓存 · 当前链上版本和所有权未核验':state.status==='ready'?(kind==='local'?'本地预览 · 未发布到 IPFS':kind==='web'?'普通网页 · 未进行 FAB 链上绑定核验':'网站已打开 · 链上绑定已核对'):state.message;
 $('status').title=state.message||'';
 $('bookmark').disabled=state.status!=='ready'||kind==='local';
 $('local-inspect').hidden=$('local-reveal').hidden=kind!=='local';
 $('stop').hidden=state.status!=='loading';$('reload').hidden=state.status==='loading';
 $('zoom-reset').hidden=!state.zoom||state.zoom===100;$('zoom-reset').textContent=`${state.zoom||100}%`;
 $('back').disabled=!state.canGoBack;$('forward').disabled=!state.canGoForward;
 $('start-page').hidden=state.status==='ready';
 const showState=['loading','error'].includes(state.status)&&!!state.message;
 $('start-state').hidden=!showState;$('start-state').textContent=showState?state.message:'';
 if(state.status==='ready'){
  current=state;$('input').value=state.url;
  $('metadata').hidden=kind!=='chain'&&kind!=='cache';
  $('meta-chain').textContent=`X Layer ${state.chainId}`;$('meta-version').textContent=state.offline?`v${state.version} · 历史缓存`:`v${state.version}`;
  $('meta-cid').textContent=state.cid;$('meta-cid').title=state.cid||'';
  $('meta-container').textContent=state.container;$('meta-container').title=state.container||'';
  $('release-label').textContent=state.offline?`历史缓存 · v${state.version}`:kind==='local'?'本地预览':kind==='web'?'普通网页':`X Layer ${state.chainId} · v${state.version}`;
 }else{current=undefined;$('metadata').hidden=true;$('release-label').textContent='FAB 测试环境';}
 void refreshLibrary().catch(fail);
}
api.onState(renderState);if(initial.currentState)renderState(initial.currentState);
void refreshLibrary().catch(fail);

document.body.dataset.uiReady='true';
