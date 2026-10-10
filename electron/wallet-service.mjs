import {createBridgeServer} from '../src/bridge-server.mjs';
import {createProviderHost,homeNetwork} from '../src/provider-host.mjs';
import {createTranslator,translateRendered} from '../src/i18n.mjs';
import {createAnalyzer} from '../src/risk.mjs';
import {createLocalWallet} from '../src/local-wallet.mjs';
import {EventEmitter} from 'node:events';

// One signer for the provider host: the built-in wallet while it is unlocked, otherwise the extension bridge.
export function createSigner(local,bridge){
 const ev=new EventEmitter(),waits=new Set(),active=()=>local.state.ready?local:bridge;let state=active().state;
 const sync=()=>{const prev=state;state=active().state;if(JSON.stringify(prev)!==JSON.stringify(state))ev.emit('state',state,prev);if(state.ready)for(const w of waits)w.resolve(state);};
 local.on('state',sync);bridge.on('state',sync);
 return {get state(){return state;},get local(){return active()===local;},on:(name,fn)=>ev.on(name,fn),request:(method,params,origin,check)=>active().request(method,params,origin,check),
  waitReady(ms){if(state.ready)return Promise.resolve(state);return new Promise((resolve,reject)=>{const w={resolve:value=>{done();resolve(value);},reject:error=>{done();reject(error);}},timer=setTimeout(()=>w.reject({code:4001,message:'等待钱包超时'}),ms),done=()=>{clearTimeout(timer);waits.delete(w);};waits.add(w);});},
  disconnect(){for(const w of waits)w.reject({code:4001,message:'钱包已断开'});if(active()===local)local.lock();else return bridge.disconnect();}};
}

