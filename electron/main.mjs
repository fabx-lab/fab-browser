import {app,BaseWindow,WebContentsView,ipcMain,session,shell,Menu,clipboard,dialog,protocol} from 'electron';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {installDeepLinks} from './deep-links.mjs';
import {createApplicationTabs} from './application-tabs.mjs';
import {installBrowserMenu} from './browser-menu.mjs';
import {attachContextMenu} from './context-menu.mjs';
import {runSmoke} from './smoke.mjs';
import {desktopLayout} from '../src/desktop-layout.mjs';
import {config} from '../src/config.mjs';
import {parseBrowserTarget,parseCachedTarget,safeOrigin,allowedNavigation} from '../src/navigation.mjs';
import {resolveApp} from '../src/resolver.mjs';
import {createLibrary} from '../src/library.mjs';
import {createSettings} from '../src/settings.mjs';
import {createRpc,validateRpcs} from '../src/rpc.mjs';
import {createLocalPreview} from './local-preview.mjs';
import {createWalletService} from './wallet-service.mjs';
import {createTranslator,pickLanguage} from '../src/i18n.mjs';
import {catalogMetadata} from '../src/catalog-metadata.mjs';
import {quorum} from '../src/quorum.mjs';
import {createCatalog} from '../src/catalog.mjs';
import {createContentStore} from '../src/content-store.mjs';
import {createReleaseContent,releaseKey} from '../src/release-content.mjs';
import {createReleaseSessions} from './release-session.mjs';
import {createPageAudit} from '../src/page-audit.mjs';
import {audit as staticAudit} from '../src/safety.mjs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
protocol.registerSchemesAsPrivileged([{scheme:'fab-local',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const here=path.dirname(fileURLToPath(import.meta.url));
const smoke=process.argv.includes('--fab-smoke');
if(smoke)app.setPath('userData',mkdtempSync(path.join(tmpdir(),'fab-browser-smoke-')));
const smokeDir=process.env.FAB_SMOKE_OUTPUT||(app.isPackaged?path.join(app.getPath('userData'),'smoke-artifacts'):path.join(here,'../artifacts'));
if(smoke)setTimeout(()=>app.exit(1),240000).unref();
let window,chrome,tabs,library,wallet,settings,runtimeConfig,localPreview,sidebarOpen=false,findOpen=false,managementOpen=false;
let disposing=false;
const smokeControls={response:0,folder:null};
const uiDialog=smoke?{showMessageBox:async()=>({response:smokeControls.response}),showOpenDialog:async()=>({canceled:!smokeControls.folder,filePaths:smokeControls.folder?[smokeControls.folder]:[]})}:dialog;
const send=(name,data)=>{if(!disposing&&chrome&&!chrome.webContents.isDestroyed())chrome.webContents.send(name,data);};
const deepLinks=installDeepLinks({app,getWindow:()=>window,getTabs:()=>tabs,smoke});
const isUI=event=>event.sender===chrome.webContents&&event.senderFrame===chrome.webContents.mainFrame;
function register(name,action){ipcMain.handle(name,(event,...args)=>{if(!isUI(event))throw new Error('Untrusted IPC sender');return action(...args);});}
function bounds(){const [width,height]=window.getContentSize();chrome.setBounds({x:0,y:0,width,height});tabs?.layout();}
function shortcuts(wc){wc.on('before-input-event',(event,input)=>{
 if(input.type!=='keyDown')return;
 if(input.key==='Escape'&&findOpen){event.preventDefault();send('closeFind');return;}
 if(!input.control&&!input.meta)return;
 const key=input.key.toLowerCase();
 if(key==='t'){event.preventDefault();tabs.open();chrome.webContents.focus();send('focusAddress');}
 if(key==='w'){event.preventDefault();tabs.close();chrome.webContents.focus();}
 if(key==='l'){event.preventDefault();chrome.webContents.focus();send('focusAddress');}
});}
if(deepLinks.owned)app.whenReady().then(async()=>{
 settings=createSettings(path.join(app.getPath('userData'),'fab-settings.json'));
 runtimeConfig={...config,apps:config.apps.map(a=>({...a})),rpcs:settings.rpcsOf('xlayer').length?settings.rpcsOf('xlayer'):config.rpcs};
 for(const saved of Array.isArray(settings.get('gateways'))?settings.get('gateways'):[]){try{safeOrigin(saved.gateway);if(!/^0x[0-9a-f]{40}$/i.test(saved.container)||!/^0x[0-9a-f]{40}$/i.test(saved.circuits)||!/^\d+$/.test(saved.tokenId))continue;const index=runtimeConfig.apps.findIndex(a=>a.container.toLowerCase()===saved.container.toLowerCase());if(index>=0)runtimeConfig.apps[index]=saved;else runtimeConfig.apps.push(saved);}catch{}}
 const store=createContentStore(path.join(app.getPath('userData'),'content-cache')),audit=createPageAudit(settings.baselines);
 const content=createReleaseContent({store,onFile:(release,file,sha)=>audit.file(release.gateway,file,sha)}),releaseSessions=createReleaseSessions(content);
 const siteKey=container=>`${runtimeConfig.chainId}:${runtimeConfig.registry.toLowerCase()}:${container.toLowerCase()}`;
 const resolver=async(target,cfg)=>{const key=siteKey(target.container);if(target.offline){const cached=store.lastSite(target.cachedVersion?`${key}:v${target.cachedVersion}`:key);if(!cached)throw new Error('没有此应用的历史缓存');return {...cached,offline:true,verification:'历史缓存 · 当前链上版本和所有权尚未核验'};}const result=await resolveApp(target,cfg);store.rememberSite(`${key}:v${result.version}`,result);if(!target.requestedVersion)store.rememberSite(key,result);return result;};

 const catalog=createCatalog({file:path.join(app.getPath('userData'),'fab-catalog.json'),config:runtimeConfig,seedFile:path.join(here,'../src/catalog-seed.json'),onProgress:data=>send('catalogProgress',data)});
 library=createLibrary(path.join(app.getPath('userData'),'fab-library.json'),{apps:runtimeConfig.apps});
 window=new BaseWindow({width:1280,height:900,minWidth:390,minHeight:500,title:'FAB DeWEB Browser'});
 chrome=new WebContentsView({webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 window.contentView.addChildView(chrome);
 localPreview=createLocalPreview({dialog:uiDialog,window,shell,getTabs:()=>tabs,onReport:report=>send('localReport',report)});
 tabs=createApplicationTabs({window,WebContentsView,session,config:runtimeConfig,resolveApp:resolver,audit,parseTarget:(raw,apps)=>String(raw).startsWith('fab-cache:')?parseCachedTarget(raw,apps):String(raw).startsWith('fab-local:')?localPreview.parse(raw):parseBrowserTarget(raw,apps),safeOrigin,allowedNavigation,library,preload:path.join(here,'site-preload.cjs'),onSession:async(s,target,resolved)=>{await localPreview.registerSession(s);await releaseSessions(s,target,resolved);},smoke,onChange:data=>{send('tabs',data);localPreview.sync();},onState:data=>send('state',data),onFind:data=>send('findResult',data),getLayout:()=>{const geometry=desktopLayout(...window.getContentSize(),sidebarOpen);if(findOpen){geometry.application.y+=44;geometry.application.height=Math.max(1,geometry.application.height-44);}if(managementOpen)geometry.hideApplication=true;return geometry;},onView:view=>{shortcuts(view.webContents);attachContextMenu({view,window,Menu,clipboard,tabs});}});
 wallet=await createWalletService({settings,staticDir:path.join(here,'../bridge'),rpc:createRpc(()=>runtimeConfig.rpcs),dialog:uiDialog,window,shell,tabs,audit,apps:runtimeConfig.apps,language:()=>pickLanguage(settings.get('lang'),app.getLocale()),onState:()=>send('walletState',wallet?.status())});
 ipcMain.handle('eth:initial',event=>wallet.initial(event));ipcMain.handle('eth:request',(event,method,params)=>wallet.request(event,method,params));
 tabs.open();bounds();shortcuts(chrome.webContents);
 chrome.webContents.setWindowOpenHandler(()=>({action:'deny'}));chrome.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(here,'../ui/index.html')).href)event.preventDefault();});
 window.on('resize',bounds);window.on('closed',()=>{disposing=true;catalog.cancel();localPreview.stop();tabs.dispose();library.flush();store.flush();void wallet.stop().finally(()=>{if(!chrome.webContents.isDestroyed())chrome.webContents.close();app.quit();});});
 register('management',open=>{if(typeof open!=='boolean')throw new Error('Invalid panel state');managementOpen=open;bounds();});
 register('saveLanguage',lang=>{if(!['auto','zh','en'].includes(lang))throw new Error('Invalid language');settings.set('lang',lang);updateMenu();});
 register('localOpen',()=>localPreview.open());register('localInspect',()=>localPreview.inspect(tabs.state()?.url));register('localReveal',()=>localPreview.reveal(tabs.state()?.url));
 register('walletSwitch',()=>wallet.switchChain());
 register('siteBalance',async()=>{const state=tabs.state();if(!state?.container||state.offline)throw new Error('Online application required');const q=await quorum(runtimeConfig);return {wei:BigInt(await q.agree('eth_getBalance',[state.container,q.block])).toString(),block:q.number.toString()};});
 register('walletOpen',()=>wallet.open());register('walletDisconnect',()=>wallet.disconnect());register('walletRevoke',origin=>wallet.revoke(String(origin)));register('walletStatus',()=>wallet.status());
 register('catalog',()=>catalog.list());register('catalogRefresh',async()=>{const rows=await catalog.refresh();for(const row of rows)if(row.gateway)try{const release=await resolver(row,runtimeConfig);const metadata={...await catalogMetadata(release,content),publishedAt:release.publishedAt,publisher:release.publisher};Object.assign(row,metadata);catalog.metadata(row.container,metadata);}catch(error){row.metadataError=error.message;}return rows;});register('catalogCancel',()=>catalog.cancel());register('catalogOwners',()=>catalog.owners());register('ownedCircuits',()=>{const account=wallet.status().accounts[0];if(!account)throw new Error('请先连接钱包');return catalog.owned(account);});
 register('configureGateway',async({container,gateway,title})=>{const row=catalog.list().find(a=>a.container.toLowerCase()===String(container).toLowerCase());if(!row)throw new Error('应用未在 Registry 目录登记');const target={...row,gateway:safeOrigin(gateway),title:String(title||row.title).slice(0,200)};const result=await resolver(target,runtimeConfig);await content.manifest(result,{forceRemote:true});const index=runtimeConfig.apps.findIndex(a=>a.container.toLowerCase()===row.container.toLowerCase());if(index>=0)runtimeConfig.apps[index]=target;else runtimeConfig.apps.push(target);settings.set('gateways',runtimeConfig.apps);return target;});
 register('cacheUsage',async()=>({...await store.usage(),versions:store.siteEntries().filter(([key])=>/:v[1-9]\d*$/.test(key)).map(([,value])=>({container:value.container,version:value.version,title:value.title,cid:value.cid}))}));register('clearCache',async()=>{await store.clear();content.clear();});register('offlineOpen',container=>tabs.navigate('fab-cache:'+String(container)));
 register('checkSite',async()=>{const state=tabs.state();if(!state?.container||state.offline)throw new Error('请先在线打开 FAB 应用');const latest=await resolveApp({...state,requestedVersion:undefined},runtimeConfig),owners=await catalog.owners(),owner=owners.find(a=>a.container.toLowerCase()===state.container.toLowerCase())?.owner||null;const previous=settings.get('owners')||{},oldOwner=previous[state.container.toLowerCase()];settings.set('owners',{...previous,[state.container.toLowerCase()]:owner});return {latestVersion:latest.version,currentVersion:state.version,changed:latest.version!==state.version||latest.cid!==state.cid,owner,ownerChanged:!!oldOwner&&!!owner&&oldOwner.toLowerCase()!==owner.toLowerCase()};});
 register('siteInfo',async()=>{const state=tabs.state();if(!state?.container)throw new Error('请先打开 FAB 应用');const {value,source}=await content.manifest(state);return {...state,manifest:value,manifestSource:source,external:audit.externalOf(state.gateway),changes:audit.compare(state.gateway),cacheKey:releaseKey(state)};});
 register('siteAudit',async()=>{const state=tabs.state();if(!state?.container)throw new Error('请先打开 FAB 应用');const {value}=await content.manifest(state);return staticAudit({files:value.files.map(f=>({path:f.name,size:f.size})),read:async path=>(await content.file(state,path)).bytes});});
 register('settings',()=>({lang:settings.get('lang')||'auto',rpcs:runtimeConfig.rpcs,version:app.getVersion(),effectiveLanguage:pickLanguage(settings.get('lang'),app.getLocale())}));
 register('saveRpcs',async urls=>{const validated=validateRpcs(urls);const ids=await Promise.all(validated.map(url=>createRpc(()=>[url])('eth_chainId')));if(ids.some(id=>BigInt(id)!==196n))throw new Error('RPC 必须连接 X Layer 196');settings.setRpcs('xlayer',validated);runtimeConfig.rpcs=validated;});
 register('sidebar',open=>{if(typeof open!=='boolean')throw new Error('Invalid sidebar state');sidebarOpen=open;bounds();});
 register('initial',()=>{managementOpen=false;sidebarOpen=false;findOpen=false;bounds();return {apps:runtimeConfig.apps,developerCenter:config.developerCenter,history:library.history(),bookmarks:library.bookmarks(),...tabs.snapshot(),currentState:tabs.state()};});
 register('library',()=>({history:library.history(),bookmarks:library.bookmarks()}));
 register('removeHistory',value=>library.removeHistory(String(value)));register('removeBookmark',value=>library.removeBookmark(String(value)));register('clearHistory',()=>library.clearHistory());
 const bookmark=()=>tabs.state()?.status==='ready'&&library.toggleBookmark(tabs.state().container||tabs.state().url);
 register('bookmark',bookmark);
 register('navigate',value=>tabs.navigate(value));register('back',tabs.back);register('forward',tabs.forward);register('reload',tabs.reload);
 register('newTab',()=>tabs.open());register('closeTab',id=>tabs.close(id));register('activateTab',id=>tabs.activate(id));
 register('stop',tabs.stop);register('zoom',direction=>tabs.zoom(direction));register('find',(text,options)=>tabs.find(text,options));register('stopFind',tabs.stopFind);
 register('findOpen',open=>{if(typeof open!=='boolean')throw new Error('Invalid find state');findOpen=open;if(!open)tabs.stopFind();bounds();});
 const developer=async()=>{const u=new URL(config.developerCenter);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Invalid developer center');await shell.openExternal(u.href);};
 register('developer',developer);
 const updateMenu=()=>installBrowserMenu({Menu,app,window,tabs,focusAddress:()=>{chrome.webContents.focus();send('focusAddress');},showFind:(again=false,forward=true)=>{chrome.webContents.focus();send('showFind',{again,forward});},showLibrary:()=>send('showLibrary'),bookmark:()=>{bookmark();send('libraryChanged');},developer,tr:createTranslator(pickLanguage(settings.get('lang'),app.getLocale())),openFolder:()=>localPreview.open(),showSettings:()=>send('showSettings')});updateMenu();
 deepLinks.ready();
 await chrome.webContents.loadFile(path.join(here,'../ui/index.html'));
 if(smoke)await runSmoke({app,window,chrome,getSite:tabs.site,getState:tabs.state,output:smokeDir,controls:smokeControls,walletBridgeURL:()=>`http://127.0.0.1:${settings.get('bridgePort')}/?t=${settings.get('bridgeToken')}`} );
}).catch(error=>{console.error(error);app.exit(1);});
app.on('window-all-closed',()=>{if(!disposing)app.quit();});
