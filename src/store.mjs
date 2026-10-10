// The start page's storefront: every application the Registry has published, with the
// gateway the FAB template gives it and what its verified release says about itself.
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
/** The FAB gateway for a container from a template like https://r2-{container}-deweb-test.fabx.tech */
export function templateGateway(template,container){
 if(typeof template!=='string'||template.split('{container}').length!==2||!ADDRESS.test(String(container)))return null;
 try{const url=new URL(template.replace('{container}',container.slice(2).toLowerCase()));return url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash?null:url.origin;}catch{return null;}
}
/** Gives each published application without a configured gateway the template's one; returns how many were added. */
export function addTemplateApps(apps,rows,template){
 let added=0;
 for(const row of rows){
  if(!ADDRESS.test(String(row.container))||apps.some(a=>a.container.toLowerCase()===row.container.toLowerCase()))continue;
  const gateway=templateGateway(template,row.container);if(!gateway)continue;
  apps.push({title:row.metadata?.name||row.title,circuits:row.circuits,tokenId:String(row.tokenId),container:row.container,gateway});added++;
 }
 return added;
}
/** What the start page shows, configured applications first, newest publications after. */
export function storeRows(rows,apps,icons={},configured=0,failed=new Set()){
 const rank=r=>Math.min(r.order,configured),known=new Map(apps.map((a,i)=>[a.container.toLowerCase(),i]));
 return rows.filter(r=>known.has(r.container.toLowerCase())).map(row=>{
  const m=row.metadata||{};
  return {container:row.container,circuits:row.circuits,tokenId:String(row.tokenId),version:String(row.version),name:m.name||row.title,summary:m.summary||'',localized:m.localized||{},icon:m.icon||null,iconKey:icons[row.container.toLowerCase()]||null,category:m.category||null,block:Number(row.blockNumber||0),described:m.version===String(row.version)||failed.has(row.container.toLowerCase()),order:known.get(row.container.toLowerCase())};
 }).sort((a,b)=>rank(a)-rank(b)||b.block-a.block);
}
