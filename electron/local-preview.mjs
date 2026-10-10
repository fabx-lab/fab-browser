import {createLocalSites} from '../src/local-site.mjs';
import {normalizePath} from '../src/local-path.mjs';
import {precheck} from '../src/precheck.mjs';
import {audit} from '../src/safety.mjs';
import {watch} from 'node:fs';
import {extname} from 'node:path';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.wasm':'application/wasm'};
export function createLocalPreview({dialog,window,shell,getTabs,onReport}){
 const sites=createLocalSites(),sessions=new WeakSet(),watchers=new Map();
 function parse(raw){const url=new URL(raw);const root=sites.rootOf(url.href);if(url.protocol!=='fab-local:'||!root||url.username||url.password)throw new Error('Unknown preview directory');return {kind:'local',url:url.href,title:'本地预览',localHost:url.host};}
 async function registerSession(session){if(sessions.has(session))return;sessions.add(session);session.protocol.handle('fab-local',async request=>{try{const url=new URL(request.url),root=sites.rootOf(url.href);if(!root)return new Response('Unknown preview',{status:404});const path=normalizePath(url.pathname),file=await sites.readLocal(root,path);return file?new Response(file.bytes,{headers:{'content-type':types[extname(path)]||'application/octet-stream','x-content-type-options':'nosniff'}}):new Response('Not found',{status:404});}catch{return new Response('Invalid preview path',{status:400});}});}
 async function inspect(url){const root=sites.rootOf(url);if(!root)throw new Error('Select a local preview first');const listed=await sites.list(root),input={...listed,read:path=>sites.bytesOf(root,path)};return {kind:'local',precheck:await precheck(input),safety:await audit({...input,extraSkipped:listed.skipped}),notice:'静态检查不能证明网站安全；未检查项见覆盖范围。IPFS 上传与链上绑定请在开发者中心完成。'};}
 async function open(){const result=await dialog.showOpenDialog(window,{properties:['openDirectory'],title:'选择网站构建目录'});if(result.canceled)return;const site=await sites.add(result.filePaths[0]);getTabs().open(site.url);if(!watchers.has(site.id)){let timer;try{const watcher=watch(site.root,{recursive:true},()=>{clearTimeout(timer);timer=setTimeout(()=>{for(const tab of getTabs().snapshot().tabs)if(tab.target.startsWith(site.url))void getTabs().navigate(tab.target,tab.id);},150);});watchers.set(site.id,{watcher,close:()=>{clearTimeout(timer);watcher.close();}});}catch(error){onReport({error:`自动刷新不可用：${error.message}`});}}
  onReport(await inspect(site.url));
 }
 return {parse,registerSession,open,inspect,reveal:url=>{const root=sites.rootOf(url);if(!root)throw new Error('No local preview selected');return shell.openPath(root);},sync(){const activeHosts=new Set(getTabs().snapshot().tabs.filter(t=>t.target.startsWith('fab-local:')).map(t=>new URL(t.target).hostname.replace('local-','')));for(const [id,watcher]of watchers)if(!activeHosts.has(id)){watcher.close();watchers.delete(id);}},stop(){for(const w of watchers.values())w.close();watchers.clear();}};
}
