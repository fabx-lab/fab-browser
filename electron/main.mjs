import {app,BaseWindow,WebContentsView,ipcMain,session,shell,Menu,clipboard,dialog,protocol,nativeTheme} from 'electron';
import {fileURLToPath} from 'node:url';
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
import {addTemplateApps,storeRows} from '../src/store.mjs';
import {createContentStore} from '../src/content-store.mjs';
import {createReleaseContent,releaseKey} from '../src/release-content.mjs';
import {createReleaseSessions} from './release-session.mjs';
import {createPageAudit} from '../src/page-audit.mjs';
import {audit as staticAudit} from '../src/safety.mjs';
import {mkdtempSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {fetchIcon} from '../src/favicon.mjs';
import {tmpdir} from 'node:os';
protocol.registerSchemesAsPrivileged([{scheme:'fab-local',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const here=path.dirname(fileURLToPath(import.meta.url));
const smoke=process.argv.includes('--fab-smoke');
if(smoke)app.setPath('userData',mkdtempSync(path.join(tmpdir(),'fab-browser-smoke-')));
const smokeDir=process.env.FAB_SMOKE_OUTPUT||(app.isPackaged?path.join(app.getPath('userData'),'smoke-artifacts'):path.join(here,'../artifacts'));
if(smoke)setTimeout(()=>app.exit(1),240000).unref();
// A smoke window may sit behind other windows on a working desktop; keep its pages painting anyway.
if(smoke){app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-renderer-backgrounding');}
let refreshStore=async()=>{},window,chrome,tabs,library,wallet,settings,runtimeConfig,localPreview,sidebarOpen=true,findOpen=false,managementOpen=false,welcomeOpen=false,walletCover=false;
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
 // Saved gateways belong to the Registry they were verified against; drop any other.
 for(const saved of Array.isArray(settings.get('gateways'))?settings.get('gateways'):[]){try{safeOrigin(saved.gateway);if(String(saved.registry).toLowerCase()!==config.registry.toLowerCase())continue;if(!/^0x[0-9a-f]{40}$/i.test(saved.container)||!/^0x[0-9a-f]{40}$/i.test(saved.circuits)||!/^\d+$/.test(saved.tokenId))continue;const index=runtimeConfig.apps.findIndex(a=>a.container.toLowerCase()===saved.container.toLowerCase());if(index>=0)runtimeConfig.apps[index]=saved;else runtimeConfig.apps.push(saved);}catch{}}
 const store=createContentStore(path.join(app.getPath('userData'),'content-cache')),audit=createPageAudit(settings.baselines);
 const content=createReleaseContent({store,onFile:(release,file,sha)=>audit.file(release.gateway,file,sha)}),releaseSessions=createReleaseSessions(content);
 const siteKey=container=>`${runtimeConfig.chainId}:${runtimeConfig.registry.toLowerCase()}:${container.toLowerCase()}`;
 const resolver=async(target,cfg)=>{const key=siteKey(target.container);if(target.offline){const cached=store.lastSite(target.cachedVersion?`${key}:v${target.cachedVersion}`:key);if(!cached)throw new Error('没有此应用的历史缓存');return {...cached,offline:true,verification:'历史缓存 · 当前链上版本和所有权尚未核验'};}const result=await resolveApp(target,cfg);store.rememberSite(`${key}:v${result.version}`,result);if(!target.requestedVersion)store.rememberSite(key,result);return result;};

 const catalog=createCatalog({file:path.join(app.getPath('userData'),'fab-catalog.json'),config:runtimeConfig,seedFile:path.join(here,'../src/catalog-seed.json'),onProgress:data=>send('catalogProgress',data)});
 addTemplateApps(runtimeConfig.apps,catalog.list(),config.gatewayTemplate);
 library=createLibrary(path.join(app.getPath('userData'),'fab-library.json'),{apps:runtimeConfig.apps});
 const appearances=['system','light','dark'];nativeTheme.themeSource=appearances.includes(settings.get('appearance'))?settings.get('appearance'):'system';
 sidebarOpen=settings.get('sidebar')!==false;welcomeOpen=settings.get('welcomed')!==true;
 // Search's frame: no title bar of its own; on macOS the traffic lights sit in the tab column or the folded bar.
 window=new BaseWindow({width:1280,height:900,minWidth:390,minHeight:500,title:'FAB DeWEB Browser',backgroundColor:nativeTheme.shouldUseDarkColors?'#1c1c1c':'#ffffff',...(process.platform==='darwin'?{titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:15}}:{})});
 chrome=new WebContentsView({webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 window.contentView.addChildView(chrome);
 localPreview=createLocalPreview({dialog:uiDialog,window,shell,getTabs:()=>tabs,onReport:report=>send('localReport',report)});
 tabs=createApplicationTabs({window,WebContentsView,session,config:runtimeConfig,resolveApp:resolver,audit,parseTarget:(raw,apps)=>String(raw).startsWith('fab-cache:')?parseCachedTarget(raw,apps):String(raw).startsWith('fab-local:')?localPreview.parse(raw):parseBrowserTarget(raw,apps),safeOrigin,allowedNavigation,library,preload:path.join(here,'site-preload.cjs'),onSession:async(s,target,resolved)=>{await localPreview.registerSession(s);await releaseSessions(s,target,resolved);},smoke,onChange:data=>{send('tabs',data);localPreview.sync();if(data.tabs.filter(tab=>tab.icon&&tab.status==='ready'&&tab.kind!=='local').map(tab=>library.pinIcon(tab.container||tab.url,tab.icon)).some(Boolean))send('libraryChanged');},onState:data=>send('state',data),onFind:data=>send('findResult',data),getLayout:()=>{const geometry=desktopLayout(...window.getContentSize(),{sidebar:sidebarOpen,find:findOpen});if(managementOpen||welcomeOpen||walletCover)geometry.hideApplication=true;return geometry;},onView:view=>{shortcuts(view.webContents);attachContextMenu({view,window,Menu,clipboard,tabs});}});
 wallet=await createWalletService({settings,staticDir:path.join(here,'../bridge'),rpc:createRpc(()=>runtimeConfig.rpcs),dialog:uiDialog,window,shell,tabs,audit,apps:runtimeConfig.apps,walletFile:path.join(app.getPath('userData'),'fab-wallet.json'),showWallet:()=>{chrome.webContents.focus();send('showWallet');},language:()=>pickLanguage(settings.get('lang'),app.getLocale()),onState:()=>send('walletState',wallet?.status())});
 ipcMain.handle('eth:initial',event=>wallet.initial(event));ipcMain.handle('eth:request',(event,method,params)=>wallet.request(event,method,params));
 tabs.open();bounds();shortcuts(chrome.webContents);
 // Use Chromium's loaded URL, including its platform-specific file URL spelling.
 let shellURL;
 chrome.webContents.setWindowOpenHandler(()=>({action:'deny'}));chrome.webContents.on('will-navigate',(event,url)=>{if(!shellURL||url!==shellURL)event.preventDefault();});
 window.on('resize',bounds);window.on('closed',()=>{disposing=true;catalog.cancel();localPreview.stop();tabs.dispose();library.flush();store.flush();void wallet.stop().finally(()=>{if(!chrome.webContents.isDestroyed())chrome.webContents.close();app.quit();});});
 register('management',open=>{if(typeof open!=='boolean')throw new Error('Invalid panel state');managementOpen=open;bounds();});
 // The wallet panel hides the page on its own flag, so closing settings never uncovers it.
 register('walletCover',open=>{if(typeof open!=='boolean')throw new Error('Invalid panel state');walletCover=open;bounds();});
 register('saveLanguage',lang=>{if(!['auto','zh','en'].includes(lang))throw new Error('Invalid language');settings.set('lang',lang);updateMenu();});
 register('localOpen',()=>localPreview.open());register('localInspect',()=>localPreview.inspect(tabs.state()?.url));register('localReveal',()=>localPreview.reveal(tabs.state()?.url));
 register('walletSwitch',()=>wallet.switchChain());
 register('siteBalance',async()=>{const state=tabs.state();if(!state?.container||state.offline)throw new Error('Online application required');const q=await quorum(runtimeConfig);return {wei:BigInt(await q.agree('eth_getBalance',[state.container,q.block])).toString(),block:q.number.toString()};});
 register('walletOpen',()=>wallet.open());
 // Built-in wallet: secrets cross IPC only from the trusted shell, never from site content.
 register('walletCreate',password=>wallet.create(String(password)));register('walletImport',(secret,password)=>wallet.import(String(secret),String(password)));register('walletUnlock',password=>wallet.unlock(String(password)));register('walletLock',()=>wallet.lock());register('walletReveal',password=>wallet.reveal(String(password)));register('walletForget',()=>wallet.forget());register('walletBalance',()=>wallet.balance());
 register('walletDisconnect',()=>wallet.disconnect());register('walletRevoke',origin=>wallet.revoke(String(origin)));register('walletStatus',()=>wallet.status());
 // What a release says about itself, read from its verified files and kept with the catalog.
 const describe=async row=>{const release=await resolver(row,runtimeConfig);const metadata={...await catalogMetadata(release,content),publishedAt:release.publishedAt,publisher:release.publisher};Object.assign(row,metadata);catalog.metadata(row.container,metadata);
  // Apps reached through the template take the name their release declares; configured titles stay.
  const app=runtimeConfig.apps.find((a,i)=>i>=config.apps.length&&a.container.toLowerCase()===row.container.toLowerCase());if(app&&metadata.name)app.title=metadata.name;
  return metadata;};
 register('catalog',()=>catalog.list());register('catalogRefresh',async()=>{const rows=await catalog.refresh();addTemplateApps(runtimeConfig.apps,rows,config.gatewayTemplate);for(const row of catalog.list())if(row.gateway)try{await describe(row);}catch(error){row.metadataError=error.message;}return catalog.list();});
 // The storefront: new publications are scanned in the background, then each app is described once per version.
 const undescribed=new Set();
 register('store',()=>storeRows(catalog.list(),runtimeConfig.apps,config.icons,config.apps.length,undescribed));
 refreshStore=async()=>{try{await catalog.refresh();}catch{}addTemplateApps(runtimeConfig.apps,catalog.list(),config.gatewayTemplate);send('storeChanged');
  const queue=catalog.list().filter(row=>row.gateway&&row.metadata?.version!==String(row.version));
  await Promise.all(Array.from({length:6},async()=>{for(let row;(row=queue.shift());){if(disposing)return;try{await describe(row);}catch{undescribed.add(row.container.toLowerCase());}send('storeChanged');}}));};register('catalogCancel',()=>catalog.cancel());register('catalogOwners',()=>catalog.owners());register('ownedCircuits',()=>{const account=wallet.status().accounts[0];if(!account)throw new Error('请先连接钱包');return catalog.owned(account);});
 register('configureGateway',async({container,gateway,title})=>{const row=catalog.list().find(a=>a.container.toLowerCase()===String(container).toLowerCase());if(!row)throw new Error('应用未在 Registry 目录登记');const target={...row,gateway:safeOrigin(gateway),title:String(title||row.title).slice(0,200)};const result=await resolver(target,runtimeConfig);await content.manifest(result,{forceRemote:true});const index=runtimeConfig.apps.findIndex(a=>a.container.toLowerCase()===row.container.toLowerCase());if(index>=0)runtimeConfig.apps[index]=target;else runtimeConfig.apps.push(target);settings.set('gateways',runtimeConfig.apps.map(row=>({...row,registry:runtimeConfig.registry})));return target;});
 register('cacheUsage',async()=>({...await store.usage(),versions:store.siteEntries().filter(([key])=>/:v[1-9]\d*$/.test(key)).map(([,value])=>({container:value.container,version:value.version,title:value.title,cid:value.cid}))}));register('clearCache',async()=>{await store.clear();content.clear();});register('offlineOpen',container=>tabs.navigate('fab-cache:'+String(container)));
 register('checkSite',async()=>{const state=tabs.state();if(!state?.container||state.offline)throw new Error('请先在线打开 FAB 应用');const latest=await resolveApp({...state,requestedVersion:undefined},runtimeConfig),owners=await catalog.owners(),owner=owners.find(a=>a.container.toLowerCase()===state.container.toLowerCase())?.owner||null;const previous=settings.get('owners')||{},oldOwner=previous[state.container.toLowerCase()];settings.set('owners',{...previous,[state.container.toLowerCase()]:owner});return {latestVersion:latest.version,currentVersion:state.version,changed:latest.version!==state.version||latest.cid!==state.cid,owner,ownerChanged:!!oldOwner&&!!owner&&oldOwner.toLowerCase()!==owner.toLowerCase()};});
 register('siteInfo',async()=>{const state=tabs.state();if(!state?.container)throw new Error('请先打开 FAB 应用');const {value,source}=await content.manifest(state);return {...state,manifest:value,manifestSource:source,external:audit.externalOf(state.gateway),changes:audit.compare(state.gateway),cacheKey:releaseKey(state)};});
 register('siteAudit',async()=>{const state=tabs.state();if(!state?.container)throw new Error('请先打开 FAB 应用');const {value}=await content.manifest(state);return staticAudit({files:value.files.map(f=>({path:f.name,size:f.size})),read:async path=>(await content.file(state,path)).bytes});});
 register('settings',()=>({lang:settings.get('lang')||'auto',appearance:nativeTheme.themeSource,welcomed:settings.get('welcomed')===true,rpcs:runtimeConfig.rpcs,version:app.getVersion(),effectiveLanguage:pickLanguage(settings.get('lang'),app.getLocale())}));
 register('saveRpcs',async urls=>{const validated=validateRpcs(urls);const ids=await Promise.all(validated.map(url=>createRpc(()=>[url])('eth_chainId')));if(ids.some(id=>BigInt(id)!==196n))throw new Error('RPC 必须连接 X Layer 196');settings.setRpcs('xlayer',validated);runtimeConfig.rpcs=validated;});
 register('sidebar',(open,remember=true)=>{if(typeof open!=='boolean')throw new Error('Invalid sidebar state');sidebarOpen=open;if(remember===true)settings.set('sidebar',open);bounds();});
 register('welcome',done=>{if(done===true)settings.set('welcomed',true);welcomeOpen=done!==true;bounds();});
 register('saveAppearance',value=>{if(!appearances.includes(value))throw new Error('Invalid appearance');settings.set('appearance',value);nativeTheme.themeSource=value;});
 register('initial',()=>{managementOpen=false;walletCover=false;sidebarOpen=settings.get('sidebar')!==false;welcomeOpen=settings.get('welcomed')!==true;findOpen=false;bounds();return {platform:process.platform,sidebar:sidebarOpen,welcomed:!welcomeOpen,apps:runtimeConfig.apps,pinned:config.apps.length,developerCenter:config.developerCenter,history:library.history(),bookmarks:library.bookmarks(),...tabs.snapshot(),currentState:tabs.state()};});
 register('library',()=>({history:library.history(),bookmarks:library.bookmarks(),pins:library.pins()}));
 // Pins: a tab's right-click menu pins its site, a pin's own menu unpins it. Native menus only.
 const tr=()=>createTranslator(pickLanguage(settings.get('lang'),app.getLocale()));
 const pinKey=tab=>tab?.status==='ready'&&tab.kind!=='local'?tab.container||tab.url:'';
 // Each tile shows a logo: a bundled app icon, or the site's own icon links fetched without credentials.
 const iconSession=session.fromPartition(smoke?'fab-smoke-icons':'persist:fab-icons');iconSession.setPermissionRequestHandler((_wc,_p,callback)=>callback(false));
 const fetching=new Set();
 const pinLogos=()=>Promise.all(library.pins().filter(p=>!p.icon&&!fetching.has(p.container)).map(async p=>{fetching.add(p.container);try{
  const bundled=config.icons?.[p.container.toLowerCase()];
  const icon=bundled?`data:image/png;base64,${(await readFile(path.join(here,`../ui/apps/${bundled}.png`))).toString('base64')}`:p.kind==='web'?await fetchIcon(p.container,{fetch:(url,init)=>iconSession.fetch(url,init)}):'';
  if(icon&&library.pinIcon(p.container,icon,{replace:true}))send('libraryChanged');
 }catch{}finally{fetching.delete(p.container);}}));
 const pinsChanged=()=>{send('libraryChanged');void pinLogos();};
 register('tabMenu',id=>{const tab=tabs.snapshot().tabs.find(t=>t.id===id);if(!tab)throw new Error('Unknown tab');const key=pinKey(tab),pinned=!!key&&library.isPinned(key),t=tr();
  Menu.buildFromTemplate([{label:t(pinned?'取消固定':'固定'),enabled:!!key,click:()=>{if(pinned)library.unpin(key);else library.pin(key,{title:tab.title});pinsChanged();}},{type:'separator'},{label:t('关闭标签页'),click:()=>tabs.close(id)}]).popup({window});});
 register('pinMenu',container=>{const key=String(container);if(!library.isPinned(key))throw new Error('Unknown pin');const t=tr();
  Menu.buildFromTemplate([{label:t('在新标签页打开'),click:()=>tabs.open(key)},{type:'separator'},{label:t('取消固定'),click:()=>{library.unpin(key);pinsChanged();}}]).popup({window});});
 register('removeHistory',value=>library.removeHistory(String(value)));register('removeBookmark',value=>library.removeBookmark(String(value)));register('clearHistory',()=>library.clearHistory());
 const bookmark=()=>tabs.state()?.status==='ready'&&library.toggleBookmark(tabs.state().container||tabs.state().url);
 register('bookmark',bookmark);
 register('navigate',value=>tabs.navigate(value));register('back',tabs.back);register('forward',tabs.forward);register('reload',tabs.reload);
 register('newTab',()=>tabs.open());register('openTab',value=>{tabs.open(String(value));});register('closeTab',id=>tabs.close(id));register('activateTab',id=>tabs.activate(id));
 register('stop',tabs.stop);register('zoom',direction=>tabs.zoom(direction));register('find',(text,options)=>tabs.find(text,options));register('stopFind',tabs.stopFind);
 register('findOpen',open=>{if(typeof open!=='boolean')throw new Error('Invalid find state');findOpen=open;if(!open)tabs.stopFind();bounds();});
 const developer=async()=>{const u=new URL(config.developerCenter);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Invalid developer center');await shell.openExternal(u.href);};
 register('developer',developer);
 const updateMenu=()=>installBrowserMenu({Menu,app,window,tabs,focusAddress:()=>{chrome.webContents.focus();send('focusAddress');},showFind:(again=false,forward=true)=>{chrome.webContents.focus();send('showFind',{again,forward});},showLibrary:()=>send('showLibrary'),bookmark:()=>{bookmark();send('libraryChanged');},developer,tr:createTranslator(pickLanguage(settings.get('lang'),app.getLocale())),openFolder:()=>localPreview.open(),showSettings:()=>send('showSettings'),toggleSidebar:()=>send('toggleSidebar'),showWelcome:()=>{chrome.webContents.focus();send('showWelcome');}});updateMenu();
 deepLinks.ready();
 await chrome.webContents.loadFile(path.join(here,'../ui/index.html'));
 void pinLogos();
 shellURL=chrome.webContents.getURL();
 void refreshStore();
 if(smoke)await runSmoke({app,window,chrome,getSite:tabs.site,getState:tabs.state,output:smokeDir,controls:smokeControls,walletBridgeURL:()=>`http://127.0.0.1:${settings.get('bridgePort')}/?t=${settings.get('bridgeToken')}`} );
}).catch(error=>{console.error(error);app.exit(1);});
app.on('window-all-closed',()=>{if(!disposing)app.quit();});
