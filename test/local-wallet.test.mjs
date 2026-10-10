import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyMessage,verifyTypedData,parseTransaction,recoverTransactionAddress} from 'viem';
import {createLocalWallet,validMnemonic,parseSecret} from '../src/local-wallet.mjs';

const KEY='0x'+'11'.repeat(32);
function setup(rpc=async()=>{throw new Error('no rpc');}){const dir=mkdtempSync(join(tmpdir(),'fab-wallet-'));return {dir,file:join(dir,'wallet.json'),make:()=>createLocalWallet({file:join(dir,'wallet.json'),rpc})};}

test('recovery phrases are checked against the BIP-39 checksum',()=>{
 assert.equal(validMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),true);
 assert.equal(validMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon'),false);
 assert.equal(parseSecret(KEY.slice(2)).secret,KEY);
 assert.throws(()=>parseSecret('not a wallet'),/不是有效的助记词或私钥/);
});

test('a created wallet is encrypted at rest, locks, and unlocks only with its password',async()=>{
 const {dir,file,make}=setup();
 try{
  const wallet=make(),made=await wallet.create('correct horse');
  assert.equal(validMnemonic(made.mnemonic),true);
  assert.equal(wallet.state.ready,true);assert.deepEqual(wallet.state.accounts,[made.address.toLowerCase()]);assert.equal(wallet.state.chainId,'0xc4');
  const stored=readFileSync(file,'utf8');
  assert.equal(stored.includes(made.mnemonic.split(' ')[0]+' '),false,'The phrase never touches disk in clear');
  assert.equal(statSync(file).mode&0o777,0o600);
  await assert.rejects(wallet.create('another one'),/已有钱包/);
  wallet.lock();assert.equal(wallet.state.ready,false);
  await assert.rejects(wallet.request('personal_sign',['0x74657374',made.address]),{code:4900});
  const reopened=make();assert.deepEqual(reopened.info(),{exists:true,address:made.address,unlocked:false});
  await assert.rejects(reopened.unlock('wrong password'),/密码不对/);
  await reopened.unlock('correct horse');assert.equal(reopened.state.ready,true);
  assert.deepEqual(await reopened.reveal('correct horse'),{type:'mnemonic',secret:made.mnemonic});
  reopened.forget();assert.equal(reopened.info().exists,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('an imported key signs messages, typed data and X Layer transactions for its own address only',async()=>{
 const sent=[];
 const {dir,make}=setup(async(method,params)=>{if(method==='eth_getTransactionCount')return '0x7';if(method==='eth_estimateGas')return '0x5208';if(method==='eth_gasPrice')return '0x3b9aca00';if(method==='eth_sendRawTransaction'){sent.push(params[0]);return '0x'+'ab'.repeat(32);}throw new Error(method);});
 try{
  const wallet=make();await assert.rejects(wallet.import(KEY,'short'),/密码至少 8 位/);
  const {address}=await wallet.import(KEY,'password-1');
  const signature=await wallet.request('personal_sign',['0x74657374',address.toLowerCase()]);
  assert.equal(await verifyMessage({address,message:{raw:'0x74657374'},signature}),true);
  const typed={domain:{name:'FAB',chainId:196},types:{EIP712Domain:[{name:'name',type:'string'},{name:'chainId',type:'uint256'}],Mail:[{name:'body',type:'string'}]},primaryType:'Mail',message:{body:'hi'}};
  const typedSignature=await wallet.request('eth_signTypedData_v4',[address,JSON.stringify(typed)]);
  assert.equal(await verifyTypedData({address,domain:typed.domain,types:{Mail:typed.types.Mail},primaryType:'Mail',message:typed.message,signature:typedSignature}),true);
  await assert.rejects(wallet.request('personal_sign',['0x00','0x'+'2'.repeat(40)]),{code:4100});
  await assert.rejects(wallet.request('eth_sendTransaction',[{from:address,to:'0x'+'3'.repeat(40),value:'0x1'}]),/没有经过准备/,'Only a prepared, approved transaction is signed');
  const prepared=await wallet.prepare({from:address,to:'0x'+'3'.repeat(40),value:'0x1',input:'0x1234'});
  assert.deepEqual([prepared.gas,prepared.gasPrice,prepared.data,prepared.input],['0x6270','0x3b9aca00','0x1234',undefined],'The fee is fixed before approval and input becomes data');
  await assert.rejects(wallet.prepare({from:address,data:'0x12',input:'0x34'}),/不一致/);
  assert.equal(await wallet.request('eth_sendTransaction',[prepared]),'0x'+'ab'.repeat(32));
  const tx=parseTransaction(sent[0]);assert.equal(tx.chainId,196);assert.equal(tx.nonce,7);assert.equal(tx.value,1n);assert.equal(tx.gas,25200n);assert.equal(tx.gasPrice,1000000000n);assert.equal(tx.data,'0x1234');
  await Promise.all([wallet.request('eth_sendTransaction',[prepared]),wallet.request('eth_sendTransaction',[prepared])]);
  assert.deepEqual(sent.slice(1).map(raw=>parseTransaction(raw).nonce),[8,9],'Concurrent sends take consecutive nonces');
  assert.equal((await recoverTransactionAddress({serializedTransaction:sent[0]})).toLowerCase(),address.toLowerCase());
  await assert.rejects(wallet.prepare({from:address,to:'0x'+'3'.repeat(40),chainId:'0x1'}),{code:4901});await assert.rejects(wallet.request('eth_sendTransaction',[{...prepared,chainId:'0x1'}]),{code:4901});
  await assert.rejects(wallet.request('eth_sign',[address,'0x00']),{code:4200});
  await assert.rejects(wallet.request('wallet_switchEthereumChain',[{chainId:'0x1'}]),{code:4902});
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('the provider signer uses the unlocked built-in wallet, otherwise the extension bridge',async()=>{
 const {createSigner}=await import('../electron/wallet-service.mjs');
 const {EventEmitter}=await import('node:events');
 const {dir,make}=setup();
 try{
  const ev=new EventEmitter(),bridge={state:{connected:true,ready:true,wallet:'Ext',accounts:['0x'+'4'.repeat(40)],chainId:'0xc4'},on:(n,f)=>ev.on(n,f),request:async()=>'from-bridge',disconnect:async()=>{}};
  const local=make(),signer=createSigner(local,bridge),events=[];signer.on('state',s=>events.push(s.wallet));
  assert.equal(signer.local,false);assert.equal(await signer.request('personal_sign',[]),'from-bridge');
  const {address}=await local.import(KEY,'password-1');
  assert.equal(signer.local,true);assert.deepEqual(signer.state.accounts,[address.toLowerCase()]);assert.deepEqual(events,['FAB 钱包']);
  signer.disconnect();assert.equal(signer.local,false);assert.equal(signer.state.wallet,'Ext');
  const pending=signer.waitReady(1000);bridge.state={...bridge.state};ev.emit('state');assert.equal((await pending).wallet,'Ext');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('locking cancels a transaction in flight, and a second wallet cannot race the first',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),sent=[];
 const {dir,make}=setup(async(method,params)=>{if(method==='eth_getTransactionCount'){await gate;return '0x0';}if(method==='eth_sendRawTransaction'){sent.push(params[0]);return '0x1';}throw new Error(method);});
 try{
  const wallet=make();
  const [first,second]=await Promise.allSettled([wallet.import(KEY,'password-1'),wallet.create('password-2')]);
  assert.equal(first.status,'fulfilled');assert.equal(second.status,'rejected');assert.match(second.reason.message,/已有钱包/);
  const pending=wallet.request('eth_sendTransaction',[{from:wallet.state.accounts[0],to:'0x'+'3'.repeat(40),gas:'0x5208',gasPrice:'0x1'}]);
  await new Promise(resolve=>setTimeout(resolve,20));wallet.lock();release();
  await assert.rejects(pending,/钱包已锁定，交易已取消/);assert.equal(sent.length,0,'Nothing is signed or broadcast after locking');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('typed data for another chain, queued sends across a relock, and unreadable files are all refused',async()=>{
 const {writeFileSync}=await import('node:fs');
 let release;const gate=new Promise(resolve=>{release=resolve;}),sent=[];
 const {dir,file,make}=setup(async(method,params)=>{if(method==='eth_getTransactionCount'){await gate;return '0x0';}if(method==='eth_sendRawTransaction'){sent.push(params[0]);return '0x1';}throw new Error(method);});
 try{
  const wallet=make(),{address}=await wallet.import(KEY,'password-1');
  const typed={domain:{name:'X',chainId:1},types:{M:[{name:'a',type:'string'}]},primaryType:'M',message:{a:'b'}};
  assert.throws(()=>wallet.checkTyped([address,JSON.stringify(typed)]),{code:4901});
  await assert.rejects(wallet.request('eth_signTypedData_v4',[address,typed]),{code:4901});
  const tx={from:address,to:'0x'+'3'.repeat(40),gas:'0x5208',gasPrice:'0x1'};
  const first=wallet.request('eth_sendTransaction',[tx]),second=wallet.request('eth_sendTransaction',[tx]);
  await new Promise(resolve=>setTimeout(resolve,20));wallet.lock();await wallet.unlock('password-1');release();
  await assert.rejects(first,/已取消/);await assert.rejects(second,/已取消/,'A send queued before the relock never signs');assert.equal(sent.length,0);
  wallet.forget();writeFileSync(file,'{"version":2}');
  const damaged=make();assert.equal(damaged.info().exists,true);
  await assert.rejects(damaged.create('password-2'),/无法读取/);await assert.rejects(damaged.unlock('x'),/无法读取/);
  assert.equal(readFileSync(file,'utf8'),'{"version":2}','The unreadable file is kept');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('a page that navigates or loses its grant while a send waits never gets it signed',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),sent=[];let valid=true;
 const {dir,make}=setup(async(method,params)=>{if(method==='eth_getTransactionCount'){await gate;return '0x0';}if(method==='eth_sendRawTransaction'){sent.push(params[0]);return '0x1';}throw new Error(method);});
 try{
  const wallet=make(),{address}=await wallet.import(KEY,'password-1');
  const pending=wallet.request('eth_sendTransaction',[{from:address,to:'0x'+'3'.repeat(40),gas:'0x5208',gasPrice:'0x1'}],'https://app.example',()=>{if(!valid)throw {code:4100,message:'Requesting page changed'};});
  await new Promise(resolve=>setTimeout(resolve,20));valid=false;release();
  await assert.rejects(pending,{code:4100});assert.equal(sent.length,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('the built-in wallet review shows the whole message',async()=>{
 const {createAnalyzer}=await import('../src/risk.mjs');
 const analyzer=createAnalyzer({tr:(t,v)=>v?t.replace(/\{(\w+)\}/g,(_a,k)=>v[k]):t}),long='x'.repeat(700)+'pay 0xabc';
 assert.equal((await analyzer.analyze('personal_sign',[long],{full:true})).raw,long);
 assert.notEqual((await analyzer.analyze('personal_sign',[long])).raw,long);
});

test('replacing an earlier transaction never lowers the next nonce',async()=>{
 const sent=[];const {dir,make}=setup(async(method,params)=>{if(method==='eth_getTransactionCount')return '0x0';if(method==='eth_sendRawTransaction'){sent.push(parseTransaction(params[0]).nonce);return '0x1';}throw new Error(method);});
 try{
  const wallet=make(),{address}=await wallet.import(KEY,'password-1'),tx={from:address,to:'0x'+'3'.repeat(40),gas:'0x5208',gasPrice:'0x1'};
  for(const extra of [{},{},{nonce:'0x0'},{}])await wallet.request('eth_sendTransaction',[{...tx,...extra}]);
  assert.deepEqual(sent,[0,1,0,2]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
