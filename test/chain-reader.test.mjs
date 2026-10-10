// Adapted with FAB chain-reader; see UPSTREAM.md.
import test from "node:test";
import assert from "node:assert/strict";
import { chainReader } from "../src/chain-reader.mjs";
import { registryAbi } from "../src/registry-abi.mjs";
import { encodeFunctionResult } from "viem";
const registry = "0x1111111111111111111111111111111111111111";
const container = "0x2222222222222222222222222222222222222222";
const cid = "bafybeigpdd4bse36vkftssyeyilaygj32e2bwv4x7u2bgvj25lumi5qs5i";
const rpcs = ["https://rpc-a.example", "https://rpc-b.example"];
const hash = "0x" + "a".repeat(64);
function fixture({ lag = false, disagreement = "", once = false } = {}) {
  const calls = [];
  let missing = once;
  const fetchImpl = async (url, options) => {
    const { method, params } = JSON.parse(options.body);
    calls.push({ url, method, params });
    let result;
    if (method === "eth_chainId") result = "0xc4";
    if (method === "eth_blockNumber")
      result = lag && url === rpcs[1] ? "0x64" : "0x6e";
    if (method === "eth_getBlockByNumber") {
      if (lag && url === rpcs[1] && BigInt(params[0]) > 100n) result = null;
      else if (missing && url === rpcs[1]) {
        missing = false;
        result = null;
      } else
        result = {
          number: params[0],
          hash:
            disagreement === "block" && url === rpcs[1]
              ? "0x" + "b".repeat(64)
              : hash,
        };
    }
    if (method === "eth_call") {
      result = encodeFunctionResult({
        abi: registryAbi,
        functionName: "site",
        result: [cid, 2n, registry, 1n],
      });
      if (disagreement === "binding" && url === rpcs[1])
        result = encodeFunctionResult({
          abi: registryAbi,
          functionName: "site",
          result: [cid, 3n, registry, 1n],
        });
    }
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  };
  return {
    calls,
    reader: chainReader({ registry, container, rpcs, fetchImpl }),
  };
}
test("lagging RPCs read a shared height instead of querying a future block", async () => {
  const f = fixture({ lag: true });
  assert.deepEqual(await f.reader(null), {cid,version:2n,publisher:'0x'+'1'.repeat(40),publishedAt:'1'});
  const blocks = f.calls.filter((c) => c.method === "eth_getBlockByNumber");
  assert.deepEqual(
    blocks.map((c) => c.params[0]),
    ["0x62", "0x62"],
  );
  assert.ok(
    f.calls
      .filter((c) => c.method === "eth_call")
      .every((c) => c.params[1] === "0x62"),
  );
});
test("a temporarily missing block is recovered only after a fresh verified read", async () => {
  assert.deepEqual(await fixture({ once: true }).reader(null), {
    cid,
    version: 2n,publisher:'0x'+'1'.repeat(40),publishedAt:'1',
  });
});
test("persistent block and binding disagreements still fail closed", async () => {
  await assert.rejects(
    fixture({ disagreement: "block" }).reader(null),
    /disagreement/,
  );
  await assert.rejects(
    fixture({ disagreement: "binding" }).reader(null),
    /disagreement/,
  );
});
