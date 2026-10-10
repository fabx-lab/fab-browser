import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createApplicationTabs} from '../electron/application-tabs.mjs';
function fixture({resolve}={}){
 const views=[],states=[],partitions=[];let reads=0,windowDestroyed=false;
 class View{constructor(){this.visible=false;this.webContents=new EventEmitter();Object.assign(this.webContents,{navigationHistory:{canGoBack:()=>false,canGoForward:()=>false},setWindowOpenHandler(){},close(){},loadURL:async()=>{},getZoomFactor:()=>this.zoom||1,setZoomFactor:value=>{this.zoom=value;},findInPage:(text,options)=>{this.find={text,options};},stopFindInPage:()=>{this.find=null;},stop:()=>{this.stopped=true;}});views.push(this);}setVisible(v){this.visible=v;}setBounds(v){this.bounds=v;}}
 const tabs=createApplicationTabs({window:{isDestroyed:()=>windowDestroyed,contentView:{addChildView(){},removeChildView(){if(windowDestroyed)throw Error('Destroyed window');}}},WebContentsView:View,session:{fromPartition:key=>{partitions.push(key);return {setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}}};}},config:{chainId:196,registry:'0x'+'1'.repeat(40),apps:[]},parseTarget:raw=>({container:raw,gateway:'https://app.example'}),safeOrigin:()=> 'https://app.example',allowedNavigation:()=>true,resolveApp:async target=>{reads++;if(resolve)return resolve(target,reads);return {...target,url:'https://app.example/v/2/index.html',version:'2',verification:'verified',title:target.container};},library:{visit(){}},getLayout:()=>({application:{x:0,y:96,width:1280,height:776},hideApplication:false}),onChange(){},onState:s=>states.push(s)});
 tabs.open();return {tabs,views,states,partitions,closeWindow:()=>{windowDestroyed=true;tabs.dispose();},get reads(){return reads;}};
}
test('switching tabs preserves each view and closes only the selected game',async()=>{
 const f=fixture();await f.tabs.navigate('app-a');const first=f.tabs.snapshot().activeId,view=f.tabs.site();view.savedBoard='played';
 const second=f.tabs.open();assert.equal(view.visible,false);assert.equal(f.tabs.site(),null);
 await f.tabs.navigate('app-b');const other=f.tabs.site();f.tabs.activate(first);assert.equal(f.tabs.site(),view);assert.equal(view.savedBoard,'played');assert.equal(view.visible,true);assert.equal(other.visible,false);
 f.tabs.close(second);assert.equal(f.tabs.site(),view);f.tabs.close(first);assert.equal(f.tabs.snapshot().tabs.length,1);assert.equal(f.tabs.state().status,'blank');assert.equal(f.tabs.site(),null);
});
test('background RPC completion cannot replace selected tab state',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const f=fixture({resolve:async(target,count)=>{if(count===1)await gate;return {...target,url:'https://app.example/v/2/index.html',version:'2',verification:'verified',title:target.container};}});
 const first=f.tabs.snapshot().activeId,pending=f.tabs.navigate('app-a');f.tabs.open();await f.tabs.navigate('app-b');release();await pending;
 assert.equal(f.tabs.state().container,'app-b');assert.equal(f.states.at(-1).container,'app-b');f.tabs.activate(first);assert.equal(f.tabs.state().container,'app-a');
});
test('late failure from replaced view cannot overwrite current view',async()=>{
 const f=fixture();await f.tabs.navigate('app-a');const old=f.tabs.site();await f.tabs.reload();old.webContents.emit('did-fail-load',{},-3,'old aborted','',true);assert.equal(f.tabs.state().status,'ready');
 f.tabs.site().webContents.emit('did-fail-load',{},-105,'current failed','',true);assert.equal(f.tabs.state().status,'error');
});
test('refresh retries failed RPC and closed pending tabs never create a view',async()=>{
 const f=fixture({resolve:async(target,count)=>{if(count===1)throw Error('RPC unavailable');return {...target,url:'https://app.example/v/2/index.html',version:'2',verification:'verified'};}});
 await f.tabs.navigate('app-a');assert.equal(f.tabs.state().status,'error');await f.tabs.reload();assert.equal(f.reads,2);assert.equal(f.tabs.state().status,'ready');
 let release;const gate=new Promise(r=>release=r),g=fixture({resolve:async target=>{await gate;return {...target,version:'2'};}});const pending=g.tabs.navigate('app-a');g.tabs.close();release();await pending;assert.equal(g.views.length,0);assert.equal(g.tabs.state().status,'blank');
});
test('different releases use separate request-filter sessions and reject unknown tab IDs',async()=>{
 const f=fixture({resolve:async(target,count)=>({...target,url:`https://app.example/v/${count}/index.html`,version:String(count),verification:'verified'})});await f.tabs.navigate('app-a');f.tabs.open();await f.tabs.navigate('app-a');assert.notEqual(f.partitions[0],f.partitions[1]);assert.throws(()=>f.tabs.activate(999),/Unknown tab/);assert.throws(()=>f.tabs.close('1'),/Unknown tab/);
});

test('browser controls operate on the active tab and switching clears page search',async()=>{
 const f=fixture();await f.tabs.navigate('app-a');const first=f.tabs.snapshot().activeId,view=f.tabs.site();
 f.tabs.find('执黑');assert.deepEqual(view.find,{text:'执黑',options:{forward:true,findNext:true}});
 f.tabs.find('执黑',{forward:false,again:true});assert.equal(view.find.options.findNext,false);
 assert.equal(f.tabs.zoom(1),110);assert.equal(f.tabs.zoom(0),100);assert.throws(()=>f.tabs.zoom(9),/Invalid zoom/);
 const other=f.tabs.open();await f.tabs.navigate('app-b');f.tabs.activate(first);f.tabs.cycle(1);assert.equal(f.tabs.snapshot().activeId,other);assert.equal(view.find,null);
 f.tabs.select(0);assert.equal(f.tabs.snapshot().activeId,first);f.tabs.stop();assert.equal(view.stopped,true);assert.equal(f.tabs.state().status,'ready');
});

test('window shutdown disposes pages after the native window has been destroyed',async()=>{const f=fixture();await f.tabs.navigate('app-a');f.tabs.open();await f.tabs.navigate('app-b');assert.doesNotThrow(()=>f.closeWindow());assert.equal(f.tabs.snapshot().tabs.length,0);});
