import english from './i18n/en.mjs';
export const pickLanguage=(setting,locale)=>['zh','en'].includes(setting)?setting:/^zh/i.test(locale||'')?'zh':'en';
export function createTranslator(language){return (text,vars)=>{let value=language==='en'?english[text]??text:text;if(vars)value=value.replace(/\{(\w+)\}/g,(all,key)=>Object.hasOwn(vars,key)?String(vars[key]):all);return value;};}

const templates=Object.entries(english).filter(([key])=>/\{\w+\}/.test(key)).map(([key,value])=>{const names=[];const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\\\{(\w+)\\\}/g,(_all,name)=>{names.push(name);return '(.+?)';});return {regex:new RegExp('^'+escaped+'$'),value,names};});
export function translateRendered(language,text){if(language!=='en')return text;if(Object.hasOwn(english,text))return english[text];for(const {regex,value,names}of templates){const match=regex.exec(text);if(match)return value.replace(/\{(\w+)\}/g,(all,key)=>match[names.indexOf(key)+1]??all);}return text;}
