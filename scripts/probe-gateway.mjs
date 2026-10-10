import fs from 'node:fs/promises';
import {config} from '../src/config.mjs';
const results=[];
for(const path of ['/v/2/index.html','/v/2/app.mjs','/v/2/style.css']){
 const url=config.apps[0].gateway+path;
 try{const response=await fetch(url,{signal:AbortSignal.timeout(20000)});const body=await response.text();results.push({url,status:response.status,type:response.headers.get('content-type'),cache:response.headers.get('x-fab-cache'),bytes:body.length,prefix:body.slice(0,120)});}catch(error){results.push({url,error:error.message});}
}
await fs.mkdir('artifacts/gateway-probe',{recursive:true});await fs.writeFile('artifacts/gateway-probe/result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
