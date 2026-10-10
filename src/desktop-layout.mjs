// Window geometry belongs to the trusted shell; website content never chooses it.
export function desktopLayout(width,height,sidebarOpen=false){
  const top=96,bottom=28,narrow=width<700;
  const left=sidebarOpen&&!narrow?288:0;
  return {application:{x:left,y:top,width:Math.max(1,width-left),height:Math.max(1,height-top-bottom)},hideApplication:sidebarOpen&&narrow};
}
