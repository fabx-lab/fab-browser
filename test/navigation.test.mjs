import test from 'node:test';import assert from 'node:assert/strict';
import {config} from '../src/config.mjs';import {parseBrowserTarget,parseTarget,releaseUrl,allowedNavigation,safeOrigin} from '../src/navigation.mjs';import {resolveApp} from '../src/resolver.mjs';
const app=config.apps[0];const cid='bafybeigpdd4bse36vkftssyeyilaygj32e2bwv4x7u2bgvj25lumi5qs5i';
test('all supported identities select same configured application',()=>{for(const raw of [app.container,`${app.circuits}#3`,app.gateway,`${app.gateway}/v/2/index.html`]) assert.equal(parseTarget(raw,config.apps),app);});
test('unknown origins, credential URLs and arbitrary paths cannot become applications',()=>{for(const value of ['https://attacker.example','https://user@'+new URL(app.gateway).host,`${app.gateway}/evil.html`,'javascript:alert(1)','file:///etc/passwd']) assert.throws(()=>parseTarget(value,config.apps));});
test('release navigation stays under exact application origin and version',()=>{assert.equal(releaseUrl(app,2n),`${app.gateway}/v/2/index.html`);assert.ok(allowedNavigation(`${app.gateway}/v/2/app.mjs`,app.gateway,'2'));for(const url of [`${app.gateway}/v/3/index.html`,`${app.gateway}/v/2/../3/index.html`,'https://attacker.example/v/2/a',`${app.gateway}/v/2/%2e%2e/a`]) assert.equal(allowedNavigation(url,app.gateway,'2'),false);assert.throws(()=>safeOrigin(app.gateway+'/foo'));});
test('verified current binding pins navigation to returned version and CID',async()=>{const result=await resolveApp(app,config,()=>async()=>({cid,version:2n}));assert.equal(result.cid,cid);assert.equal(result.url,`${app.gateway}/v/2/index.html`);assert.match(result.verification,/未在客户端独立验证/);});
test('unpublished, invalid CID and quorum failures never navigate',async()=>{for(const binding of [{cid:'',version:0n},{cid:'invalid',version:2n}])await assert.rejects(resolveApp(app,config,()=>async()=>binding));await assert.rejects(resolveApp(app,config,()=>async()=>{throw new Error('RPC block disagreement')}),/disagreement/);});

test('ordinary websites are separate from chain-verified apps and reject privileged schemes',()=>{
 assert.equal(parseBrowserTarget('example.com/Hello',config.apps).url,'https://example.com/Hello');
 assert.equal(parseBrowserTarget('http://127.0.0.1:8090/',config.apps).kind,'web');
 assert.equal(parseBrowserTarget(app.gateway,config.apps).kind,'application');
 for(const input of ['file:///etc/passwd','javascript:alert(1)','https://user:secret@example.com',`${app.gateway}/evil.html`])assert.throws(()=>parseBrowserTarget(input,config.apps));
});
