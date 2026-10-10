// OS protocol entry never bypasses the configured FAB registry/gateway resolver.
export function installDeepLinks({app,getWindow,getTabs,smoke}){
 let pending=[];const accept=value=>{if(typeof value!=='string'||!value.startsWith('fab://'))return;const tabs=getTabs();if(!tabs){pending.push(value);return;}const window=getWindow();if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.focus();}tabs.open(value);};
 if(!smoke){if(!app.requestSingleInstanceLock()){app.quit();return {owned:false,ready(){}};}app.on('second-instance',(_event,argv)=>argv.forEach(accept));app.on('open-url',(event,value)=>{event.preventDefault();accept(value);});process.argv.forEach(accept);}
 return {owned:true,ready(){if(!smoke&&app.isPackaged)app.setAsDefaultProtocolClient('fab');for(const value of pending)accept(value);pending=[];}};
}
