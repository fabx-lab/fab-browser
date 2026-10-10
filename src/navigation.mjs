const address = /^0x[\da-f]{40}$/i;
export function safeOrigin(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Gateway must be a bare HTTPS origin');
  return u.origin;
}
export function parseTarget(raw, apps) {
  const text = String(raw).trim();
  const found = apps.find(a => text.toLowerCase() === a.container.toLowerCase() || text.toLowerCase() === `${a.circuits}#${a.tokenId}`.toLowerCase());
  if (found) return found;
  try {
    const u = new URL(text);
    if (u.username || u.password || u.protocol !== 'https:') throw new Error();
    const app = apps.find(a => safeOrigin(a.gateway) === u.origin);
    if (app && /^\/(?:v\/[1-9]\d*\/)?(?:index.html)?$/.test(u.pathname) && !u.search && !u.hash) return app;
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
