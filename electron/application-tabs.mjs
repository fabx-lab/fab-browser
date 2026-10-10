// Adapted from TapeBrowser's per-tab WebContentsView lifecycle (UPSTREAM.md).
// The shell owns tab state; application content receives no management bridge.
export function createApplicationTabs({window,WebContentsView,session,config,resolveApp,parseTarget,safeOrigin,allowedNavigation,library,preload,onSession=()=>{},smoke=false,onChange,onState,getLayout,onView=()=>{},onFind=()=>{},audit}){
 const tabs=new Map();let sequence=0,activeId;
 const blank=()=>({status:'blank',message:'选择应用，无需钱包即可访问。'});
 const active=()=>tabs.get(activeId);
 const snapshot=()=>({activeId,tabs:[...tabs.values()].map(t=>({id:t.id,title:t.state.status==='loading'?'正在打开…':t.state.title||'新标签页',icon:t.state.icon||'',loading:!!t.state.pageLoading,status:t.state.status,url:t.state.url||'',target:t.target||''}))});
 function layout(){const geometry=getLayout();for(const t of tabs.values())if(t.view){t.view.setBounds(geometry.application);t.view.setVisible(t.id===activeId&&t.state.status==='ready'&&!geometry.hideApplication);}}
 function push(){layout();onChange(snapshot());onState({...active().state,target:active().target||'',zoom:Math.round((active().view?.webContents.getZoomFactor?.()||1)*100),canGoBack:!!active().view?.webContents.navigationHistory?.canGoBack(),canGoForward:!!active().view?.webContents.navigationHistory?.canGoForward()});}
 function open(raw,{background=false}={}){if(!background)stopFind();const t={id:++sequence,target:'',request:0,state:blank(),view:null};tabs.set(t.id,t);if(!background||!activeId)activeId=t.id;push();if(raw)void navigate(raw,t.id);return t.id;}
 function activate(id){if(!Number.isSafeInteger(id)||!tabs.has(id))throw new Error('Unknown tab');if(activeId!==id)stopFind();activeId=id;push();active().view?.webContents.focus?.();return snapshot();}
 function destroyView(t){if(t.view){if(!window.isDestroyed?.())window.contentView.removeChildView(t.view);if(!t.view.webContents.isDestroyed?.())t.view.webContents.close();t.view=null;}}
 function close(id=activeId){if(!Number.isSafeInteger(id)||!tabs.has(id))throw new Error('Unknown tab');const ids=[...tabs.keys()],index=ids.indexOf(id),t=tabs.get(id);tabs.delete(id);t.request++;destroyView(t);if(!tabs.size){open();return snapshot();}if(activeId===id)activeId=[...tabs.keys()][Math.min(index,tabs.size-1)];push();return snapshot();}
 async function navigate(raw,id=activeId){
  const t=tabs.get(id);if(!t)return;t.target=String(raw);const request=++t.request;
  const pending=()=>tabs.get(t.id)===t&&t.request===request;
  t.state={...t.state,status:'loading',message:'正在核对 X Layer 双 RPC…'};push();
  try{
   const target=parseTarget(raw,config.apps),web=target.kind==='web',local=target.kind==='local',resolved=web||local?{...target,verification:local?'本地预览 · 未发布到 IPFS':'普通网页 · 未进行 FAB 链上绑定核验'}:await resolveApp(target,config);
   if(!pending())return;
   destroyView(t);t.loadedState=null;if(audit&&!local)audit.reset(web?new URL(resolved.url).origin:target.gateway);
   // Version-specific sessions prevent one tab replacing another version's request guard.
   const partition=local?`${smoke?'fab-smoke-':'persist:fab-'}local-${target.localHost}`:web?`${smoke?'fab-smoke-':'persist:fab-'}web`:`${smoke?'fab-smoke-':'persist:fab-'}${config.chainId}-${config.registry.toLowerCase()}-${target.container.toLowerCase()}-${resolved.version}-${resolved.cid}${resolved.offline?'-offline':''}`;
   const isolated=session.fromPartition(partition),origin=web||local?null:safeOrigin(target.gateway);
   await onSession(isolated,target,resolved);if(!pending())return;
   const allowed=value=>{if(local){try{const u=new URL(value);return u.protocol==='fab-local:'&&u.host===target.localHost&&!u.username&&!u.password;}catch{return false;}}if(!web)return allowedNavigation(value,origin,resolved.version);try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&!config.apps.some(a=>safeOrigin(a.gateway)===u.origin);}catch{return false;}};
   isolated.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));isolated.setPermissionCheckHandler(()=>false);
   isolated.webRequest.onBeforeRequest((details,callback)=>{const cancel=!((web||local)&&/^(data|blob):/.test(details.url))&&!allowed(details.url);if(cancel&&audit&&!local)audit.external(web?new URL(resolved.url).origin:origin,details.url,details.resourceType);callback({cancel});});
   const view=new WebContentsView({webPreferences:{session:isolated,...(!local&&preload?{preload}:{}),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:true}});
   t.view=view;window.contentView.addChildView(view);layout();onView(view,t);
   const valid=()=>tabs.get(t.id)===t&&t.view===view;
   view.webContents.setWindowOpenHandler(({url,disposition})=>{if(allowed(url))open(url,{background:disposition==='background-tab'});return {action:'deny'};});
   view.webContents.on('will-navigate',(event,url)=>{if(!allowed(url)){event.preventDefault();if(valid()){t.state={...t.state,message:'已阻止当前会话不允许的导航'};push();}}});
   view.webContents.on('will-redirect',(event,url)=>{if(!allowed(url))event.preventDefault();});
   view.webContents.on('will-attach-webview',event=>event.preventDefault());
   view.webContents.on('found-in-page',(_event,result)=>{if(valid()&&activeId===t.id&&result.finalUpdate)onFind({active:result.activeMatchOrdinal,matches:result.matches});});
   view.webContents.on('zoom-changed',(_event,direction)=>zoom(direction==='in'?1:-1,t.id));
   view.webContents.on('did-fail-load',(_event,code,description,_url,mainFrame)=>{if(mainFrame&&code!==-3&&valid()){t.state={...resolved,status:'error',message:`应用加载失败 ${code}: ${description}`};push();}});
   for(const event of ['did-navigate','did-navigate-in-page'])view.webContents.on(event,()=>{if(valid()){if(web){const url=view.webContents.getURL();if(allowed(url)){t.target=url;t.state={...t.state,url,kind:'web'};}}push();}});
   view.webContents.on('did-start-loading',()=>{if(valid()){t.state={...t.state,pageLoading:true};push();}});
   view.webContents.on('did-stop-loading',()=>{if(valid()){t.state={...t.state,pageLoading:false};push();}});
   view.webContents.on('page-favicon-updated',async(_event,icons)=>{const url=icons.find(allowed);if(!url)return;try{const response=await isolated.fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(5000)});const type=response.headers.get('content-type')?.split(';')[0];if(!response.ok||!['image/png','image/jpeg','image/x-icon','image/vnd.microsoft.icon'].includes(type))return;const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>50*1024)return;chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}if(valid()){t.state={...t.state,icon:`data:${type};base64,${Buffer.concat(chunks).toString('base64')}`};push();}}catch{}});
   view.webContents.on('page-title-updated',(_event,title)=>{if(valid()){t.state={...t.state,title:String(title).slice(0,500)};push();}});
   await view.webContents.loadURL(resolved.url);
   if(!pending()||!valid())return;
   t.state={...resolved,...(web?{url:view.webContents.getURL?.()||resolved.url,title:view.webContents.getTitle?.()||resolved.title}:{}),status:'ready',message:resolved.verification};t.loadedState=t.state;if(!local)library.visit(target.container||resolved.url);push();
  }catch(error){if(pending()){t.state={status:'error',message:error.message};push();}}
 }
 function reload(){if(active().target)return navigate(active().target);}
 function back(){const wc=active().view?.webContents;if(wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();}
 function forward(){const wc=active().view?.webContents;if(wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();}
 function stop(){const t=active();t.request++;t.view?.webContents.stop?.();t.state=t.view&&t.loadedState?{...t.loadedState,message:'已停止加载'}:blank();t.target=t.state.url||'';push();}
 function find(text,{forward=true,again=false}={}){if(typeof text!=='string')throw new Error('Invalid search');if(!text)return stopFind();active().view?.webContents.findInPage(text.slice(0,500),{forward:!!forward,findNext:!again});}
 function stopFind(){active()?.view?.webContents.stopFindInPage?.('clearSelection');onFind({active:0,matches:0});}
 // TapeBrowser's Chrome-compatible zoom steps.
 const zoomSteps=[0.25,0.33,0.5,0.67,0.75,0.8,0.9,1,1.1,1.25,1.5,1.75,2,2.5,3,4,5];
 function zoom(direction,id=activeId){if(![-1,0,1].includes(direction))throw new Error('Invalid zoom');const wc=tabs.get(id)?.view?.webContents;if(!wc)return;const current=wc.getZoomFactor();const factor=direction>0?zoomSteps.find(v=>v>current+0.001)??5:direction<0?[...zoomSteps].reverse().find(v=>v<current-0.001)??0.25:1;wc.setZoomFactor(factor);push();return Math.round(factor*100);}
 function cycle(step){const ids=[...tabs.keys()];return activate(ids[(ids.indexOf(activeId)+step+ids.length)%ids.length]);}
 function select(index){const ids=[...tabs.keys()];const id=index===8?ids.at(-1):ids[index];if(id)activate(id);}
 function devtools(){active().view?.webContents.toggleDevTools();}
 function dispose(){for(const t of tabs.values()){t.request++;destroyView(t);}tabs.clear();}
 return {open,close,activate,navigate,reload,back,forward,stop,find,stopFind,zoom,cycle,select,devtools,layout,dispose,snapshot,active,views:()=>[...tabs.values()].map(t=>t.view).filter(Boolean),owns:wc=>[...tabs.values()].some(t=>t.view?.webContents===wc),site:()=>active()?.view,state:()=>active()?.state};
}
