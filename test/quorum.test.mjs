import test from 'node:test';import assert from 'node:assert/strict';import {quorum} from '../src/quorum.mjs';
const config={rpcs:['https://a.test','https://b.test']};
function fixture(disagree=false){return async(url,{body})=>{const {method}=JSON.parse(body),second=url.includes('b.test');const result=method==='eth_chainId'?'0xc4':method==='eth_blockNumber'?'0x64':method==='eth_getBlockByNumber'?second?{number:'0x62',hash:disagree?'different':'same',extra:'provider field'}:{hash:'same',number:'0x62'}:'0xresult';return Response.json({result});};}
test('quorum compares canonical block identity across provider-specific metadata',async()=>{const q=await quorum(config,{fetchImpl:fixture()});assert.equal(q.block,'0x62');assert.equal(await q.call({to:'0xaddress'}),'0xresult');});
test('quorum never accepts providers disagreeing on block hash',async()=>{await assert.rejects(quorum(config,{fetchImpl:fixture(true)}),/disagreement/);});
