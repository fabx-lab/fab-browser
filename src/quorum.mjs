import {createRpc} from './rpc.mjs';
export async function quorum(config,{fetchImpl=fetch}={}){
 const providers=config.rpcs.map(url=>createRpc(()=>[url],fetchImpl));
 const canonical=(method,value)=>{if(method==='eth_getBlockByNumber')return value&&[value.hash?.toLowerCase(),value.number?.toLowerCase()];if(method==='eth_getTransactionReceipt')return value&&[value.blockHash?.toLowerCase(),value.blockNumber?.toLowerCase(),value.contractAddress?.toLowerCase(),value.status];if(method==='eth_getLogs')return value.map(log=>[log.address.toLowerCase(),log.blockHash,log.blockNumber,log.transactionHash,log.logIndex,log.topics,log.data]);return value;};
 async function agree(method,params){const values=await Promise.all(providers.map(rpc=>rpc(method,params)));if(values.some(value=>JSON.stringify(canonical(method,value))!==JSON.stringify(canonical(method,values[0]))))throw new Error(`RPC disagreement: ${method}`);return values[0];}
 const chains=await Promise.all(providers.map(rpc=>rpc('eth_chainId',[])));if(chains.some(id=>BigInt(id)!==196n))throw new Error('Wrong chain');
 const heads=await Promise.all(providers.map(rpc=>rpc('eth_blockNumber',[]))),head=heads.map(BigInt).reduce((a,b)=>a<b?a:b),number=head>2n?head-2n:head,block='0x'+number.toString(16);
 const header=await agree('eth_getBlockByNumber',[block,false]);if(!header?.hash||BigInt(header.number)!==number)throw new Error('Invalid common block');
 return {block,number,hash:header.hash,agree,call:tx=>agree('eth_call',[tx,block])};
}
