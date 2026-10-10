import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
// Explicit CLI-only acceptance harness; no website-facing automation bridge.
export async function runSmoke({app,window,chrome,getSite,getState,output}){
 const stamp=Date.now();
 const report={started:true,packaged:app.isPackaged,platform:process.platform,arch:process.arch,electron:process.versions.electron,chromium:process.versions.chrome};
 await fs.mkdir(output,{recursive:true});
 const shot=async(name,wc)=>{const image=await wc.capturePage();if(image.isEmpty())throw new Error(`Empty screenshot: ${name}`);await fs.writeFile(path.join(output,name),image.toPNG());};
 try{
  await chrome.webContents.executeJavaScript(`(async()=>{const end=Date.now()+10000;while(document.body.dataset.uiReady!=='true'&&Date.now()<end)await new Promise(r=>setTimeout(r,50));if(document.body.dataset.uiReady!=='true')throw Error('Shell initialization timeout');document.querySelector('#start-demo').click();})()`);
  await chrome.webContents.executeJavaScript(`(async()=>{const end=Date.now()+60000;while(!['ready','error'].includes(document.body.dataset.state)&&Date.now()<end)await new Promise(r=>setTimeout(r,100));})()`);
  report.state=getState();
  assert.equal(report.state?.status,'ready',report.state?.message||'Application did not become ready');
  const site=getSite();
  report.page=await site.webContents.executeJavaScript(`(async()=>{const end=Date.now()+10000;while(document.querySelectorAll('.cell').length!==225&&Date.now()<end)await new Promise(r=>setTimeout(r,100));return {title:document.title,url:location.href,cells:document.querySelectorAll('.cell').length,node:typeof require,bridge:typeof window.fabBrowser,ethereum:typeof window.ethereum};})()`);
  assert.equal(report.page.cells,225,'Expected game board');
  report.localGame=await site.webContents.executeJavaScript(`(async()=>{document.querySelector('#local').click();await new Promise(r=>setTimeout(r,100));for(const n of [0,15,1,16,2,17,3,18,4])document.querySelectorAll('.cell')[n].click();const result={black:document.querySelectorAll('#board .stone.black').length,white:document.querySelectorAll('#board .stone.white').length,status:document.querySelector('#status').textContent};document.querySelector('#restart').click();await new Promise(r=>setTimeout(r,100));result.reset=document.querySelectorAll('#board .stone').length===0;return result;})()`);
  report.game=await site.webContents.executeJavaScript(`(async()=>{document.querySelector('#ai').click();document.querySelectorAll('.cell')[112].click();const deadline=Date.now()+10000;while(!document.querySelector('#board .stone.white')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));return {black:document.querySelectorAll('#board .stone.black').length,white:document.querySelectorAll('#board .stone.white').length};})()`);
  report.isolation=await site.webContents.executeJavaScript(`(async()=>{try{await fetch('https://example.com');return {externalFetchBlocked:false};}catch{return {externalFetchBlocked:true};}})()`);
  await shot('desktop-smoke.png',site.webContents);
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
  report.passed=true;
 }catch(error){report.error=error.message;report.state=getState();console.error('Client smoke failed:',error.message);}
 try{await shot('shell-final.png',chrome.webContents);}catch(error){report.screenshotError=error.message;}
 await fs.writeFile(path.join(output,'desktop-smoke.json'),JSON.stringify(report,null,2));
 await fs.writeFile(path.join(output,`desktop-smoke-${stamp}.json`),JSON.stringify(report,null,2));
 app.exit(report.passed?0:1);
}
