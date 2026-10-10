import { chainReader } from './chain-reader.mjs';
import { validCID } from './registry-abi.mjs';
import { releaseUrl } from './navigation.mjs';
export async function resolveApp(app, config, reader = chainReader) {
  const binding = await reader({registry: config.registry, container: app.container, rpcs: config.rpcs})(app.requestedVersion?BigInt(app.requestedVersion):null);
  if (!validCID(binding.cid) || binding.version <= 0n) throw new Error('应用尚未发布或链上 CID 无效');
  return {...app,title: app.title, container: app.container, registry: config.registry, chainId: config.chainId,
    publisher:binding.publisher,publishedAt:binding.publishedAt,cid: binding.cid, version: String(binding.version), url: releaseUrl(app, binding.version),
    verification: '双 RPC 已核对链上 CID／版本；内容通过平台 HTTPS 网关获取，未在客户端独立验证 IPFS DAG。'};
}
