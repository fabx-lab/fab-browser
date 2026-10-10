const api=window.fabBrowser;
const $=id=>document.getElementById(id);
const initial=await api.initial();
let current,sidebarOpen=false;
const fail=error=>{
 $('status').textContent=error.message;$('status').title=error.message;
 document.body.dataset.state='error';
};
const open=()=>api.navigate($('input').value).catch(fail);
$('input').value='';
$('address').onsubmit=event=>{event.preventDefault();void open();};
function openDemo(){ $('input').value=initial.apps[0].container;void setSidebar(false);void open(); }
$('demo').onclick=openDemo;$('start-demo').onclick=openDemo;
for(const name of ['back','forward','reload','developer'])$(name).onclick=()=>api[name]().catch(fail);
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
  button.onclick=()=>{$('input').value=row.container;void setSidebar(false);void open();};list.append(button);
 }
 if(!rows.size){const empty=document.createElement('p');empty.className='empty-library';empty.textContent='访问过的应用会显示在这里。';list.append(empty);}
 const bookmarked=!!current&&value.bookmarks.some(row=>row.container.toLowerCase()===current.container.toLowerCase());
 $('bookmark').setAttribute('aria-pressed',String(bookmarked));
 $('bookmark').setAttribute('aria-label',bookmarked?'移除书签':'添加书签');
 $('bookmark').title=bookmarked?'移除书签':'添加书签';
}
$('bookmark').onclick=async()=>{try{await api.bookmark();await refreshLibrary();}catch(error){fail(error);}};
api.onState(state=>{
 document.body.dataset.state=state.status;
 $('status').textContent=state.status==='ready'?'网站已打开 · 链上绑定已核对':state.message;
 $('status').title=state.message;
 $('bookmark').disabled=state.status!=='ready';
 $('start-page').hidden=state.status==='ready';
 if(state.status==='ready'){
  current=state;$('tab-title').textContent=state.title;$('input').value=state.url;
  $('identity').textContent=state.title;$('metadata').hidden=false;
  $('meta-chain').textContent=`X Layer ${state.chainId}`;$('meta-version').textContent=state.version;
  $('meta-cid').textContent=state.cid;$('meta-container').textContent=state.container;
  $('release-label').textContent=`X Layer ${state.chainId} · v${state.version}`;
  void refreshLibrary().catch(fail);
 }else if(state.status==='loading'){$('tab-title').textContent='正在打开…';}
 else if(state.status==='error'){$('tab-title').textContent=current?.title||'新页面';}
});
void refreshLibrary().catch(fail);

document.body.dataset.uiReady='true';
