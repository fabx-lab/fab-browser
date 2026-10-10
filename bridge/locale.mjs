import {translateRendered} from '/i18n.mjs';
const lang=new URL(location.href).searchParams.get('lang')==='en'?'en':'zh';
document.documentElement.lang=lang;
function translate(node){if(node.nodeType===Node.TEXT_NODE){const s=node.textContent,t=translateRendered(lang,s.trim());if(t!==s.trim())node.textContent=s.replace(s.trim(),t);return;}if(node.nodeType!==Node.ELEMENT_NODE||['SCRIPT','STYLE'].includes(node.tagName))return;for(const c of node.childNodes)translate(c);}
translate(document.documentElement);new MutationObserver(records=>{for(const r of records)if(r.type==='characterData')translate(r.target);else for(const n of r.addedNodes)translate(n);}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
