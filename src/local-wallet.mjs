// FAB's built-in wallet. One account, encrypted at rest (scrypt + AES-256-GCM, file mode
// 0600); the unlocked account lives only in main-process memory. It speaks the same
// interface as the extension bridge, so the provider host treats both alike.
import {EventEmitter} from 'node:events';
import {randomBytes,scrypt,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,rmSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {generateMnemonic,english,mnemonicToAccount,privateKeyToAccount} from 'viem/accounts';
import {isHex,toHex} from 'viem';

const KDF={N:2**17,r:8,p:1,maxmem:256*1024*1024};
const derive=(password,salt,kdf=KDF)=>new Promise((resolve,reject)=>scrypt(String(password).normalize('NFKC'),salt,32,{N:kdf.N,r:kdf.r,p:kdf.p,maxmem:KDF.maxmem},(error,key)=>error?reject(error):resolve(key)));
const fail=(code,message)=>Object.assign(new Error(message),{code});

/** BIP-39 checksum over the English list; viem derives without validating. */
export function validMnemonic(phrase){
 const words=String(phrase).trim().toLowerCase().split(/\s+/);
 if(![12,15,18,21,24].includes(words.length))return false;
 const bits=words.map(w=>english.indexOf(w)).map(i=>i<0?null:i.toString(2).padStart(11,'0'));
 if(bits.includes(null))return false;
 const all=bits.join(''),cs=all.length/33,entropy=all.slice(0,all.length-cs);
 const bytes=Buffer.from(entropy.match(/.{8}/g).map(b=>parseInt(b,2)));
 const hash=[...createHash('sha256').update(bytes).digest()].map(b=>b.toString(2).padStart(8,'0')).join('');
 return hash.slice(0,cs)===all.slice(-cs);
}
export function parseSecret(input){
 const text=String(input||'').trim();
 if(/^(0x)?[0-9a-fA-F]{64}$/.test(text))return {type:'key',secret:text.startsWith('0x')?text.toLowerCase():`0x${text.toLowerCase()}`};
 const phrase=text.toLowerCase().split(/\s+/).join(' ');
 if(validMnemonic(phrase))return {type:'mnemonic',secret:phrase};
 throw fail(-32602,'不是有效的助记词或私钥');
}
const accountOf=({type,secret})=>type==='key'?privateKeyToAccount(secret):mnemonicToAccount(secret);
const checkPassword=password=>{if(String(password||'').length<8)throw fail(-32602,'密码至少 8 位');};

export function createLocalWallet({file,rpc,chainId=196}){
 const ev=new EventEmitter(),hexChain=toHex(chainId);
 let account=null,vault=null,unlocks=0,creating=false;
 // Only a missing file means no wallet; an unreadable one is kept and reported, never overwritten.
 let broken=false;
 try{vault=JSON.parse(readFileSync(file,'utf8'));if(vault?.version!==1||!vault.cipher||!vault.kdf){vault=null;broken=true;}}catch(error){if(error.code!=='ENOENT')broken=true;}
 let state=stateOf();
 function stateOf(){return account?{connected:true,ready:true,wallet:'FAB 钱包',accounts:[account.address.toLowerCase()],chainId:hexChain}:{connected:false,ready:false,wallet:null,accounts:[],chainId:null};}
 function update(){unlocks++;const prev=state;state=stateOf();ev.emit('state',state,prev);}
 async function seal(secret,password){
  checkPassword(password);
  const salt=randomBytes(16),iv=randomBytes(12),key=await derive(password,salt),cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(secret),'utf8'),cipher.final()]);
  const next={version:1,address:accountOf(secret).address,kdf:{name:'scrypt',N:KDF.N,r:KDF.r,p:KDF.p,salt:salt.toString('hex')},cipher:{name:'aes-256-gcm',iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:data.toString('hex')}};
  mkdirSync(dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});renameSync(file+'.tmp',file);
  vault=next;account=accountOf(secret);update();
 }
 async function open(password){
  if(broken)throw fail(4100,'钱包文件无法读取');if(!vault)throw fail(4100,'还没有钱包');
  const key=await derive(password,Buffer.from(vault.kdf.salt,'hex'),vault.kdf);
  try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(vault.cipher.iv,'hex'));decipher.setAuthTag(Buffer.from(vault.cipher.tag,'hex'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(vault.cipher.data,'hex')),decipher.final()]).toString('utf8'));}
  catch{throw fail(4100,'密码不对');}
 }
 // One wallet only: the slot is taken before the slow key derivation starts.
 async function reserve(run){if(broken)throw fail(4100,'钱包文件无法读取');if(vault||creating)throw fail(4100,'已有钱包');creating=true;try{return await run();}finally{creating=false;}}
 const signer=address=>{if(!account||String(address).toLowerCase()!==account.address.toLowerCase())throw fail(4100,'必须使用当前钱包地址签名');return account;};
 // Approval shows the prepared fee; signing then uses exactly that gas and price.
 const callData=tx=>{if(tx.data&&tx.input&&tx.data!==tx.input)throw fail(-32602,'data 与 input 不一致');return tx.data||tx.input||undefined;};
 async function prepare(tx){
  const from=signer(tx.from);
  if(tx.chainId!==undefined&&Number(tx.chainId)!==chainId)throw fail(4901,'只能在 X Layer 196 上发送交易');
  const data=callData(tx),value=tx.value?BigInt(tx.value):0n;
  const gas=tx.gas||tx.gasLimit?BigInt(tx.gas||tx.gasLimit):BigInt(await rpc('eth_estimateGas',[{from:from.address,to:tx.to||undefined,data,value:toHex(value)}]))*12n/10n;
  const gasPrice=tx.gasPrice?BigInt(tx.gasPrice):BigInt(await rpc('eth_gasPrice',[]));
  const {input,gasLimit,maxFeePerGas,maxPriorityFeePerGas,type,...rest}=tx;
  return {...rest,from:tx.from,to:tx.to||undefined,data,value:toHex(value),gas:toHex(gas),gasPrice:toHex(gasPrice),chainId:hexChain};
 }
 // Nonce, signature and broadcast run one at a time, and stop if the wallet locks meanwhile.
 let sending=Promise.resolve();const nonces=new Map();
 function sendTransaction(tx,check=()=>{}){
  // The session is bound when the request is queued, so locking cancels everything behind it.
  const generation=unlocks,from=signer(tx.from);
  const run=sending.then(async()=>{
   const live=()=>{if(generation!==unlocks||account!==from)throw fail(4100,'钱包已锁定，交易已取消');check();};
   if(tx.chainId!==undefined&&Number(tx.chainId)!==chainId)throw fail(4901,'只能在 X Layer 196 上发送交易');
   if(!tx.gas||!tx.gasPrice)throw fail(-32602,'交易没有经过准备');
   live();const pending=Number(await rpc('eth_getTransactionCount',[from.address,'pending']));live();
   const nonce=tx.nonce!==undefined?Number(tx.nonce):Math.max(pending,nonces.get(from.address)??0);
   const raw=await from.signTransaction({type:'legacy',chainId,nonce,gas:BigInt(tx.gas),gasPrice:BigInt(tx.gasPrice),to:tx.to||undefined,data:callData(tx),value:tx.value?BigInt(tx.value):0n});live();
   const hash=await rpc('eth_sendRawTransaction',[raw]);nonces.set(from.address,Math.max(nonces.get(from.address)??0,nonce+1));return hash;
  });
  sending=run.catch(()=>{});return run;
 }
 /** Typed data must target X Layer 196 when it names a chain. */
 function checkTyped(params){const typed=typeof params[1]==='string'?JSON.parse(params[1]):params[1];const id=typed?.domain?.chainId;if(id!==undefined&&id!==null&&BigInt(id)!==BigInt(chainId))throw fail(4901,'只能为 X Layer 196 签名');return typed;}
 // check: the provider's page and grant checkpoint, rerun after every wait before signing.
 async function request(method,params=[],_origin,check=()=>{}){
  if(!account)throw fail(4900,'钱包已锁定');
  switch(method){
   case 'personal_sign':{const [message,address]=params;const value=isHex(message)?{raw:message}:String(message);return signer(address).signMessage({message:value});}
   case 'eth_signTypedData_v3':case 'eth_signTypedData_v4':{const [address]=params;const typed=checkTyped(params);const {EIP712Domain,...types}=typed.types||{};return signer(address).signTypedData({domain:typed.domain,types,primaryType:typed.primaryType,message:typed.message});}
   case 'eth_sendTransaction':return sendTransaction(params[0]||{},check);
   case 'wallet_switchEthereumChain':if(String(params[0]?.chainId).toLowerCase()===hexChain)return null;throw fail(4902,'内置钱包只支持 X Layer 196');
   case 'wallet_addEthereumChain':if(String(params[0]?.chainId).toLowerCase()===hexChain)return null;throw fail(4200,'内置钱包只支持 X Layer 196');
   default:throw fail(4200,`内置钱包不支持 ${method}`);
  }
 }
 return {
  get state(){return state;},
  on:(name,fn)=>ev.on(name,fn),
  info:()=>({exists:!!vault||broken,address:vault?.address||null,unlocked:!!account,...(broken?{broken:true}:{})}),
  async create(password){return reserve(async()=>{const secret={type:'mnemonic',secret:generateMnemonic(english)};await seal(secret,password);return {address:account.address,mnemonic:secret.secret};});},
  async import(input,password){const secret=parseSecret(input);return reserve(async()=>{await seal(secret,password);return {address:account.address};});},
  prepare,checkTyped,
  async unlock(password){const secret=await open(password);account=accountOf(secret);update();return {address:account.address};},
  async reveal(password){const {type,secret}=await open(password);return {type,secret};},
  lock(){account=null;update();},
  forget(){account=null;vault=null;broken=false;rmSync(file,{force:true});update();},
  request,
  waitReady:()=>account?Promise.resolve(state):Promise.reject(fail(4100,'钱包已锁定')),
  disconnect(){account=null;update();},
 };
}
