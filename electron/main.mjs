import {app,BaseWindow,WebContentsView,ipcMain,session,shell,Menu,clipboard} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createApplicationTabs} from './application-tabs.mjs';
import {installBrowserMenu} from './browser-menu.mjs';
import {attachContextMenu} from './context-menu.mjs';
import {runSmoke} from './smoke.mjs';
import {desktopLayout} from '../src/desktop-layout.mjs';
import {config} from '../src/config.mjs';
import {parseBrowserTarget,safeOrigin,allowedNavigation} from '../src/navigation.mjs';
import {resolveApp} from '../src/resolver.mjs';
import {createLibrary} from '../src/library.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const smoke=process.argv.includes('--fab-smoke');
const smokeDir=process.env.FAB_SMOKE_OUTPUT||(app.isPackaged?path.join(app.getPath('userData'),'smoke-artifacts'):path.join(here,'../artifacts'));
if(smoke)setTimeout(()=>app.exit(1),120000).unref();
let window,chrome,tabs,library,sidebarOpen=false,findOpen=false;
const send=(name,data)=>chrome.webContents.send(name,data);
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
app.whenReady().then(async()=>{
 library=createLibrary(path.join(app.getPath('userData'),'fab-library.json'),{apps:config.apps});
 window=new BaseWindow({width:1280,height:900,minWidth:390,minHeight:500,title:'FAB DeWEB Browser'});
 chrome=new WebContentsView({webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 window.contentView.addChildView(chrome);
 tabs=createApplicationTabs({window,WebContentsView,session,config,resolveApp,parseTarget:parseBrowserTarget,safeOrigin,allowedNavigation,library,smoke,onChange:data=>send('tabs',data),onState:data=>send('state',data),onFind:data=>send('findResult',data),getLayout:()=>{const geometry=desktopLayout(...window.getContentSize(),sidebarOpen);if(findOpen){geometry.application.y+=44;geometry.application.height=Math.max(1,geometry.application.height-44);}return geometry;},onView:view=>{shortcuts(view.webContents);attachContextMenu({view,window,Menu,clipboard,tabs});}});
 tabs.open();bounds();shortcuts(chrome.webContents);
 chrome.webContents.setWindowOpenHandler(()=>({action:'deny'}));chrome.webContents.on('will-navigate',event=>event.preventDefault());
 window.on('resize',bounds);window.on('closed',()=>{tabs.dispose();if(!chrome.webContents.isDestroyed())chrome.webContents.close();library.flush();app.quit();});
 register('sidebar',open=>{if(typeof open!=='boolean')throw new Error('Invalid sidebar state');sidebarOpen=open;bounds();});
 register('initial',()=>({apps:config.apps,developerCenter:config.developerCenter,history:library.history(),bookmarks:library.bookmarks(),...tabs.snapshot()}));
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
 installBrowserMenu({Menu,app,window,tabs,focusAddress:()=>{chrome.webContents.focus();send('focusAddress');},showFind:(again=false,forward=true)=>{chrome.webContents.focus();send('showFind',{again,forward});},showLibrary:()=>send('showLibrary'),bookmark:()=>{bookmark();send('libraryChanged');},developer});
 await chrome.webContents.loadFile(path.join(here,'../ui/index.html'));
 if(smoke)await runSmoke({app,window,chrome,getSite:tabs.site,getState:tabs.state,output:smokeDir});
}).catch(error=>{console.error(error);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
