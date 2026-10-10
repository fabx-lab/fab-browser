const address = /^0x[\da-f]{40}$/i;
export function parseBrowserTarget(raw,apps){
 try{return {...parseTarget(raw,apps),kind:'application'};}catch(error){
  const text=String(raw).trim();
  const candidate=/^https?:\/\//i.test(text)?text:/^(?:[\w-]+\.)+[a-z][\w-]*(?::\d+)?(?:[/?#].*)?$/i.test(text)?`https://${text}`:null;
  if(!candidate)throw error;
  const u=new URL(candidate);
  if(!/^https?:$/.test(u.protocol)||u.username||u.password)throw error;
  // A configured FAB gateway must always go through chain verification.
  if(apps.some(a=>safeOrigin(a.gateway)===u.origin))throw error;
  return {kind:'web',url:u.href,title:u.hostname};
 }
}
export function safeOrigin(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Gateway must be a bare HTTPS origin');
  return u.origin;
}
export function parseTarget(raw, apps) {
  let text = String(raw).trim();
  if(/^fab:\/\//i.test(text)){const url=new URL(text);if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Invalid FAB link');text=url.hostname;}
  const found = apps.find(a => text.toLowerCase() === a.container.toLowerCase() || text.toLowerCase() === `${a.circuits}#${a.tokenId}`.toLowerCase());
  if (found) return found;
  const named=apps.filter(a=>a.title?.toLowerCase()===text.toLowerCase());if(named.length===1)return named[0];
  try {
    const u = new URL(text);
    if (u.username || u.password || u.protocol !== 'https:') throw new Error();
    const app = apps.find(a => safeOrigin(a.gateway) === u.origin);
    if(app&&/^\/(?:v\/[1-9]\d*\/)?(?:index.html)?$/.test(u.pathname)&&!u.search&&!u.hash){const version=/^\/v\/([1-9]\d*)\//.exec(u.pathname)?.[1];return version?{...app,requestedVersion:version}:app;}
  } catch {}
  throw new Error('请输入已配置应用的容器地址、电路地址#NFT ID 或网关首页；暂不自动接受未知应用。');
}
export function releaseUrl(app, version) {
  if (!address.test(app.container) || !/^[1-9]\d*$/.test(String(version))) throw new Error('Invalid release identity');
  return `${safeOrigin(app.gateway)}/v/${version}/index.html`;
}
export function allowedNavigation(value, origin, version) {
  try {
    const u = new URL(value);
    return u.origin === origin && !u.username && !u.password && u.pathname.startsWith(`/v/${version}/`) && !/%2f|%5c|%2e/i.test(u.pathname);
  } catch { return false; }
}

export function parseCachedTarget(value,apps){const match=/^fab-cache:(0x[0-9a-f]{40})(?:@([1-9]\d*))?$/i.exec(String(value));if(!match)throw new Error('Invalid historical cache identity');return {...parseTarget(match[1],apps),kind:'application',offline:true,cachedVersion:match[2]||null};}
