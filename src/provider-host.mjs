// FAB EIP-1193 host, adapted from TapeBrowser (GPL-3.0-or-later).
// All writes require a current origin grant, unchanged session and explicit approval.
import {config} from './config.mjs';
const XLAYER={key:'xlayer',chainId:196,chainIdHex:'0xc4',name:'X Layer',currency:'OKB',rpcs:config.rpcs};
const networkByChainId=id=>Number(id)===196?XLAYER:null;

const READ_METHODS = new Set([
  'eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory',
  'eth_getBalance', 'eth_getCode', 'eth_getStorageAt', 'eth_getTransactionCount', 'eth_getBlockByNumber',
  'eth_getBlockByHash', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getLogs', 'eth_syncing',
  'web3_clientVersion',
]);

const SIGN_METHODS = new Set([
  'personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4', 'eth_sendTransaction',
]);

const WALLET_METHODS = new Set(['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_watchAsset']);

const CONNECT_TIMEOUT = 3 * 60 * 1000;

export const providerError = (code, message, data) => ({ code, message, ...(data === undefined ? {} : { data }) });

/** 电路网站所在的链；普通网站（http/https）返回 null */
export function homeNetwork(origin,apps=config.apps) {return apps.some(a=>new URL(a.gateway).origin===origin)?XLAYER:null;}

/** wallet_addEthereumChain 的参数（钱包里还没有这条链时用） */
const addChainParams = (n) => ({
  chainId: n.chainIdHex,
  chainName: n.name,
  nativeCurrency: { name: n.currency, symbol: n.currency, decimals: 18 },
  rpcUrls: [n.rpcs[0]],
  blockExplorerUrls: n.explorer ? [n.explorer] : [],
});

