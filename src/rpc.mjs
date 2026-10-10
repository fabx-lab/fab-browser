export function validateRpcs(urls){
 if(!Array.isArray(urls)||urls.length<2)throw new Error('至少配置两个独立 HTTPS RPC');
 const normalized=urls.map(value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash)throw new Error('RPC 必须是无嵌入凭据的 HTTPS 地址');return u.href;});
 if(new Set(normalized.map(value=>new URL(value).hostname)).size<2)throw new Error('RPC 主机必须不同；请确认来自独立运营方');
 return normalized;
}
export function createRpc(getUrls,fetchImpl=fetch){return async(method,params=[])=>{
 let last;
 for(const url of getUrls())try{const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});const body=await response.json().catch(()=>null);if(body?.error)throw Object.assign(new Error(body.error.message),{code:body.error.code});if(!response.ok)throw new Error(`RPC HTTP ${response.status}`);if(!body)throw new Error('Invalid RPC response');if(body.result===undefined)throw new Error('Missing RPC result');return body.result;}catch(error){last=error;}
 throw last||new Error('No RPC available');
};}
