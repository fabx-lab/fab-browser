// The wallet, one click from the top corner: create, import, unlock, see the balance.
// Secrets go straight to the main process; this panel keeps none of them.
const api=window.fabBrowser,$=id=>document.getElementById(id),panel=$('wallet-panel'),chip=$('wallet-button');
let state=await api.walletStatus(),view='home',words=null,balance=null,hidSite=false,session=0;

function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`#i-${name}`);svg.append(use);return svg;}
const short=address=>address?`${address.slice(0,6)}…${address.slice(-4)}`:'';
const reason=error=>String(error?.message||error).replace(/^Error invoking remote method '[^']+': (Error: )?/,'');
const okb=wei=>{const value=BigInt(wei),whole=value/10n**18n,part=(value%10n**18n).toString().padStart(18,'0').slice(0,4);return `${whole}.${part}`;};
function button(text,className,run){const b=element('button',text,className);b.type='button';b.onclick=()=>guarded(b,run);return b;}
// Each open, view change or lock starts a new session; late answers from an older one are dropped.
const stale=mine=>mine!==session||panel.hidden;
async function guarded(control,run){panel.querySelector('.wallet-error')?.remove();const controls=[...panel.querySelectorAll('button')];for(const c of controls)c.disabled=true;try{await run();}catch(error){const note=element('p',reason(error),'wallet-error');note.setAttribute('role','alert');panel.querySelector('.wallet-error')?.remove();panel.append(note);}finally{for(const c of controls)c.disabled=false;}}
function field(type,placeholder,label){const input=element(type==='area'?'textarea':'input');if(type!=='area')input.type=type;input.placeholder=placeholder;input.setAttribute('aria-label',label||placeholder);input.autocomplete='off';input.spellcheck=false;return input;}
// A form submits on Enter; its fields are cleared whatever the outcome.
function form(fields,submit,run){const f=element('form',undefined,'wallet-form');f.append(...fields,submit);f.onsubmit=event=>{event.preventDefault();void guarded(submit,async()=>{try{await run(...fields.map(i=>i.value));}finally{for(const i of fields)i.value='';}});};return f;}
function primary(text){const b=element('button',text,'button primary wallet-wide');b.type='submit';return b;}
function head(title,line,tone=''){const h=element('div',undefined,'wallet-head'),badge=element('span',undefined,'wallet-avatar '+tone),text=element('div');badge.append(icon('wallet'));text.append(element('strong',title));if(line)text.append(element('small',line));h.append(badge,text);return h;}
const links=(...items)=>{const row=element('div',undefined,'wallet-links');row.append(...items);return row;};
const grants=()=>button(`网站授权 · ${state.origins.length}`,'text-button',()=>{close();document.dispatchEvent(new CustomEvent('fab:wallet-details'));});
const back=()=>button('返回','text-button',()=>{view='home';render();});

