import {createBridgeServer} from '../src/bridge-server.mjs';
import {createProviderHost,homeNetwork} from '../src/provider-host.mjs';
import {createTranslator,translateRendered} from '../src/i18n.mjs';
import {createAnalyzer} from '../src/risk.mjs';

const navigationEpochs=new WeakMap();
// The main process derives provenance from the actual frame, never page parameters.
export function walletFrame(event,tabs){
 if(!tabs.owns(event.sender)||event.senderFrame!==event.sender.mainFrame)throw {code:4100,message:'Untrusted wallet frame'};
 const url=new URL(event.senderFrame.url);
 if(!/^https?:$/.test(url.protocol)||url.username||url.password)throw {code:4100,message:'Wallet unavailable for this source'};
 if(!navigationEpochs.has(event.sender)){navigationEpochs.set(event.sender,0);event.sender.on?.('did-start-navigation',(_e,_url,_inPlace,main)=>{if(main)navigationEpochs.set(event.sender,navigationEpochs.get(event.sender)+1);});}
 const epoch=navigationEpochs.get(event.sender),original=url.href;
 return {origin:url.origin,guard:()=>{if(epoch!==navigationEpochs.get(event.sender)||!tabs.owns(event.sender)||event.sender.isDestroyed()||event.sender.mainFrame!==event.senderFrame||event.senderFrame.url!==original)throw {code:4100,message:'Requesting page changed; request cancelled'};}};
}
export async function createWalletService({settings,staticDir,rpc,dialog,window,shell,tabs,onState,audit,apps,language=()=>'zh'}){
 const bridge=createBridgeServer({token:settings.get('bridgeToken'),port:settings.get('bridgePort'),staticDir});
 await bridge.start();settings.set('bridgePort',bridge.port);
 const tr=(text,vars)=>createTranslator(language())(text,vars);
 const analyzer=createAnalyzer({tr});
 const bridgeURL=()=>bridge.url()+'&lang='+language();
 let approvals=Promise.resolve();
 const confirm=request=>{
  const next=approvals.then(async()=>{
   request.guard?.();
   const risk=request.kind==='sign'?await analyzer.analyze(request.method,request.params,{net:{currency:Number(request.chainId)===196?'OKB':`原生币（链 ${request.chainId||'未知'}）`}}):null;
   request.guard?.();
   const changes=audit?.compare(request.origin);
   const result=await dialog.showMessageBox(window,{type:request.kind==='connect'?'question':'warning',buttons:[tr('拒绝'),tr('继续到钱包')],defaultId:0,cancelId:0,noLink:true,message:request.kind==='connect'?tr('允许此网站连接钱包？'):risk.title,
    detail:[`请求网站：${request.origin}`,request.account?`钱包地址：${request.account}`:'',...(risk?.lines||[]),changes?.changed.length?`与上次签名相比，已加载文件发生变化：${changes.changed.join('、')}`:'',...(audit?.externalOf(request.origin)||[]).map(e=>`外部资源：${e.origin}（${e.types.join('、')}）`),risk?.raw||'', '签名和交易由系统浏览器的钱包扩展最终确认。X Layer 196 是真实主网。'].filter(Boolean).map(text=>translateRendered(language(),text)).join('\n\n')});
   request.guard?.();if(result.response===1&&request.kind==='sign')audit?.commit(request.origin);
   return {ok:result.response===1,remember:false};
  });approvals=next.catch(()=>{});return next;
 };
 const host=createProviderHost({bridge,rpc,settings,networkForOrigin:origin=>homeNetwork(origin,apps),openBridge:()=>shell.openExternal(bridgeURL()),confirm,emit:(origin,event,payload)=>{for(const view of tabs.views()){const wc=view.webContents;if(wc.isDestroyed())continue;let current;try{current=new URL(wc.getURL()).origin;}catch{continue;}if(origin===null||current===origin)wc.send('eth:event',event,typeof payload==='function'?payload(current):payload);}}});
 bridge.on('state',onState);
 return {
  initial:event=>host.initial(walletFrame(event,tabs).origin),
  async request(event,method,params){try{const {origin,guard}=walletFrame(event,tabs);return {ok:true,result:await host.handle(origin,method,params,guard)};}catch(error){return {ok:false,error:{code:error.code||-32603,message:error.message||'Wallet request failed'}};}},
  open:()=>shell.openExternal(bridgeURL()),
  async switchChain(){const before=JSON.stringify(bridge.state);if(!bridge.state.ready)throw new Error(tr('尚未连接钱包'));const result=await dialog.showMessageBox(window,{type:'question',buttons:[tr('拒绝'),tr('继续到钱包')],defaultId:0,cancelId:0,message:tr('切换到 X Layer 196'),detail:tr('签名和交易由系统浏览器的钱包扩展最终确认。X Layer 196 是真实主网。')});if(result.response!==1)return false;if(before!==JSON.stringify(bridge.state))throw new Error('Wallet changed; cancelled');await bridge.request('wallet_switchEthereumChain',[{chainId:'0xc4'}],'FAB Browser');return true;},disconnect:()=>bridge.disconnect(),revoke:origin=>host.revoke(origin),
  status:()=>({...bridge.state,origins:settings.permittedOrigins()}),stop:()=>bridge.stop(),
 };
}
