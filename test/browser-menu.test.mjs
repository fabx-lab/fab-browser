import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowserMenu} from '../electron/browser-menu.mjs';
test('native find callbacks never forward nonserializable Electron menu arguments',()=>{
 let template;const received=[];
 const noop=()=>{};
 installBrowserMenu({Menu:{buildFromTemplate:value=>{template=value;return value;},setApplicationMenu:noop},app:{setAboutPanelOptions:noop,getVersion:()=> 'test'},tabs:{},showFind:(...args)=>received.push(args),focusAddress:noop,showLibrary:noop,bookmark:noop,developer:noop});
 const edit=template.find(row=>row.label==='编辑').submenu;
 const native={};native.circular=native;
 for(const label of ['页内查找','下一个匹配','上一个匹配'])edit.find(row=>row.label===label).click(native,native);
 assert.deepEqual(received,[[],[true],[true,false]]);assert.doesNotThrow(()=>structuredClone(received));
});
