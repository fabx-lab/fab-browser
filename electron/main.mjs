// TapeKit's two-view/session boundary adapted for FAB HTTPS CID releases; UPSTREAM.md.
import {app, BaseWindow, WebContentsView, ipcMain, session, shell, Menu} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runSmoke} from './smoke.mjs';
import {desktopLayout} from '../src/desktop-layout.mjs';
import {config} from '../src/config.mjs';
import {parseTarget, safeOrigin, allowedNavigation} from '../src/navigation.mjs';
import {resolveApp} from '../src/resolver.mjs';
import {createLibrary} from '../src/library.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const smoke = process.argv.includes('--fab-smoke');
const smokeDir = process.env.FAB_SMOKE_OUTPUT || (app.isPackaged ? path.join(app.getPath('userData'),'smoke-artifacts') : path.join(here,'../artifacts'));
if (smoke) setTimeout(() => app.exit(1), 120000).unref();
let window, chrome, site, current, library, requestId = 0, lastTarget, sidebarOpen=false, siteReady=false, lastState;
const state = data => {lastState=data;chrome.webContents.send('state',data);};
const isUI = event => event.sender === chrome.webContents && event.senderFrame === chrome.webContents.mainFrame;
function register(name, action) { ipcMain.handle(name, (event, ...args) => { if (!isUI(event)) throw new Error('Untrusted IPC sender'); return action(...args); }); }
function bounds() {
  const [width, height] = window.getContentSize();
  chrome.setBounds({x:0,y:0,width,height});
  const layout=desktopLayout(width,height,sidebarOpen);
  site?.setBounds(layout.application);
  site?.setVisible(siteReady&&!layout.hideApplication);
}
async function navigate(raw) {
  lastTarget = raw;
  const id = ++requestId;
  siteReady=false;site?.setVisible(false);
  state({status:'loading', message:'正在核对 X Layer 双 RPC…'});
  try {
    const target = parseTarget(raw, config.apps);
    const resolved = await resolveApp(target, config);
    if (id !== requestId) return;
    site?.webContents.close();
    if (site) window.contentView.removeChildView(site);
    const partition = `${smoke ? "fab-smoke-" : "persist:fab-"}${config.chainId}-${target.container.toLowerCase()}`;
    const isolated = session.fromPartition(partition);
    isolated.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    const origin = safeOrigin(target.gateway);
    isolated.webRequest.onBeforeRequest((details, callback) => callback({cancel: !allowedNavigation(details.url, origin, resolved.version)}));
    site = new WebContentsView({webPreferences:{session:isolated, nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true, devTools:!app.isPackaged}});
    const view = site;
    const active = () => id === requestId && site === view;
    window.contentView.addChildView(site); bounds(); current = resolved;
    site.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    site.webContents.on('will-navigate', (event,url) => { if (!allowedNavigation(url,origin,resolved.version)) {event.preventDefault(); if(active()) state({...resolved,status:'ready',message:'已阻止离开当前应用版本的导航'});} });
    site.webContents.on('will-redirect', (event,url) => { if (!allowedNavigation(url,origin,resolved.version)) event.preventDefault(); });
    site.webContents.on('will-attach-webview', event => event.preventDefault());
    site.webContents.on('did-fail-load', (_event,code,description,_url,mainFrame) => {if(mainFrame && active()) state({...resolved,status:'error',message:`应用加载失败 ${code}: ${description}`});});
    await site.webContents.loadURL(resolved.url);
    if (id === requestId) {siteReady=true;bounds();library.visit(target.container);}
    if (id === requestId) state({...resolved,status:'ready',message:resolved.verification});
  } catch(error) {if(id===requestId) state({status:'error',message:error.message});}
}
app.whenReady().then(async () => {
Menu.setApplicationMenu(null);
library=createLibrary(path.join(app.getPath('userData'),'fab-library.json'),{apps:config.apps});
window = new BaseWindow({width:1280,height:900,minWidth:390,minHeight:500,title:'FAB DeWEB Browser'});
chrome = new WebContentsView({webPreferences:{preload:path.join(here,'preload.cjs'), nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
window.contentView.addChildView(chrome); bounds();
chrome.webContents.setWindowOpenHandler(() => ({action:'deny'}));
chrome.webContents.on('will-navigate',event=>event.preventDefault());
window.on('resize',bounds);
window.on('closed',()=>{chrome.webContents.close();site?.webContents.close();library.flush();app.quit();});
register('sidebar',open=>{if(typeof open!=='boolean')throw new Error('Invalid sidebar state');sidebarOpen=open;bounds();});
register('initial',()=>({apps:config.apps,developerCenter:config.developerCenter,history:library.history(),bookmarks:library.bookmarks()}));
register('library',()=>({history:library.history(),bookmarks:library.bookmarks()}));
register('bookmark',()=>current && library.toggleBookmark(current.container));
register('navigate',navigate);
register('back',()=>{if(site?.webContents.navigationHistory.canGoBack()) site.webContents.navigationHistory.goBack();});
register('forward',()=>{if(site?.webContents.navigationHistory.canGoForward()) site.webContents.navigationHistory.goForward();});
register('reload',()=>lastTarget && navigate(lastTarget)); // Refresh re-resolves newest binding.
register('developer',async()=>{const u=new URL(config.developerCenter);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Invalid developer center');await shell.openExternal(u.href);});
await chrome.webContents.loadFile(path.join(here,'../ui/index.html'));
if(smoke) await runSmoke({app,window,chrome,getSite:()=>site,getState:()=>lastState,output:smokeDir});
}).catch(error => {console.error(error);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
