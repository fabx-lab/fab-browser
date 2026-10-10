// A pinned site's logo: the page's own icon links, best first, as a small data: URL.
export const ICON_TYPES=['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon','image/vnd.microsoft.icon'];
const MAX_BYTES=192*1024;
const RANK=[/apple-touch-icon/,/^icon$|\sicon$|^icon\s/,/shortcut/];

/** Icon URLs declared by a page, larger and sharper kinds first, then /favicon.ico. */
export function iconLinks(html,base){
 const found=[];
 for(const tag of String(html).match(/<link\b[^>]*>/gi)||[]){
  const rel=/\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase().trim(),href=/\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1];
  if(!rel||!href||!/icon/.test(rel)||/mask-icon/.test(rel))continue;
  let url;try{url=new URL(href.replace(/&amp;/g,'&'),base);}catch{continue;}
  if(url.protocol!=='https:'||url.username||url.password)continue;
  const svg=/svg/i.test(tag)||/\.svg(\?|$)/i.test(url.pathname);
  const rank=RANK.findIndex(re=>re.test(rel));
  found.push({href:url.href,score:(rank<0?RANK.length:rank)*2+(svg?0:1)});
 }
 found.sort((a,b)=>a.score-b.score);
 const links=[...new Set(found.map(f=>f.href))];
 try{links.push(new URL('/favicon.ico',base).href);}catch{}
 return [...new Set(links)];
}

/** Fetches the first usable icon for a page; credentials are never sent. */
export async function fetchIcon(page,{fetch,timeout=8000}){
 const get=url=>fetch(url,{credentials:'omit',redirect:'follow',signal:AbortSignal.timeout(timeout)});
 let html='',base=page;
 try{const response=await get(page);if(response.ok&&/text\/html/i.test(response.headers.get('content-type')||'')){html=(await response.text()).slice(0,512*1024);base=response.url||page;}}catch{}
 for(const href of iconLinks(html,base)){
  try{
   const response=await get(href);if(!response.ok)continue;
   const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(!ICON_TYPES.includes(type))continue;
   const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.length||bytes.length>MAX_BYTES)continue;
   return `data:${type};base64,${bytes.toString('base64')}`;
  }catch{}
 }
 return '';
}
