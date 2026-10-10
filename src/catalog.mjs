// Discover FAB publications rather than TapeOut's obsolete on-chain file contracts.
import {encodeFunctionData,decodeFunctionResult,decodeEventLog,parseAbi,toEventSelector} from 'viem';
import {quorum} from './quorum.mjs';
import {registryAbi} from './registry-abi.mjs';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
const published=parseAbi(['event SitePublished(address indexed container,address indexed circuits,uint256 indexed tokenId,uint256 version,string cid,address publisher)']);
const nftAbi=parseAbi(['function ownerOf(uint256) view returns (address)','function nextId() view returns (uint256)']);
const factoryAbi=parseAbi(['function cpuCount() view returns (uint256)','function cpuAt(uint256) view returns (address)']);
const deployTx='0x441d63c8052111334fbb37650eab0d82a393ccc6bde33860cc9fb564c1a575fd';
export function createCatalog({file,config,onProgress=()=>{},getQuorum=quorum,seedFile}){
 let data={sites:{},lastBlock:null,lastHash:null},running=null,cancelled=false;
 if(seedFile)try{const seed=JSON.parse(readFileSync(seedFile,'utf8'));if(seed.registry===config.registry&&seed.chainId===config.chainId)data={...data,...seed};}catch{}
 try{const saved=JSON.parse(readFileSync(file,'utf8'));if(saved.registry===config.registry&&saved.chainId===config.chainId)data={...data,...saved};}catch{}
 async function read(q,address,abi,name,args=[]){return decodeFunctionResult({abi,functionName:name,data:await q.call({to:address,data:encodeFunctionData({abi,functionName:name,args})})});}
 function save(){mkdirSync(dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify({...data,registry:config.registry,chainId:config.chainId}));renameSync(file+'.tmp',file);}
 async function scan(){cancelled=false;const q=await getQuorum(config),receipt=await q.agree('eth_getTransactionReceipt',[deployTx]);if(!receipt||receipt.contractAddress?.toLowerCase()!==config.registry.toLowerCase()||BigInt(receipt.status)!==1n)throw new Error('Registry deployment identity mismatch');const start=BigInt(receipt.blockNumber);
  if(data.lastBlock){const previous=await q.agree('eth_getBlockByNumber',['0x'+BigInt(data.lastBlock).toString(16),false]);if(previous?.hash!==data.lastHash)data={sites:{},lastBlock:null,lastHash:null};}
  let from=data.lastBlock?BigInt(data.lastBlock)+1n:start;const sites={...data.sites};
  // Official X Layer RPC accepts at most 100 blocks per log query (live verified).
  // Bound concurrency; rate/transport errors never alter the scanned block range.
  let done=0n;const scanStart=from;
  const check=()=>{if(cancelled)throw new Error('Directory scan cancelled');};
  async function range(first,last){for(let attempt=0;;attempt++)try{return await q.agree('eth_getLogs',[{address:config.registry,topics:[toEventSelector(published[0])],fromBlock:'0x'+first.toString(16),toBlock:'0x'+last.toString(16)}]);}catch(error){if(/disagreement/.test(error.message)||attempt>=3)throw error;await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}}
  while(from<=q.number){check();const ranges=[];for(let i=0;i<2&&from<=q.number;i++){const to=from+99n<q.number?from+99n:q.number;ranges.push([from,to]);from=to+1n;}
   const batches=await Promise.all(ranges.map(([first,last])=>range(first,last)));check();
   for(let i=0;i<batches.length;i++){for(const log of batches[i]){const {args}=decodeEventLog({abi:published,data:log.data,topics:log.topics});sites[args.container.toLowerCase()]={container:args.container,circuits:args.circuits,tokenId:String(args.tokenId),version:String(args.version),cid:args.cid,publisher:args.publisher,blockNumber:String(BigInt(log.blockNumber)),title:`电路 #${args.tokenId}`,discoveredAt:Date.now()};}done+=ranges[i][1]-ranges[i][0]+1n;}
   const checkpoint=from-1n,header=checkpoint===q.number?{hash:q.hash}:await q.agree('eth_getBlockByNumber',['0x'+checkpoint.toString(16),false]);if(!header?.hash)throw new Error('Missing checkpoint block');data={sites:{...sites},lastBlock:String(checkpoint),lastHash:header.hash};save();
   onProgress({stage:'scan',done:String(done),total:String(q.number-scanStart+1n)});
  }
  data={sites,lastBlock:String(q.number),lastHash:q.hash};save();return list();
 }
 function list(){return Object.values(data.sites).map(row=>({...row,...config.apps.find(a=>a.container.toLowerCase()===row.container.toLowerCase()),...row.metadata}));}
 async function owners(){const q=await getQuorum(config),rows=list();for(const row of rows){try{row.owner=await read(q,row.circuits,nftAbi,'ownerOf',[BigInt(row.tokenId)]);}catch{row.owner=null;}}return rows;}
 async function owned(account){if(!/^0x[0-9a-f]{40}$/i.test(account))throw new Error('Invalid wallet address');const q=await getQuorum(config),factory=await read(q,config.registry,registryAbi,'factory'),count=await read(q,factory,factoryAbi,'cpuCount'),rows=[];
  for(let i=0n;i<count;i++){const circuits=await read(q,factory,factoryAbi,'cpuAt',[i]),end=await read(q,circuits,nftAbi,'nextId');for(let tokenId=1n;tokenId<=end;tokenId++){try{const owner=await read(q,circuits,nftAbi,'ownerOf',[tokenId]);if(owner.toLowerCase()===account.toLowerCase())rows.push({circuits,tokenId:String(tokenId),owner,application:list().find(a=>a.circuits.toLowerCase()===circuits.toLowerCase()&&a.tokenId===String(tokenId))});}catch(error){if(!/revert/i.test(error.message))throw error;}onProgress({stage:'owned',processor:String(i+1n),processors:String(count),done:String(tokenId),total:String(end)});}}
  return rows;
 }
 return {list,owners,owned,cancel:()=>{cancelled=true;},metadata(container,value){const key=container.toLowerCase();if(data.sites[key]){data.sites[key]={...data.sites[key],metadata:value};save();}},refresh(){if(!running)running=scan().finally(()=>{running=null;});return running;}};
}
