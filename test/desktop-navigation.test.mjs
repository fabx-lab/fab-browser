import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';

// Execute the actual desktop navigation and registered reload handler with Electron
// events controlled by a fixture. This is behavior coverage, not desktop runtime evidence.
function fixture({failFirst=false}={}) {
  const source=readFileSync(new URL('../electron/main.mjs',import.meta.url),'utf8');
  const navigation=source.slice(source.indexOf('async function navigate(raw)'),source.indexOf('\napp.whenReady()'));
  const reload=source.split('\n').find(line=>line.startsWith("register('reload',"));
  const states=[],views=[],actions={};let reads=0;
  class View {
    constructor(){this.webContents=new EventEmitter();Object.assign(this.webContents,{close(){},setWindowOpenHandler(){},loadURL:async()=>{}});views.push(this);}
    setVisible(){}
  }
  const context={app:{isPackaged:false},
    parseTarget:raw=>({container:raw,gateway:'https://app.example'}),
    resolveApp:async target=>{reads++;if(failFirst&&reads===1)throw Error('RPC unavailable');return {...target,url:'https://app.example/v/2/index.html',version:'2',verification:'verified'};},
    config:{apps:[],chainId:196},session:{fromPartition:()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}}})},
    safeOrigin:()=> 'https://app.example',allowedNavigation:()=>true,WebContentsView:View,
    window:{contentView:{addChildView(){},removeChildView(){}}},bounds(){},smoke:true,
    state:data=>states.push({...data}),library:{visit(){}},register:(name,fn)=>{actions[name]=fn;}
  };
  const api=runInNewContext(`let site,current,lastTarget,requestId=0;${navigation}\n${reload}\n({navigate});`,context);
  return {...api,states,views,actions,get reads(){return reads;}};
}
test('late failure from a closed page cannot overwrite a newer application status',async()=>{
  const f=fixture();await f.navigate('application-a');assert.equal(f.states.at(-1).status,'ready',f.states.at(-1).message);const old=f.views[0];await f.navigate('application-b');
  old.webContents.emit('did-fail-load',{},-3,'old request aborted','https://app.example',true);
  assert.equal(f.states.at(-1).container,'application-b');assert.equal(f.states.at(-1).status,'ready');
  f.views[1].webContents.emit('did-fail-load',{},-105,'current load failed','https://app.example',true);
  assert.equal(f.states.at(-1).container,'application-b');assert.equal(f.states.at(-1).status,'error');
});
test('refresh retries the original target after the first RPC read failed',async()=>{
  const f=fixture({failFirst:true});await f.navigate('application-a');assert.equal(f.states.at(-1).status,'error');
  await f.actions.reload();assert.equal(f.reads,2);assert.equal(f.states.at(-1).status,'ready',f.states.at(-1).message);assert.equal(f.states.at(-1).container,'application-a');
});
