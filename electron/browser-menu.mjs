// Adapted from TapeBrowser's native browser menu; FAB chain resolution stays in tabs.
export function installBrowserMenu({Menu,app,window,tabs,focusAddress,showFind,showLibrary,bookmark,developer}){
 const item=(label,accelerator,click)=>({label,accelerator,click});
 const separator={type:'separator'};
 const template=[
  ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
  {label:'文件',submenu:[item('新标签页','CmdOrCtrl+T',()=>{tabs.open();focusAddress();}),item('地址栏','CmdOrCtrl+L',focusAddress),item('关闭标签页','CmdOrCtrl+W',()=>tabs.close()),separator,{role:'quit',label:'退出'}]},
  {label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},separator,{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'},separator,item('页内查找','CmdOrCtrl+F',()=>showFind()),item('下一个匹配','CmdOrCtrl+G',()=>showFind(true)),item('上一个匹配','CmdOrCtrl+Shift+G',()=>showFind(true,false))]},
  {label:'查看',submenu:[item('刷新最新版本','CmdOrCtrl+R',tabs.reload),item('停止加载',undefined,tabs.stop),item('后退','CmdOrCtrl+[',tabs.back),item('前进','CmdOrCtrl+]',tabs.forward),separator,item('下一个标签页','Ctrl+Tab',()=>tabs.cycle(1)),item('上一个标签页','Ctrl+Shift+Tab',()=>tabs.cycle(-1)),...Array.from({length:9},(_,i)=>item(i===8?'最后一个标签页':`标签页 ${i+1}`,`CmdOrCtrl+${i+1}`,()=>tabs.select(i))),separator,item('放大','CmdOrCtrl+=',()=>tabs.zoom(1)),item('缩小','CmdOrCtrl+-',()=>tabs.zoom(-1)),item('实际大小','CmdOrCtrl+0',()=>tabs.zoom(0)),separator,{role:'togglefullscreen',label:'全屏'},item('开发者工具',process.platform==='darwin'?'Alt+Command+I':'Ctrl+Shift+I',tabs.devtools)]},
  {label:'书签',submenu:[item('添加／移除书签','CmdOrCtrl+D',bookmark),item('书签与最近访问','CmdOrCtrl+Shift+B',showLibrary)]},
  {role:'windowMenu',label:'窗口'},
  {label:'帮助',submenu:[{label:'FAB 开发者文档',click:developer},{label:'关于 FAB Browser',click:()=>app.showAboutPanel()}]},
 ];
 app.setAboutPanelOptions({applicationName:'FAB DeWEB Browser',applicationVersion:app.getVersion(),copyright:'GPL-3.0-or-later · Based on TapeBrowser',website:'https://github.com/cybercity001/fab-browser'});
 Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
