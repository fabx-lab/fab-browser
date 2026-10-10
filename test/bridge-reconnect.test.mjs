import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../bridge/bridge.js',import.meta.url),'utf8');
// Execute the shipped bridge request handler against deferred extension requests.
const handler=source.slice(source.indexOf('  async function onRequest'),source.indexOf('\n  function open()'));
for(const outcome of ['success','error'])test(`reconnected wallet never receives a stale ${outcome} response`,async()=>{
 const makeSocket=()=>({readyState:1,messages:[],send(value){this.messages.push(JSON.parse(value));}});
 const old=makeSocket(),next=makeSocket(),requests=[];
 const context=vm.createContext({ws:old,WebSocket:{OPEN:1},epoch:1,selecting:false,current:{provider:{request:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))}},log(){},report(){},refreshChain:async()=>{},safeError:e=>({code:4900,message:e.message})});
 vm.runInContext(handler,context);
 const pending=vm.runInContext("onRequest({id:'old:1',method:'personal_sign',params:[]})",context);
 old.readyState=3;context.ws=next;
 const fresh=vm.runInContext("onRequest({id:'new:1',method:'personal_sign',params:[]})",context);
 if(outcome==='success')requests[0].resolve('old signature');else requests[0].reject(new Error('old rejection'));
 await pending;assert.deepEqual(next.messages,[]);assert.deepEqual(old.messages,[]);
 requests[1].resolve('new signature');await fresh;
 assert.deepEqual(next.messages,[{type:'response',id:'new:1',result:'new signature'}]);
});
