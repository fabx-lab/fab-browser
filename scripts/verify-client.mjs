// Exercise the actual distributable, not the development Electron executable.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const platform=process.platform, arch=process.arch;
const release=path.resolve('release');
const files=await fs.readdir(release);
const suffix=platform==='darwin'?`mac-${arch}.dmg`:platform==='win32'?'win-x64-setup.exe':'linux-x86_64.AppImage';
const asset=path.join(release,files.find(f=>f.endsWith(suffix))??'missing-client');
await fs.access(asset);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fab-client-'));
const output=path.resolve(`artifacts/client-${platform}-${arch}`);
await fs.mkdir(output,{recursive:true});
const run=(file,args,options={})=>new Promise((resolve,reject)=>{
 const child=spawn(file,args,{stdio:'inherit',...options});
 const timer=setTimeout(()=>{child.kill();reject(new Error(`${file} timed out`));},180000);
 child.once('error',error=>{clearTimeout(timer);reject(error);});
 child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`${file} exited ${code}`));});
});
let mounted=false;
try {
 let binary;
 if(platform==='darwin'){
  const mount=path.join(temp,'mount');await fs.mkdir(mount);
  await run('hdiutil',['attach',asset,'-readonly','-nobrowse','-mountpoint',mount]);mounted=true;
  binary=path.join(mount,'FABDeWEB.app/Contents/MacOS/FABDeWEB');
 }else if(platform==='win32'){
  const install=path.join(temp,'installed');
  await run(asset,['/S',`/D=${install}`]);
  binary=path.join(install,'FABDeWEB.exe');
 }else{
  await fs.chmod(asset,0o755);
  await run(asset,['--appimage-extract'],{cwd:temp,stdio:'ignore'});
  binary=path.join(temp,'squashfs-root/AppRun');
 }
 await run(binary,['--fab-smoke'],{env:{...process.env,FAB_SMOKE_OUTPUT:output}});
 const report=JSON.parse(await fs.readFile(path.join(output,'desktop-smoke.json'),'utf8'));
 assert.equal(report.packaged,true);assert.equal(report.platform,platform);assert.equal(report.arch,arch);
 assert.equal(report.page.cells,225);assert.equal(report.page.node,'undefined');assert.equal(report.page.bridge,'undefined');
 assert.equal(report.game.black,1);assert.equal(report.game.white,1);
 assert.equal(report.localGame.black,5);assert.equal(report.localGame.white,4);assert.match(report.localGame.status,/黑棋获胜/);assert.equal(report.localGame.reset,true);
 assert.equal(report.isolation.externalFetchBlocked,true);
 console.log(`Verified packaged ${platform}/${arch}: AI, local win, restart and isolation. Evidence: ${output}`);
}finally{
 if(mounted)await run('hdiutil',['detach',path.join(temp,'mount')]);
 // Windows installer registers an uninstaller. Retain it on failure for diagnosis;
 // CI machines are disposable, while macOS/Linux mounts and extracted files are removed.
 if(platform!=='win32')await fs.rm(temp,{recursive:true,force:true});
}
