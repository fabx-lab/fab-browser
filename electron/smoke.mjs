import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
// Explicit CLI-only acceptance harness; no website-facing automation bridge.
export async function runSmoke({app,window,chrome,getSite,getState,output,controls,walletBridgeURL}){
 const stamp=Date.now();
 const report={started:true,packaged:app.isPackaged,platform:process.platform,arch:process.arch,electron:process.versions.electron,chromium:process.versions.chrome};
 await fs.mkdir(output,{recursive:true});
 let fixture,walletSocket,localRoot;
 const shot=async(name,wc)=>{await wc.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const image=await wc.capturePage();if(image.isEmpty())throw new Error(`Empty screenshot: ${name}`);await fs.writeFile(path.join(output,name),image.toPNG());};
 try{
  await chrome.webContents.executeJavaScript(`(async()=>{const end=Date.now()+10000;while(document.body.dataset.uiReady!=='true'&&Date.now()<end)await new Promise(r=>setTimeout(r,50));if(document.body.dataset.uiReady!=='true')throw Error('Shell initialization timeout');document.querySelector('#start-demo').click();})()`);
  await chrome.webContents.executeJavaScript(`(async()=>{const end=Date.now()+60000;while(!['ready','error'].includes(document.body.dataset.state)&&Date.now()<end)await new Promise(r=>setTimeout(r,100));})()`);
  report.state=getState();
  assert.equal(report.state?.status,'ready',report.state?.message||'Application did not become ready');
  report.balance=await chrome.webContents.executeJavaScript('window.fabBrowser.siteBalance()');assert.ok(BigInt(report.balance.wei)>=0n);
  const site=getSite();
  report.page=await site.webContents.executeJavaScript(`(async()=>{const end=Date.now()+10000;while(document.querySelectorAll('.cell').length!==225&&Date.now()<end)await new Promise(r=>setTimeout(r,100));return {title:document.title,url:location.href,cells:document.querySelectorAll('.cell').length,node:typeof require,bridge:typeof window.fabBrowser,ethereum:typeof window.ethereum};})()`);
  assert.equal(report.page.cells,225,'Expected game board');
  report.localGame=await site.webContents.executeJavaScript(`(async()=>{document.querySelector('#local').click();await new Promise(r=>setTimeout(r,100));for(const n of [0,15,1,16,2,17,3,18,4])document.querySelectorAll('.cell')[n].click();const result={black:document.querySelectorAll('#board .stone.black').length,white:document.querySelectorAll('#board .stone.white').length,status:document.querySelector('#status').textContent};document.querySelector('#restart').click();await new Promise(r=>setTimeout(r,100));result.reset=document.querySelectorAll('#board .stone').length===0;return result;})()`);
  report.game=await site.webContents.executeJavaScript(`(async()=>{document.querySelector('#ai').click();document.querySelectorAll('.cell')[112].click();const deadline=Date.now()+10000;while(!document.querySelector('#board .stone.white')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));return {black:document.querySelectorAll('#board .stone.black').length,white:document.querySelectorAll('#board .stone.white').length};})()`);
  report.isolation=await site.webContents.executeJavaScript(`(async()=>{try{await fetch('https://example.com');return {externalFetchBlocked:false};}catch{return {externalFetchBlocked:true};}})()`);
  await shot('desktop-smoke.png',site.webContents);
  // Exercise real tab controls and prove switching preserves a live chess board.
  await chrome.webContents.executeJavaScript(`(async()=>{document.querySelector('#new-tab').click();const end=Date.now()+10000;while(document.querySelectorAll('[role="tab"]').length!==2&&Date.now()<end)await new Promise(r=>setTimeout(r,50));})()`);
  assert.equal(getSite(),null,'New tab must start blank');
  await chrome.webContents.executeJavaScript(`(async()=>{document.querySelector('#start-demo').click();const end=Date.now()+60000;while(!['ready','error'].includes(document.body.dataset.state)&&Date.now()<end)await new Promise(r=>setTimeout(r,100));})()`);
  assert.equal(getState().status,'ready',getState().message);
  const second=getSite();assert.notEqual(second,site);
  assert.equal(await second.webContents.executeJavaScript("document.querySelectorAll('#board .stone').length"),0,'Second tab must have a fresh board');
  await shot('shell-tabs.png',chrome.webContents);
  await chrome.webContents.executeJavaScript(`(async()=>{document.querySelector('[role="tab"]').click();const end=Date.now()+10000;while(document.querySelector('[role="tab"]').getAttribute('aria-selected')!=='true'&&Date.now()<end)await new Promise(r=>setTimeout(r,50));})()`);
  assert.equal(getSite(),site,'Switching must reuse the original page');
  assert.equal(await site.webContents.executeJavaScript("document.querySelectorAll('#board .stone').length"),2,'Switching must preserve the game');
  await chrome.webContents.executeJavaScript(`(async()=>{document.querySelectorAll('.tab-close')[1].click();const end=Date.now()+10000;while(document.querySelectorAll('[role="tab"]').length!==1&&Date.now()<end)await new Promise(r=>setTimeout(r,50));})()`);
  assert.equal(getSite(),site);report.tabs={newBlank:true,independentBoards:true,preservedOnSwitch:true,closePreservesOther:true};

  // Native page search and zoom must operate on the selected website, not the shell.
  await chrome.webContents.executeJavaScript("document.querySelector('#find-button').click()");
  await chrome.webContents.executeJavaScript(`(async()=>{document.querySelector('#find-input').value='执黑';document.querySelector('#find-input').dispatchEvent(new Event('input'));const end=Date.now()+5000;while(document.querySelector('#find-result').textContent==='0 / 0'&&Date.now()<end)await new Promise(r=>setTimeout(r,50));})()`);
  const matches=await chrome.webContents.executeJavaScript("document.querySelector('#find-result').textContent");assert.notEqual(matches,'0 / 0','Find must locate visible page text');
  await chrome.webContents.executeJavaScript("window.fabBrowser.zoom(1)");assert.equal(site.webContents.getZoomFactor(),1.1);
  await chrome.webContents.executeJavaScript("document.querySelector('#zoom-reset').click()");
  await chrome.webContents.executeJavaScript('new Promise(resolve=>setTimeout(resolve,100))');assert.equal(site.webContents.getZoomFactor(),1);
  await chrome.webContents.executeJavaScript("document.querySelector('#find-close').click()");
  await chrome.webContents.executeJavaScript('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(site.getBounds().y,96);report.controls={find:matches,zoomReset:true};

  report.layouts=[];
  for(const [width,height] of [[1280,900],[800,700],[390,844]]){
   window.setContentSize(width,height);
   await chrome.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const result=await chrome.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,toolbarHeight:document.querySelector('.toolbar').getBoundingClientRect().height})`);
   result.applicationBounds=site.getBounds();report.layouts.push(result);
   assert.equal(result.overflow,false,`Shell overflow at ${width}`);
   await shot(`shell-${width}.png`,chrome.webContents);
   await chrome.webContents.executeJavaScript("document.querySelector('#panel-toggle').click()");
   await chrome.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   await shot(`sidebar-${width}.png`,chrome.webContents);
   assert.equal(site.getVisible(),width>=700,'Narrow sidebar must hide game; wide sidebar must preserve it');
   await chrome.webContents.executeJavaScript("document.querySelector('#panel-close').click()");
  }
  window.setContentSize(1280,900);
  assert.equal(report.page.node,'undefined');assert.equal(report.page.bridge,'undefined');
  assert.equal(report.localGame.black,5);assert.equal(report.localGame.white,4);assert.match(report.localGame.status,/黑棋获胜/);assert.equal(report.localGame.reset,true);
  assert.equal(report.game.black,1);assert.equal(report.game.white,1);assert.equal(report.isolation.externalFetchBlocked,true);
  // An isolated local HTTP fixture proves ordinary browsing without public-network dependencies.
  fixture=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Browser fixture</title><h1>Ordinary browsing</h1>');});
  await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));const webUrl=`http://127.0.0.1:${fixture.address().port}/`;
  await chrome.webContents.executeJavaScript(`(async()=>{document.querySelector('#new-tab').click();await new Promise(r=>setTimeout(r,100));document.querySelector('#input').value=${JSON.stringify(webUrl)};document.querySelector('#address').requestSubmit();const end=Date.now()+10000;while(document.body.dataset.state!=='ready'&&Date.now()<end)await new Promise(r=>setTimeout(r,50));})()`);
  assert.equal(getState().kind,'web');const web=getSite();report.web=await web.webContents.executeJavaScript('({title:document.title,node:typeof require,bridge:typeof window.fabBrowser})');assert.equal(report.web.title,'Browser fixture');assert.equal(report.web.node,'undefined');assert.equal(report.web.bridge,'undefined');
  assert.equal(await chrome.webContents.executeJavaScript("document.querySelector('#metadata').hidden"),true,'Ordinary pages cannot display chain verification');
  // Fake extension only: exercises real preload -> main -> authenticated bridge.
  // It cannot sign real transactions and never receives a private key.
  const walletURL=new URL(walletBridgeURL()),account='0x'+'1'.repeat(40);
  walletSocket=new WebSocket(`ws://${walletURL.host}/ws${walletURL.search}`,{origin:walletURL.origin});
  await new Promise(resolve=>walletSocket.once('open',resolve));
  walletSocket.on('message',data=>{const message=JSON.parse(data);if(message.type==='request')walletSocket.send(JSON.stringify({type:'response',id:message.id,result:'fixture-signature'}));});
  walletSocket.send(JSON.stringify({type:'state',ready:true,wallet:'Smoke fixture',accounts:[account],chainId:'0xc4'}));
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await web.webContents.executeJavaScript("window.ethereum.request({method:'eth_chainId'})"),'0xc4');
  const denied=await web.webContents.executeJavaScript("window.ethereum.request({method:'eth_requestAccounts'}).then(()=>null,error=>error.code)");assert.equal(denied,4001);
  controls.response=1;
  const addresses=await web.webContents.executeJavaScript("window.ethereum.request({method:'eth_requestAccounts'})");assert.deepEqual(addresses,[account]);
  const signature=await web.webContents.executeJavaScript(`window.ethereum.request({method:'personal_sign',params:['0x74657374',${JSON.stringify(account)}]})`);assert.equal(signature,'fixture-signature');
  assert.equal(await chrome.webContents.executeJavaScript('window.fabBrowser.walletSwitch()'),true);
  const walletStatus=await chrome.webContents.executeJavaScript('window.fabBrowser.walletStatus()');assert.ok(!('bridgeToken'in walletStatus));
  await chrome.webContents.executeJavaScript(`window.fabBrowser.walletRevoke(${JSON.stringify(new URL(webUrl).origin)})`);
  assert.deepEqual(await web.webContents.executeJavaScript("window.ethereum.request({method:'eth_accounts'})"),[]);
  report.wallet={fixture:true,chainId:'0xc4',connectDenied:true,connectApproved:true,signatureForwarded:true,manualChainSwitch:true,revocation:true,realExtension:false,realTransactions:0};
  await chrome.webContents.executeJavaScript('window.fabBrowser.walletDisconnect()');walletSocket.terminate();walletSocket=null;
  // Exercise actual file protocol, UI precheck and fs.watch reload.
  localRoot=await fs.mkdtemp(path.join(tmpdir(),'fab-preview-smoke-'));controls.folder=localRoot;
  await fs.writeFile(path.join(localRoot,'index.html'),'<title>Local preview fixture</title><script src="app.js"></script><h1>Preview</h1>');
  await fs.writeFile(path.join(localRoot,'app.js'),'document.documentElement.dataset.preview="v1";');
  await fs.writeFile(path.join(localRoot,'.env'),'MUST_NOT_BE_READ');
  await chrome.webContents.executeJavaScript('window.fabBrowser.localOpen()');
  const wait=async predicate=>{const end=Date.now()+10000;while(!await predicate()&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,50));assert.ok(await predicate(),'Timed out waiting for preview');};
  await wait(()=>getState()?.kind==='local'&&getState()?.status==='ready');
  const preview=getSite();assert.equal(await preview.webContents.executeJavaScript('document.documentElement.dataset.preview'),'v1');
  assert.equal(await preview.webContents.executeJavaScript('typeof window.ethereum'),'undefined');
  assert.equal(await preview.webContents.executeJavaScript("fetch('/.env').then(r=>r.status)"),400);
  await fs.writeFile(path.join(localRoot,'app.js'),'document.documentElement.dataset.preview="v2";');
  await wait(async()=>getState()?.status==='ready'&&await getSite().webContents.executeJavaScript('document.documentElement.dataset.preview')==='v2');
  await chrome.webContents.executeJavaScript("document.querySelector('#management-close').click()");
  report.preview={rendered:true,nodeUnavailable:true,secretBlocked:true,hotReload:true};
  // Cached historical release requires a deliberate action and a visible label.
  await chrome.webContents.executeJavaScript(`window.fabBrowser.offlineOpen(${JSON.stringify(report.state.container)})`);
  await wait(()=>getState()?.status==='ready'&&getState()?.offline===true);
  assert.equal(await getSite().webContents.executeJavaScript("document.querySelectorAll('.cell').length"),225);
  report.cache={explicitOffline:true,boardCells:225,usage:await chrome.webContents.executeJavaScript('window.fabBrowser.cacheUsage()')};
  await chrome.webContents.executeJavaScript("document.querySelector('#settings-button').click()");
  await wait(()=>chrome.webContents.executeJavaScript("!document.querySelector('#management').hidden&&document.querySelector('#management-content').textContent.includes('RPC')"));
  await shot('settings.png',chrome.webContents);
  assert.equal(getSite().getVisible(),false,'Management must hide native website');
  await chrome.webContents.executeJavaScript("document.querySelector('#management-close').click()");
  report.settings={opened:true};
  const catalogRows=await chrome.webContents.executeJavaScript('window.fabBrowser.catalogRefresh()');
  assert.ok(catalogRows.some(row=>row.container.toLowerCase()===report.state.container.toLowerCase()&&row.category==='game'),'Directory must load and categorize chain-published game');
  await chrome.webContents.executeJavaScript("document.querySelector('#catalog-open').click()");
  await wait(()=>chrome.webContents.executeJavaScript("document.querySelectorAll('.catalog-card').length>0"));
  await shot('catalog.png',chrome.webContents);report.catalog={source:'liveRegistry',apps:catalogRows.length,persistedMetadata:true};
  window.setContentSize(390,844);await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await chrome.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth'),false);
  await shot('catalog-390.png',chrome.webContents);window.setContentSize(1280,900);
  await chrome.webContents.executeJavaScript("window.fabBrowser.saveLanguage('zh').then(()=>location.reload())");
  await wait(()=>chrome.webContents.executeJavaScript("document.body.dataset.uiReady==='true'&&document.querySelector('#settings-button').getAttribute('aria-label')==='设置'"));
  assert.equal(getSite().getVisible(),true,'Language reload restores active application view');
  await chrome.webContents.executeJavaScript("document.querySelector('#settings-button').click()");
  await wait(()=>chrome.webContents.executeJavaScript("document.querySelector('#management-title').textContent==='设置'&&document.querySelectorAll('.management-card').length>=5"));
  await shot('settings-zh.png',chrome.webContents);report.settings.languageSwitch=true;
  await chrome.webContents.executeJavaScript("document.querySelector('#management-close').click()");
  report.passed=true;
 }catch(error){report.error=error.message;report.state=getState();console.error('Client smoke failed:',error.message);}
 walletSocket?.terminate();if(localRoot)await fs.rm(localRoot,{recursive:true,force:true});
 if(fixture)await new Promise(resolve=>fixture.close(resolve));
 try{await shot('shell-final.png',chrome.webContents);}catch(error){report.screenshotError=error.message;}
 await fs.writeFile(path.join(output,'desktop-smoke.json'),JSON.stringify(report,null,2));
 await fs.writeFile(path.join(output,`desktop-smoke-${stamp}.json`),JSON.stringify(report,null,2));
 // Exercise normal multi-view window teardown too; app.exit would bypass it.
 if(report.passed)window.close();else app.exit(1);
}