const navigationEpochs=new WeakMap(),MAX_REVIEW=8000;
// The main process derives provenance from the actual frame, never page parameters.
export function walletFrame(event,tabs){
 if(!tabs.owns(event.sender)||event.senderFrame!==event.sender.mainFrame)throw {code:4100,message:'Untrusted wallet frame'};
 const url=new URL(event.senderFrame.url);
 if(!/^https?:$/.test(url.protocol)||url.username||url.password)throw {code:4100,message:'Wallet unavailable for this source'};
 if(!navigationEpochs.has(event.sender)){navigationEpochs.set(event.sender,0);event.sender.on?.('did-start-navigation',(_e,_url,_inPlace,main)=>{if(main)navigationEpochs.set(event.sender,navigationEpochs.get(event.sender)+1);});}
 const epoch=navigationEpochs.get(event.sender),original=url.href;
 return {origin:url.origin,guard:()=>{if(epoch!==navigationEpochs.get(event.sender)||!tabs.owns(event.sender)||event.sender.isDestroyed()||event.sender.mainFrame!==event.senderFrame||event.senderFrame.url!==original)throw {code:4100,message:'Requesting page changed; request cancelled'};}};
}
export async function createWalletService({settings,staticDir,rpc,dialog,window,shell,tabs,onState,audit,apps,walletFile,showWallet=()=>{},language=()=>'zh'}){
 const bridge=createBridgeServer({token:settings.get('bridgeToken'),port:settings.get('bridgePort'),staticDir});
 await bridge.start();settings.set('bridgePort',bridge.port);
 const local=createLocalWallet({file:walletFile,rpc}),signer=createSigner(local,bridge);
 const tr=(text,vars)=>createTranslator(language())(text,vars);
 const analyzer=createAnalyzer({tr});
 const bridgeURL=()=>bridge.url()+'&lang='+language();
 let approvals=Promise.resolve();
 const okb=wei=>{const whole=wei/10n**18n,part=(wei%10n**18n).toString().padStart(18,'0').replace(/0+$/,'').slice(0,8);return part?`${whole}.${part}`:String(whole);};
 // The final built-in confirmation names where a transaction goes and what it sends.
 const txLines=request=>{const tx=request.method==='eth_sendTransaction'&&request.params?.[0];if(!tx)return [];return [tx.to?`目标地址：${tx.to}`:'创建合约',`金额：${okb(BigInt(tx.value||0))} OKB`,'网络：X Layer 196'];};
 const feeLine=request=>{const tx=request.method==='eth_sendTransaction'&&request.params?.[0];if(!tx?.gas||!tx?.gasPrice)return '';return `手续费上限：${okb(BigInt(tx.gas)*BigInt(tx.gasPrice))} OKB`;};
 const confirm=request=>{
  const next=approvals.then(async()=>{
   request.guard?.();
   const risk=request.kind==='sign'?await analyzer.analyze(request.method,request.params,{net:{currency:Number(request.chainId)===196?'OKB':`原生币（链 ${request.chainId||'未知'}）`},full:signer.local}):null;
   // The built-in wallet has no second screen, so FAB shows everything it signs, or refuses.
   if(signer.local&&risk?.raw&&risk.raw.length>MAX_REVIEW)throw {code:4001,message:tr('内容太长，无法完整确认')};
   request.guard?.();
   const changes=audit?.compare(request.origin);
   const result=await dialog.showMessageBox(window,{type:request.kind==='connect'?'question':'warning',buttons:[tr('拒绝'),tr(signer.local?(request.kind==='connect'?'连接':'签名'):'继续到钱包')],defaultId:0,cancelId:0,noLink:true,message:request.kind==='connect'?tr('允许此网站连接钱包？'):risk.title,
    detail:[`请求网站：${request.origin}`,...txLines(request),feeLine(request),request.account?`钱包地址：${request.account}`:'',...(risk?.lines||[]),changes?.changed.length?`与上次签名相比，已加载文件发生变化：${changes.changed.join('、')}`:'',...(audit?.externalOf(request.origin)||[]).map(e=>`外部资源：${e.origin}（${e.types.join('、')}）`),risk?.raw||'',signer.local?'由 FAB 钱包签名。X Layer 196 是真实主网。':'签名和交易由系统浏览器的钱包扩展最终确认。X Layer 196 是真实主网。'].filter(Boolean).map(text=>translateRendered(language(),text)).join('\n\n')});
   request.guard?.();if(result.response===1&&request.kind==='sign')audit?.commit(request.origin);
   return {ok:result.response===1,remember:false};
  });approvals=next.catch(()=>{});return next;
 };
 // A site asking for accounts opens the wallet panel: unlock, create, import, or use an extension.
 const host=createProviderHost({bridge:signer,rpc,settings,prepare:(method,params)=>{if(!signer.local)return params;if(method==='eth_sendTransaction')return local.prepare(params[0]||{}).then(tx=>[tx,...params.slice(1)]);if(method.startsWith('eth_signTypedData'))local.checkTyped(params);return params;},networkForOrigin:origin=>homeNetwork(origin,apps),openBridge:showWallet,confirm,emit:(origin,event,payload)=>{for(const view of tabs.views()){const wc=view.webContents;if(wc.isDestroyed())continue;let current;try{current=new URL(wc.getURL()).origin;}catch{continue;}if(origin===null||current===origin)wc.send('eth:event',event,typeof payload==='function'?payload(current):payload);}}});
 signer.on('state',onState);
 return {
  initial:event=>host.initial(walletFrame(event,tabs).origin),
  async request(event,method,params){try{const {origin,guard}=walletFrame(event,tabs);return {ok:true,result:await host.handle(origin,method,params,guard)};}catch(error){return {ok:false,error:{code:error.code||-32603,message:error.message||'Wallet request failed'}};}},
  open:()=>shell.openExternal(bridgeURL()),
  async switchChain(){if(signer.local)return true;const before=JSON.stringify(bridge.state);if(!bridge.state.ready)throw new Error(tr('尚未连接钱包'));const result=await dialog.showMessageBox(window,{type:'question',buttons:[tr('拒绝'),tr('继续到钱包')],defaultId:0,cancelId:0,message:tr('切换到 X Layer 196'),detail:tr('签名和交易由系统浏览器的钱包扩展最终确认。X Layer 196 是真实主网。')});if(result.response!==1)return false;if(before!==JSON.stringify(bridge.state))throw new Error('Wallet changed; cancelled');await bridge.request('wallet_switchEthereumChain',[{chainId:'0xc4'}],'FAB Browser');return true;},disconnect:()=>signer.disconnect(),revoke:origin=>host.revoke(origin),
  status:()=>({...signer.state,origins:settings.permittedOrigins(),builtIn:signer.local,local:local.info()}),
  create:password=>local.create(password),import:(secret,password)=>local.import(secret,password),unlock:password=>local.unlock(password),lock:()=>local.lock(),reveal:password=>local.reveal(password),
  async forget(){const result=await dialog.showMessageBox(window,{type:'warning',buttons:[tr('取消'),tr('删除')],defaultId:0,cancelId:0,message:tr('删除这个钱包？'),detail:tr('没有助记词或私钥就无法找回。')});if(result.response!==1)return false;local.forget();return true;},
  async balance(){const address=signer.state.accounts[0]||local.info().address;if(!address)return null;return {address,wei:String(BigInt(await rpc('eth_getBalance',[address,'latest'])))};},stop:()=>bridge.stop(),
 };
}
