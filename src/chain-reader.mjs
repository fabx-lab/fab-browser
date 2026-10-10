// Adapted from FAB PoD tools/deweb/chain-reader.mjs; see UPSTREAM.md.
import {
  encodeFunctionData,
  decodeFunctionResult,
} from "viem";
import { registryAbi } from "./registry-abi.mjs";
export function chainReader({ registry, container, rpcs, fetchImpl = fetch }) {
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(registry) ||
    !/^0x[0-9a-fA-F]{40}$/.test(container) ||
    rpcs.length < 2
  )
    throw new Error("Missing registry or independent RPC providers");
  async function rpc(url, method, params) {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("RPC HTTP error");
    const j = await r.json();
    if (j.error || j.result === undefined) throw new Error("RPC error");
    return j.result;
  }
  async function snapshot(version) {
    const chainIds = await Promise.all(
      rpcs.map((u) => rpc(u, "eth_chainId", [])),
    );
    if (chainIds.some((c) => BigInt(c) !== 196n))
      throw new Error("Wrong chain");
    // Providers can be at different heights. Pick a height both have reached,
    // preserving the existing two-block confirmation offset.
    const heads = await Promise.all(
      rpcs.map((u) => rpc(u, "eth_blockNumber", [])),
    );
    const latest = heads.map(BigInt).reduce((a, b) => (a < b ? a : b));
    const block = "0x" + (latest > 2n ? latest - 2n : latest).toString(16);
    const blocks = await Promise.all(
      rpcs.map((u) => rpc(u, "eth_getBlockByNumber", [block, false])),
    );
    if (blocks.some((b) => !b?.hash))
      throw new Error("RPC block temporarily missing");
    if (
      blocks.some(
        (b) => BigInt(b.number) !== BigInt(block) || b.hash !== blocks[0].hash,
      )
    )
      throw new Error("RPC block disagreement");
    const functionName = version === null ? "site" : "release",
      args = version === null ? [container] : [container, version];
    const data = encodeFunctionData({ abi: registryAbi, functionName, args });
    const reads = await Promise.all(
      rpcs.map((u) => rpc(u, "eth_call", [{ to: registry, data }, block])),
    );
    if (reads.some((r) => r !== reads[0]))
      throw new Error("RPC binding disagreement");
    const result = decodeFunctionResult({
      abi: registryAbi,
      functionName,
      data: reads[0],
    });
    return version === null
      ? { cid: result[0], version: result[1], publisher:result[2], publishedAt:String(result[3]) }
      : {cid:result.cid,version,publisher:result.publisher,publishedAt:String(result.publishedAt)};
  }
  return async (version) => {
    // Retry transport/missing-block failures once with fresh heads. Never reduce quorum
    // or use a stale current binding to turn a failed verification into success.
    for (let attempt = 0; ; attempt++) {
      try {
        return await snapshot(version);
      } catch (error) {
        if (attempt >= 1 || /Wrong chain|disagreement/.test(error.message))
          throw error;
      }
    }
  };
}
