// The first time: five short pages over the window, after Search's welcome —
// what this is, language and look, how to hold it, the wallet, and the keys
// worth knowing. Every page can be skipped and nothing is asked twice.
const api=window.fabBrowser,$=id=>document.getElementById(id);
const settings=await api.settings();
const mac=document.body.dataset.platform==='darwin'||/Mac/.test(navigator.platform);
const PAGE_KEY='fab-welcome-page',pages=5;
let page=0,state={lang:settings.lang,appearance:settings.appearance};

function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`#i-${name}`);svg.append(use);return svg;}
function heading(parent,title,line){const head=element('div');head.append(element('h2',title),element('p',line));parent.append(head);}
function segmented(options,value,label,pick){const group=element('div',undefined,'segmented');group.setAttribute('role','group');group.setAttribute('aria-label',label);for(const [key,text]of options){const b=element('button',text);b.type='button';b.setAttribute('aria-pressed',String(key===value));b.onclick=async()=>{await pick(key);for(const other of group.children)other.setAttribute('aria-pressed',String(other===b));};group.append(b);}return group;}
const key=(combo)=>mac?combo.replace('Shift+','⇧').replace('Mod+','⌘'):combo.replace('Mod+','Ctrl+');

function welcome(root){
 root.classList.add('center');
 const mark=document.createElementNS('http://www.w3.org/2000/svg','svg');mark.setAttribute('class','mark');mark.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-mark');mark.append(use);
 const text=element('div');text.append(element('h1','FAB DeWEB'),element('p','打开链上应用的浏览器。网站文件存放在 IPFS，版本登记在 X Layer；每次打开前，客户端先在两个 RPC 上核对链上绑定。'));
 root.append(mark,text);
}
function look(root){
 heading(root,'语言与外观。','窗口和网页都跟随这里的选择，之后可以在设置里修改。');
 const lang=element('div',undefined,'welcome-row');lang.append(element('span','语言'),segmented([['auto','跟随系统'],['zh','简体中文'],['en','English']],state.lang,'语言',async value=>{if(value===state.lang)return;await api.saveLanguage(value);try{sessionStorage.setItem(PAGE_KEY,String(page));}catch{}location.reload();}));
 const theme=element('div',undefined,'welcome-row');theme.append(element('span','外观'),segmented([['system','跟随系统'],['light','浅色'],['dark','深色']],state.appearance,'外观',async value=>{await api.saveAppearance(value);state.appearance=value;}));
 root.append(lang,theme);
}
function hold(root){
 heading(root,'两种布局。',`标签放在侧边，页面占满其余的高度；或者放在顶部，像一条标签栏。之后按 ${key('Shift+Mod+S')} 随时切换。`);
 const ways=element('div',undefined,'ways'),chosen=()=>document.body.dataset.preferred||'side';
 for(const [value,title] of [['side','侧边栏'],['strip','顶部标签']]){
  const way=element('button',undefined,'way');way.type='button';way.setAttribute('aria-pressed',String(chosen()===value));
  const drawing=element('div',undefined,`way-drawing way-${value}`),chrome=element('div',undefined,'way-chrome'),lights=element('b');for(let i=0;i<3;i++)lights.append(element('em'));chrome.append(lights);for(let i=0;i<4;i++)chrome.append(element('i'));drawing.append(chrome);
  way.append(drawing,element('span',title));
  way.onclick=()=>{document.dispatchEvent(new CustomEvent('fab:layout',{detail:value}));for(const other of ways.children)other.setAttribute('aria-pressed',String(other===way));};
  ways.append(way);
 }
 root.append(ways);
}
function wallet(root){
 heading(root,'钱包。','创建或导入一个钱包，私钥用密码加密保存在本机。');
 for(const [name,title,line] of [['chain','每次签名都要你确认','网站读取地址、签名、发交易，都先在 FAB 里确认。'],['wallet','只在本机','私钥不会交给任何网站。']]){
  const row=element('div',undefined,'choice'),text=element('div');text.append(element('strong',title),element('small',line));row.append(icon(name),text);root.append(row);
 }
 const actions=element('div',undefined,'welcome-row'),create=element('button','创建钱包','button');create.type='button';
 create.onclick=async()=>{await finish();$('wallet-button').click();};actions.append(create);root.append(actions);
}
function keys(root){
 heading(root,'开始之前。','几个值得记住的按键，菜单里也都有。');
 const list=element('div',undefined,'keys');list.append(element('small','快捷键'));
 for(const [combo,what] of [['Mod+T','新标签页。输入应用名称、容器地址或网址。'],['Mod+L','回到地址栏。'],['Mod+D','把当前应用加入书签，侧栏顶部一键打开。'],['Shift+Mod+S','标签放在侧边或顶部。'],['Mod+F','在页面中查找。'],['Mod+O','预览本地网站文件夹，修改后自动刷新。'],['Mod+,','设置：语言、外观、RPC 与缓存。']]){
  const row=element('div',undefined,'key');row.append(element('kbd',key(combo)),element('span',what));list.append(row);
 }
 const actions=element('div',undefined,'welcome-row');
 for(const [text,target] of [['先试试五子棋','start-demo'],['或者德州扑克','start-poker']]){const b=element('button',text,'button');b.type='button';b.onclick=async()=>{await finish();$(target).click();};actions.append(b);}
 root.append(list,actions);
}
const builders=[welcome,look,hold,wallet,keys];

function render(forward=true){
 const host=$('welcome-page'),root=element('div',undefined,'welcome-inner'+(forward?'':' backward'));
 builders[page](root);host.replaceChildren(root);
 const dots=$('welcome-dots');dots.replaceChildren();for(let i=0;i<pages;i++)dots.append(element('i',undefined,i===page?'on':''));
 $('welcome-back').hidden=page===0;$('welcome-skip').hidden=page===pages-1;
 $('welcome-next').textContent=page<pages-1?'继续':'开始浏览';
}
async function openWelcome(at=0){const latest=await api.settings();state={lang:latest.lang,appearance:latest.appearance};page=Math.max(0,Math.min(pages-1,at));await api.welcome(false);$('welcome').hidden=false;render();$('welcome-next').focus();}
async function finish(){try{sessionStorage.removeItem(PAGE_KEY);}catch{}$('welcome').hidden=true;await api.welcome(true);$('input').focus();}
$('welcome-next').onclick=()=>{if(page<pages-1){page++;render(true);}else void finish();};
$('welcome-back').onclick=()=>{if(page>0){page--;render(false);}};
$('welcome-skip').onclick=()=>void finish();
document.addEventListener('keydown',event=>{if($('welcome').hidden)return;if(event.key==='Escape'){event.preventDefault();void finish();}});
document.addEventListener('fab:welcome',()=>void openWelcome(0));
api.onShowWelcome(()=>void openWelcome(0));

let resume=null;try{resume=sessionStorage.getItem(PAGE_KEY);}catch{}
if(resume!==null)await openWelcome(Number(resume)||0);
else if(!settings.welcomed)await openWelcome(0);
document.body.dataset.welcomeReady='true';