export function createProviderHost({ bridge, rpc, rpcs, settings, openBridge, confirm, emit,networkForOrigin=homeNetwork,prepare=(_method,params)=>params }) {
  if (!rpcs) rpcs = { xlayer: rpc };
  let readyWait = null;
  let sessionEpoch=0;
  const grants=new Map();
  const generation=origin=>grants.get(origin)||0;
  function revoke(origin){grants.set(origin,generation(origin)+1);settings.revoke(origin);emit(origin,'accountsChanged',[]);}
  function checkpoint(origin,guard,{permitted=false,chain=false}={}){
    const epoch=sessionEpoch,grant=generation(origin),account=bridge.state.accounts[0],network=bridge.state.chainId;
    return ()=>{guard();if(epoch!==sessionEpoch||grant!==generation(origin)||!bridge.state.ready||account!==bridge.state.accounts[0]||(chain&&network!==bridge.state.chainId)||(permitted&&!settings.isPermitted(origin)))throw providerError(4100,'钱包或网站授权已改变，请重新请求');};
  }

  const walletChain = () => (bridge.state.ready && bridge.state.chainId) || null;
  const chainId = (origin) => walletChain() || (networkForOrigin(origin) || XLAYER).chainIdHex;
  const accountsFor = (origin) => (settings.isPermitted(origin) && bridge.state.ready ? bridge.state.accounts.slice(0, 1) : []);

  async function ensureBridge() {
    if (bridge.state.ready) return;
    if (!readyWait) {
      if (!bridge.state.connected) openBridge();
      readyWait = bridge.waitReady(CONNECT_TIMEOUT).finally(() => { readyWait = null; });
    }
    await readyWait;
  }

  async function connect(origin, guard) {
    const grant=generation(origin);
    await ensureBridge();guard();
    if(grant!==generation(origin))throw providerError(4100,'网站授权已撤销');
    const check=checkpoint(origin,guard);
    let accounts=bridge.state.accounts;
    if(!accounts?.length)throw providerError(4001,'钱包没有返回地址');
    const account=String(accounts[0]).toLowerCase();
    if(!settings.isPermitted(origin)){
      const approval=await confirm({kind:'connect',origin,account,guard:check});check();
      if(!approval.ok)throw providerError(4001,'用户拒绝连接');
      settings.permit(origin);
    }
    await switchToHome(origin,check);check();return [account];
  }
  async function switchToHome(origin,check){
    const home=networkForOrigin(origin),cur=bridge.state.chainId;
    if(!home||!cur||cur===home.chainIdHex)return;
    check();
    try{await bridge.request('wallet_switchEthereumChain',[{chainId:home.chainIdHex}],origin);check();}
    catch(error){check();if(Number(error?.code)!==4902)return;
      try{await bridge.request('wallet_addEthereumChain',[addChainParams(home)],origin);check();}
      catch{check();}
    }
  }

  /** 只读请求用哪条链的内置节点：钱包连着就看钱包当前的链，没连就用网站所在的链；不认识的链返回 null */
  function readPool(origin) {
    const net = walletChain() ? networkByChainId(parseInt(walletChain(), 16)) : networkForOrigin(origin) || XLAYER;
    return net && rpcs[net.key] ? rpcs[net.key] : null;
  }

  async function handle(origin, method, params = [], guard = () => {}) {
    guard();
    if (typeof method !== 'string') throw providerError(-32600, 'method 必须是字符串');
    if (!Array.isArray(params) && params !== undefined && (typeof params !== 'object' || params === null)) throw providerError(-32602, 'params 不合法');

    switch (method) {
      case 'eth_chainId': return chainId(origin);
      case 'net_version': return String(parseInt(chainId(origin), 16));
      case 'eth_accounts': return accountsFor(origin);
      case 'eth_coinbase': return accountsFor(origin)[0] ?? null;
      case 'eth_requestAccounts': return connect(origin, guard);
      case 'wallet_requestPermissions': {
        await connect(origin, guard);
        return [{ parentCapability: 'eth_accounts', invoker: origin }];
      }
      case 'wallet_getPermissions':
        return settings.isPermitted(origin) ? [{ parentCapability: 'eth_accounts', invoker: origin }] : [];
      case 'wallet_revokePermissions':
        revoke(origin);
        return null;
      case 'eth_subscribe':
      case 'eth_unsubscribe':
        throw providerError(4200, '不支持订阅，请改用轮询');
      default: break;
    }

    if (READ_METHODS.has(method)) {
      const pool = readPool(origin);
      if (pool) {
        try { return await pool(method, params); } catch (e) { throw providerError(e.code ?? -32603, e.message, e.data); }
      }
      if (!bridge.state.ready) throw providerError(4901, '钱包没有连接，读不了这条链');
      return bridge.request(method, params, origin);
    }

    if(SIGN_METHODS.has(method)||WALLET_METHODS.has(method)){
      if(!settings.isPermitted(origin)||!bridge.state.ready)throw providerError(4100,'网站还没有连接钱包，请先调用 eth_requestAccounts');
      if(!Array.isArray(params))throw providerError(-32602,'钱包参数必须是数组');
      if(SIGN_METHODS.has(method)){
        const from=signerOf(method,params);
        if(!from||!bridge.state.accounts.includes(from))throw providerError(4100,'必须使用当前钱包地址签名');
      }
      const check=checkpoint(origin,guard,{permitted:true,chain:true});check();
      // What is approved is exactly what is signed: one calldata field, and the signer's prepared fee.
      if(method==='eth_sendTransaction'){const tx=params[0]||{};if(tx.data!==undefined&&tx.input!==undefined&&tx.data!==tx.input)throw providerError(-32602,'data 与 input 不一致');if(tx.data===undefined&&tx.input!==undefined){const {input,...rest}=tx;params=[{...rest,data:input},...params.slice(1)];}}
      // A signer may check or complete the request first; only a transaction waits on the network.
      {const prepared=prepare(method,params);params=prepared instanceof Promise?await prepared:prepared;check();}
      const approval=await confirm({kind:'sign',origin,method,params,chainId:bridge.state.chainId,guard:check});check();
      if(!approval.ok)throw providerError(4001,'用户拒绝请求');
      return bridge.request(method,params,origin,check);
    }
    throw providerError(4200,`不支持的方法 ${method}`);
  }

  /** 从签名请求里取出签名地址（小写），取不到返回 null */
  function signerOf(method, params) {
    const p = Array.isArray(params) ? params : [];
    let a = null;
    if (method === 'personal_sign') a = p[1];
    else if (method === 'eth_sign' || method.startsWith('eth_signTypedData')) a = p[0];
    else if (method === 'eth_sendTransaction') a = p[0]?.from;
    // eth_signTypedData（v1）参数顺序是 [data, address]
    if (method === 'eth_signTypedData' && !/^0x[0-9a-fA-F]{40}$/.test(String(a))) a = p[1];
    return /^0x[0-9a-fA-F]{40}$/.test(String(a)) ? String(a).toLowerCase() : null;
  }

  // 钱包状态变化 → 网页事件
  bridge.on('state', (s, prev) => {
    if(s.ready!==prev.ready||s.connected!==prev.connected||s.wallet!==prev.wallet||s.accounts.join()!==prev.accounts.join())sessionEpoch++;
    const now = s.ready ? s.accounts.slice(0, 1) : [];
    const before = prev.ready ? prev.accounts.slice(0, 1) : [];
    if (now.join() !== before.join()) {
      for (const origin of settings.permittedOrigins()) emit(origin, 'accountsChanged', now);
    }
    // 钱包连上、断开或切链：每个网页按自己的规则重新算 chainId（网页那边相同的值会忽略）
    const c1 = (s.ready && s.chainId) || null;
    const c0 = (prev.ready && prev.chainId) || null;
    if (c1 !== c0) emit(null, 'chainChanged', (origin) => chainId(origin));
  });

  return {
    handle,
    /** 网页加载时取初始状态 */
    initial: (origin) => ({ chainId: chainId(origin), accounts: accountsFor(origin) }),
    revoke,
  };
}
