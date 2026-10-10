const api=window.fabBrowser;
const $=id=>document.getElementById(id);
const initial=await api.initial();
let current,sidebarOpen=false,activeId;
let lastFind='';
const fail=error=>{
 $('status').textContent=error.message;$('status').title=error.message;
 document.body.dataset.state='error';
};
const open=()=>api.navigate($('input').value).catch(fail);
function renderTabs(snapshot){
 const changed=activeId!==snapshot.activeId;activeId=snapshot.activeId;
 if(changed)void setFind(false);
 const list=$('tabs');list.replaceChildren();
 for(const tab of snapshot.tabs){
  const row=document.createElement('div');row.className='browser-tab'+(tab.id===activeId?' selected':'');row.setAttribute('role','presentation');
  const select=document.createElement('button');select.className='tab-select';select.type='button';select.setAttribute('role','tab');select.setAttribute('aria-selected',String(tab.id===activeId));select.tabIndex=tab.id===activeId?0:-1;select.title=tab.title;
  const dot=document.createElement('span');dot.className='app-dot';dot.setAttribute('aria-hidden','true');
  const title=document.createElement('span');title.className='tab-title';title.textContent=tab.title;
  select.append(dot,title);select.onclick=()=>api.activateTab(tab.id).catch(fail);
  select.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const i=snapshot.tabs.findIndex(t=>t.id===tab.id),next=snapshot.tabs[(i+(event.key==='ArrowRight'?1:snapshot.tabs.length-1))%snapshot.tabs.length];void api.activateTab(next.id).then(()=>list.querySelector('[aria-selected="true"]')?.focus()).catch(fail);};
  const close=document.createElement('button');close.type='button';close.className='icon-button tab-close';close.setAttribute('aria-label',`关闭 ${tab.title}`);close.title='关闭标签页（Cmd/Ctrl+W）';close.textContent='×';close.onclick=()=>api.closeTab(tab.id).catch(fail);
  row.onauxclick=event=>{if(event.button===1){event.preventDefault();void api.closeTab(tab.id).catch(fail);}};
  row.append(select,close);list.append(row);
 }
 if(changed){const tab=snapshot.tabs.find(t=>t.id===activeId);$('input').value=tab?.url||tab?.target||'';}
 list.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
api.onTabs(renderTabs);renderTabs(initial);
api.onFocusAddress(()=>{$('input').focus();$('input').select();});
$('new-tab').onclick=async()=>{try{await api.newTab();$('input').focus();}catch(error){fail(error);}};
$('address').onsubmit=event=>{event.preventDefault();void open();};
function openDemo(){ $('input').value=initial.apps[0].container;void setSidebar(false);void open(); }
$('demo').onclick=openDemo;$('start-demo').onclick=openDemo;
for(const name of ['back','forward','reload','developer'])$(name).onclick=()=>api[name]().catch(fail);
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
api.onShowLibrary(()=>void setSidebar(true));
api.onLibraryChanged(()=>void refreshLibrary().catch(fail));
async function setSidebar(open){
 sidebarOpen=open;document.body.dataset.sidebar=String(open);
 $('sidebar').hidden=!open;$('panel-toggle').setAttribute('aria-expanded',String(open));
 $('panel-toggle').setAttribute('aria-label',open?'关闭应用侧栏':'打开应用侧栏');
 await api.sidebar(open).catch(fail);
}
$('panel-toggle').onclick=()=>void setSidebar(!sidebarOpen);
$('panel-close').onclick=()=>{void setSidebar(false);$('panel-toggle').focus();};
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&sidebarOpen){void setSidebar(false);$('panel-toggle').focus();}
 if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='l'){event.preventDefault();$('input').focus();$('input').select();}
});
async function refreshLibrary(){
 const value=await api.library();const list=$('library-list');list.replaceChildren();
 const rows=new Map();
 for(const row of value.history)rows.set(row.container.toLowerCase(),{...row,bookmarked:false});
 for(const row of value.bookmarks)rows.set(row.container.toLowerCase(),{...row,bookmarked:true});
 for(const row of rows.values()){
  const button=document.createElement('button');button.className='library-item';
  button.textContent=`${row.bookmarked?'★':'↗'}  ${row.title}`;button.title=row.container;
  button.onclick=()=>{$('input').value=row.container;void setSidebar(false);void open();};
  const entry=document.createElement('div');entry.className='library-row';const remove=document.createElement('button');remove.className='icon-button';remove.textContent='×';remove.setAttribute('aria-label',`${row.bookmarked?'移除书签':'移除记录'} ${row.title}`);remove.onclick=async()=>{try{await api[row.bookmarked?'removeBookmark':'removeHistory'](row.container);await refreshLibrary();}catch(error){fail(error);}};entry.append(button,remove);list.append(entry);
 }
 if(!rows.size){const empty=document.createElement('p');empty.className='empty-library';empty.textContent='访问过的应用会显示在这里。';list.append(empty);}
 const bookmarked=!!current&&value.bookmarks.some(row=>row.container===(current.container?.toLowerCase()||current.url));
 $('bookmark').setAttribute('aria-pressed',String(bookmarked));
 $('bookmark').setAttribute('aria-label',bookmarked?'移除书签':'添加书签');
 $('bookmark').title=bookmarked?'移除书签':'添加书签';
}
$('bookmark').onclick=async()=>{try{await api.bookmark();await refreshLibrary();}catch(error){fail(error);}};
$('clear-history').onclick=async()=>{try{await api.clearHistory();await refreshLibrary();}catch(error){fail(error);}};
api.onState(state=>{
 document.body.dataset.state=state.status;
 $('status').textContent=state.status==='ready'?(state.kind==='web'?'普通网页 · 未进行 FAB 链上绑定核验':'网站已打开 · 链上绑定已核对'):state.message;
 $('status').title=state.message;
 $('bookmark').disabled=state.status!=='ready';
 $('stop').hidden=state.status!=='loading';$('reload').hidden=state.status==='loading';
 $('zoom-reset').hidden=!state.zoom||state.zoom===100;$('zoom-reset').textContent=`${state.zoom||100}%`;
 $('back').disabled=!state.canGoBack;$('forward').disabled=!state.canGoForward;
 $('start-page').hidden=state.status==='ready';
 if(state.status==='ready'){
  current=state;$('input').value=state.url;
  $('identity').textContent=state.title;$('metadata').hidden=state.kind==='web';
  $('meta-chain').textContent=`X Layer ${state.chainId}`;$('meta-version').textContent=state.version;
  $('meta-cid').textContent=state.cid;$('meta-container').textContent=state.container;
  $('release-label').textContent=state.kind==='web'?'普通网页':`X Layer ${state.chainId} · v${state.version}`;
  void refreshLibrary().catch(fail);
 }else{current=undefined;$('metadata').hidden=true;$('identity').textContent='打开应用后查看链上绑定信息。';$('release-label').textContent='FAB 测试环境';}
});
void refreshLibrary().catch(fail);

document.body.dataset.uiReady='true';
