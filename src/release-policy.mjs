// Content policy for a verified release file, after the FAB gateway: same-release
// scripts and styles, plus inline <script>/<style> blocks allowed only by the
// SHA-256 of their exact text in the verified bytes. Attributes stay blocked.
import {createHash} from 'node:crypto';
const digest=text=>`'sha256-${createHash('sha256').update(text,'utf8').digest('base64')}'`;
const space=c=>c===' '||c==='\t'||c==='\n'||c==='\f'||c==='\r';
const letter=c=>/[A-Za-z]/.test(c||'');
// Elements whose content the HTML tokenizer reads as text up to their own end tag.
// Where SVG and MathML hand parsing back to HTML.
const INTEGRATION={svg:new Set(['foreignobject','desc','title']),math:new Set(['annotation-xml','mi','mo','mn','ms','mtext'])};
const RAW=new Set(['script','style','title','textarea','xmp','iframe','noembed','noframes','noscript']);
// One linear pass over the tokenizer's data states, so no release can make the main
// process scan quadratically. Comments, other markup declarations, end tags and quoted
// attribute values never start a block. Text is hashed after HTML input preprocessing
// (CR LF and lone CR become LF), as Chromium does.
export function inlineHashes(source){
 const html=source.replace(/\r\n?/g,'\n'),lower=html.replace(/[A-Z]/g,c=>c.toLowerCase()),hashes={script:new Set(),style:new Set()};
 let at=0,foreign=null;
 while((at=html.indexOf('<',at))>=0){
  if(html.startsWith('<!--',at)){const end=html.indexOf('-->',at+2);if(end<0)break;at=end+3;continue;}
  if(html[at+1]==='/'&&letter(html[at+2])){const end=html.indexOf('>',at+2);if(end<0)break;const name=lower.slice(at+2,end).trim().split(/[\s/]/)[0];if(foreign?.html){if(name===foreign.html.tag&&--foreign.html.depth===0)foreign.html=null;}else if(foreign&&name===foreign.tag&&--foreign.depth===0)foreign=null;at=end+1;continue;}
  if(html[at+1]==='!'||html[at+1]==='?'){const end=html.indexOf('>',at+2);if(end<0)break;at=end+1;continue;}
  if(!letter(html[at+1])){at++;continue;}
  // Start tag: its name, then attributes with quoted values, up to the closing ">".
  let i=at+1;while(i<html.length&&!space(html[i])&&html[i]!=='/'&&html[i]!=='>')i++;
  const tag=lower.slice(at+1,i),names=[];let name='',quote=null;
  for(;i<html.length;i++){const c=html[i];if(quote){if(c===quote)quote=null;continue;}if(c==='>')break;if(space(c)||c==='/'||c==='='){if(name)names.push(name.toLowerCase());name='';if(c==='='){i++;while(space(html[i]))i++;if(html[i]==='"'||html[i]==="'")quote=html[i];else{while(i<html.length&&!space(html[i])&&html[i]!=='>')i++;i--;}}continue;}name+=c;}
  if(name)names.push(name.toLowerCase());
  if(i>=html.length)break;
  const selfClosing=html[i-1]==='/';
  if((tag==='svg'||tag==='math')&&!foreign?.html){if(!selfClosing){if(foreign&&foreign.tag===tag)foreign.depth++;else if(!foreign)foreign={tag,depth:1};}at=i+1;continue;}
  // In SVG and MathML, script and style hold parsed text: CDATA unwrapped, references decoded.
  if(foreign&&!foreign.html&&!selfClosing&&INTEGRATION[foreign.tag].has(tag)){foreign.html={tag,depth:1};at=i+1;continue;}
  if(foreign?.html&&tag===foreign.html.tag&&!selfClosing)foreign.html.depth++;
  if(foreign&&!foreign.html){if((tag==='script'||tag==='style')&&!selfClosing){const close=lower.indexOf('</'+tag,i+1);if(close<0)break;const text=foreignText(html.slice(i+1,close));if(text&&!(tag==='script'&&names.some(n=>n==='src'||n==='href'||n==='xlink:href')))hashes[tag].add(digest(text));at=close+2;}else at=i+1;continue;}
  if(!RAW.has(tag)){at=i+1;continue;}
  // Raw text runs to the first "</tag" followed by a delimiter; an unclosed block is never allowed.
  // Script text follows the tokenizer's escape states: inside "<!--", a "<script" opens a
  // double-escaped run whose "</script" stays text, and "-->" returns to plain script data.
  const ends=(j,open)=>lower.startsWith((open?'<':'</')+tag,j)&&[' ','\t','\n','\f','/','>'].includes(html[j+(open?1:2)+tag.length]);
  let close=-1;
  if(tag==='script'){let state='data';for(let j=i+1;j<html.length;){
   if(state==='data'){if(html.startsWith('<!--',j)){state='escaped';j+=4;continue;}if(ends(j,false)){close=j;break;}}
   else if(state==='escaped'){if(html.startsWith('-->',j)){state='data';j+=3;continue;}if(ends(j,false)){close=j;break;}if(ends(j,true)){state='double';j+=1+tag.length;continue;}}
   else{if(html.startsWith('-->',j)){state='data';j+=3;continue;}if(ends(j,false)){state='escaped';j+=2+tag.length;continue;}}
   j++;}}
  else{let end=i+1;while((end=lower.indexOf('</'+tag,end))>=0){if(ends(end,false)){close=end;break;}end+=2;}}
  if(close<0)break;
  const text=html.slice(i+1,close);
  if((tag==='script'||tag==='style')&&text&&!(tag==='script'&&names.includes('src')))hashes[tag].add(digest(text));
  at=close+2;
 }
 return {script:[...hashes.script],style:[...hashes.style]};
}
const NAMED={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'};
const decode=text=>text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(all,ref)=>{if(ref[0]==='#'){const code=ref[1]==='x'||ref[1]==='X'?parseInt(ref.slice(2),16):parseInt(ref.slice(1),10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):all;}return NAMED[ref.toLowerCase()]??all;});
// Text content of a foreign script or style: CDATA kept verbatim, comments and child tags dropped.
function foreignText(raw){let out='',at=0;while(at<raw.length){const lt=raw.indexOf('<',at);if(lt<0){out+=decode(raw.slice(at));break;}out+=decode(raw.slice(at,lt));
  const [open,shut,keep]=raw.startsWith('<![CDATA[',lt)?['<![CDATA[',']]>',true]:raw.startsWith('<!--',lt)?['<!--','-->',false]:['<','>',false];
  const end=raw.indexOf(shut,lt+open.length);if(end<0){if(keep)out+=raw.slice(lt+open.length);break;}if(keep)out+=raw.slice(lt+open.length,end);at=end+shut.length;}
 return out;}
// HTML is hashed as UTF-8, so it is served as UTF-8 too.
export const htmlType=type=>!type?'application/octet-stream':/^text\/html\b/i.test(type)&&!/charset=/i.test(type)?`${type};charset=utf-8`:type;
export function releasePolicy(bytes,type=''){
 const {script,style}=/^text\/html\b/i.test(type)?inlineHashes(Buffer.from(bytes).toString('utf8')):{script:[],style:[]};
 return ["default-src 'self'",["script-src 'self'",...script].join(' '),"script-src-attr 'none'",["style-src 'self'",...style].join(' '),"style-src-attr 'none'","img-src 'self' data:","connect-src 'none'","worker-src 'none'","object-src 'none'","base-uri 'self'","frame-ancestors 'none'"].join('; ');
}
