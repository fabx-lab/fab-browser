// Window geometry belongs to the trusted shell; website content never chooses it.
// Two ways to hold the window, as in Search: tabs down the left (the page then
// runs the full height beside them) or folded away into one bar across the top.
// Below the narrow breakpoint the column opens over the page instead of beside it.
export const SIDE_WIDTH=240,BAR_HEIGHT=44,FIND_HEIGHT=44,NARROW=700;
export function desktopLayout(width,height,{sidebar=false,find=false}={}){
  const narrow=width<NARROW,beside=sidebar&&!narrow;
  const x=beside?SIDE_WIDTH:0,y=(beside?0:BAR_HEIGHT)+(find?FIND_HEIGHT:0);
  return {application:{x,y,width:Math.max(1,width-x),height:Math.max(1,height-y)},hideApplication:sidebar&&narrow,narrow};
}
