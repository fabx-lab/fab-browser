// Native actions only; page content never gets a shell API.
export function attachContextMenu({view,window,Menu,clipboard,tabs}){
 const wc=view.webContents;
 wc.on('context-menu',(_event,params)=>{
  const items=[];
  if(/^https?:\/\//i.test(params.linkURL||''))items.push({label:'在新标签页打开链接',click:()=>tabs.open(params.linkURL,{background:true})},{label:'复制链接',click:()=>clipboard.writeText(params.linkURL)},{type:'separator'});
  if(params.isEditable)items.push({role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{type:'separator'});
  else if(params.selectionText)items.push({role:'copy',label:'复制'},{type:'separator'});
  items.push({label:'后退',enabled:wc.navigationHistory.canGoBack(),click:()=>wc.navigationHistory.goBack()},{label:'前进',enabled:wc.navigationHistory.canGoForward(),click:()=>wc.navigationHistory.goForward()},{label:'重新加载',click:()=>wc.reload()},{type:'separator'},{label:'检查元素',click:()=>wc.inspectElement(params.x,params.y)});
  Menu.buildFromTemplate(items).popup({window});
 });
}