function renderChip(){
 const local=state.local,account=state.ready?state.accounts[0]:'';
 chip.dataset.ready=String(!!state.ready);chip.dataset.waiting=String(!!state.connected&&!state.ready);
 $('wallet-label').textContent=account?short(account):local.exists?'已锁定':'钱包';
 const label=account?`钱包 · ${account}`:local.exists?'钱包已锁定':'钱包';chip.title=label;chip.setAttribute('aria-label',label);
}
const views={
 home(){
  const local=state.local;
  if(state.ready&&state.builtIn)return unlocked();
  if(state.ready)return external();
  if(state.connected)return [head('等待浏览器扩展','在系统浏览器里确认'),button('取消','button wallet-wide',async()=>{await api.walletDisconnect();await refresh();})];
  if(local.exists){const pass=field('password','密码');return [head('钱包已锁定',local.broken?'钱包文件无法读取':short(local.address)),form([pass],primary('解锁'),async password=>{await api.walletUnlock(password);await refresh();}),links(button('删除钱包','text-button',async()=>{if(await api.walletForget())await refresh();}),button('用浏览器扩展连接','text-button',()=>api.walletOpen()),...(state.origins.length?[grants()]:[]))];}
  return [head('钱包','加密保存在本机'),button('创建钱包','button primary wallet-wide',()=>{view='create';render();}),button('导入钱包','button wallet-wide',()=>{view='import';render();}),links(button('用浏览器扩展连接','text-button',()=>api.walletOpen()),...(state.origins.length?[grants()]:[]))];
 },
 create(){const a=field('password','密码，至少 8 位'),b=field('password','再输一次');return [head('创建钱包','设置解锁密码'),form([a,b],primary('创建'),async(password,again)=>{if(password!==again)throw new Error('两次密码不一样');const mine=session,made=await api.walletCreate(password);if(stale(mine))return;words=made.mnemonic.split(' ');view='words';await refresh();}),back()];},
 import(){const secret=field('area','助记词或私钥'),pass=field('password','设置密码，至少 8 位');secret.rows=3;return [head('导入钱包'),form([secret,pass],primary('导入'),async(value,password)=>{await api.walletImport(value,password);view='home';await refresh();}),back()];},
 words(){const grid=element('ol',undefined,'wallet-words');for(const w of words||[])grid.append(element('li',w));return [head('抄下助记词','找回钱包的唯一方式'),grid,button('我已抄好','button primary wallet-wide',()=>{words=null;view='home';render();})];},
 reveal(){const pass=field('password','密码');return [head('备份','输入密码查看'),form([pass],primary('查看'),async password=>{const mine=session,{type,secret}=await api.walletReveal(password);if(stale(mine)||!state.ready)return;words=type==='mnemonic'?secret.split(' '):[secret];view=type==='mnemonic'?'words':'key';render();}),back()];},
 key(){const box=element('p',words?.[0]||'','wallet-key mono');return [head('私钥','不要发给任何人'),box,button('完成','button primary wallet-wide',()=>{words=null;view='home';render();})];},
};
function unlocked(){
 const account=state.accounts[0],amount=element('div',undefined,'wallet-balance'),address=element('div',undefined,'wallet-address');
 amount.append(element('strong',balance?okb(balance):'—'),element('span','OKB'));
 address.append(element('span',short(account),'mono'),button('复制','pill',async()=>{await navigator.clipboard.writeText(account);address.querySelector('.pill').textContent='已复制';}));
 const actions=element('div',undefined,'wallet-actions');
 actions.append(button('锁定','button',async()=>{await api.walletLock();await refresh();}),button('备份','button',()=>{view='reveal';render();}));
 return [head('FAB 钱包','X Layer 196','on'),amount,address,actions,links(grants())];
}
function external(){
 const account=state.accounts[0],on=state.chainId==='0xc4',address=element('div',undefined,'wallet-address');
 address.append(element('span',short(account),'mono'));
 const actions=element('div',undefined,'wallet-actions');
 if(!on)actions.append(button('切换到 X Layer','button primary',()=>api.walletSwitch()));
 actions.append(button('断开','button',async()=>{await api.walletDisconnect();await refresh();}));
 return [head(state.wallet||'浏览器扩展',on?'X Layer 196':'不是 X Layer',on?'on':'warn'),address,actions,links(grants())];
}
function render(){session++;panel.replaceChildren(...views[view]());panel.querySelector('input,textarea,button')?.focus();}

// The balance updates its own number in place; it never re-renders a form.
function loadBalance(){if(!(state.ready&&state.builtIn))return;void api.walletBalance().then(b=>{balance=b?.wei??null;const shown=panel.querySelector('.wallet-balance strong');if(shown)shown.textContent=balance?okb(balance):'—';},()=>{});}
async function refresh(){state=await api.walletStatus();renderChip();if(!panel.hidden)render();loadBalance();}
// The panel fits inside the side column; elsewhere it would sit over the page, so the page steps aside.
async function cover(){
 const over=!panel.hidden&&document.body.dataset.layout!=='side';
 if(over!==hidSite){hidSite=over;await api.walletCover(over);}
}
async function open(){view='home';panel.hidden=false;chip.setAttribute('aria-expanded','true');render();await cover();void refresh();}
// Switching layouts or widths moves the panel; the page steps aside again if it would now cover it.
new MutationObserver(()=>void cover()).observe(document.body,{attributes:true,attributeFilter:['data-layout']});
function close(){
 if(panel.hidden||view==='words')return;session++;panel.hidden=true;chip.setAttribute('aria-expanded','false');words=null;panel.replaceChildren();void cover();
}
chip.onclick=()=>panel.hidden?void open():close();
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();close();chip.focus();}},true);
document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!panel.contains(event.target)&&!chip.contains(event.target))close();});
api.onWalletState(value=>{if(value){if(!value.local?.unlocked&&['words','key','reveal'].includes(view)){words=null;view='home';session++;}state=value;}renderChip();if(!panel.hidden&&view==='home')render();});
api.onShowWallet(()=>{if(panel.hidden)void open();});
renderChip();
