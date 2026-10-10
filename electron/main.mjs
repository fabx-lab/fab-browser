// TapeKit's two-view/session boundary adapted for FAB HTTPS CID releases; UPSTREAM.md.
import {app, BaseWindow, WebContentsView, ipcMain, session, shell, Menu} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {config} from '../src/config.mjs';
import {parseTarget, safeOrigin, allowedNavigation} from '../src/navigation.mjs';
import {resolveApp} from '../src/resolver.mjs';
import {createLibrary} from '../src/library.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const smoke = process.argv.includes('--fab-smoke');
const smokeDir = process.env.FAB_SMOKE_OUTPUT || (app.isPackaged ? path.join(app.getPath('userData'),'smoke-artifacts') : path.join(here,'../artifacts'));
if (smoke) setTimeout(() => app.exit(1), 120000).unref();
let window, chrome, site, current, library, requestId = 0, lastTarget;
const state = data => chrome.webContents.send('state', data);
const isUI = event => event.sender === chrome.webContents && event.senderFrame === chrome.webContents.mainFrame;
function register(name, action) { ipcMain.handle(name, (event, ...args) => { if (!isUI(event)) throw new Error('Untrusted IPC sender'); return action(...args); }); }
function bounds() {
  const [width, height] = window.getContentSize();
  chrome.setBounds({x:0,y:0,width,height});
  site?.setBounds({x:0,y:210,width,height:Math.max(1,height-210)});
}
async function navigate(raw) {
  lastTarget = raw;
  const id = ++requestId;
  site?.setVisible(false);
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
    if (id === requestId) {site.setVisible(true);library.visit(target.container);}
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
register('initial',()=>({apps:config.apps,developerCenter:config.developerCenter,history:library.history(),bookmarks:library.bookmarks()}));
register('library',()=>({history:library.history(),bookmarks:library.bookmarks()}));
register('bookmark',()=>current && library.toggleBookmark(current.container));
register('navigate',navigate);
register('back',()=>{if(site?.webContents.navigationHistory.canGoBack()) site.webContents.navigationHistory.goBack();});
register('forward',()=>{if(site?.webContents.navigationHistory.canGoForward()) site.webContents.navigationHistory.goForward();});
register('reload',()=>lastTarget && navigate(lastTarget)); // Refresh re-resolves newest binding.
register('developer',async()=>{const u=new URL(config.developerCenter);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Invalid developer center');await shell.openExternal(u.href);});
await chrome.webContents.loadFile(path.join(here,'../ui/index.html'));
if(smoke) {
  const stamp=Date.now();
  const report = {started:true,packaged:app.isPackaged,platform:process.platform,arch:process.arch,electron:process.versions.electron,chromium:process.versions.chrome};
  try {
    await navigate(config.apps[0].container);
    report.state=current ?? null;
    if(site) {
      report.page=await site.webContents.executeJavaScript('({title:document.title,cells:document.querySelectorAll(".cell").length,node:typeof require,bridge:typeof window.fabBrowser,ethereum:typeof window.ethereum})');
      report.localGame = await site.webContents.executeJavaScript(`(async()=>{document.querySelector('#local').click();await new Promise(r=>setTimeout(r,100));for(const n of [0,15,1,16,2,17,3,18,4])document.querySelectorAll('.cell')[n].click();const result={black:document.querySelectorAll('#board .stone.black').length,white:document.querySelectorAll('#board .stone.white').length,status:document.querySelector('#status').textContent};document.querySelector('#restart').click();await new Promise(r=>setTimeout(r,100));result.reset=document.querySelectorAll('#board .stone').length===0;return result;})()`);
      report.game = await site.webContents.executeJavaScript(`(async()=>{document.querySelector('#ai').click();document.querySelectorAll('.cell')[112].click();const deadline=Date.now()+10000;while(!document.querySelector('#board .stone.white')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));return {black:document.querySelectorAll('#board .stone.black').length,white:document.querySelectorAll('#board .stone.white').length};})()`);
      report.isolation = await site.webContents.executeJavaScript(`(async()=>{try{await fetch('https://example.com');return {externalFetchBlocked:false};}catch{return {externalFetchBlocked:true};}})()`);
      const image=await site.webContents.capturePage();
      await fs.mkdir(smokeDir,{recursive:true});
      await fs.writeFile(path.join(smokeDir,'desktop-smoke.png'),image.toPNG());
    }
  } catch(error) {report.error=error.message;}
  await fs.mkdir(smokeDir,{recursive:true});
  await fs.writeFile(path.join(smokeDir,'desktop-smoke.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(smokeDir,`desktop-smoke-${stamp}.json`),JSON.stringify(report,null,2));
  if(report.page) await fs.copyFile(path.join(smokeDir,'desktop-smoke.png'),path.join(smokeDir,`desktop-smoke-${stamp}.png`));
  app.exit(report.page?.cells===225 && report.page.node==='undefined' && report.page.bridge==='undefined' && report.game?.black===1 && report.game?.white===1 && report.localGame?.black===5 && report.localGame?.white===4 && report.localGame?.status.includes("黑") && report.localGame?.reset && report.isolation?.externalFetchBlocked ? 0 : 1);
}
}).catch(error => {console.error(error);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
