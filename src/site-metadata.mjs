// Adapted from trytotapeout/TapeBrowser@5f1d82c, GPL-3.0-or-later. See UPSTREAM.md.
export const IMAGE_FILES={logo:['logo.png','logo.jpg'],cover:['cover.png','cover.jpg']};
export const IMAGE_MAX_BYTES=50*1024;
export const MANIFEST_PATH='deweb.json';
export function extractTitle(bytes) {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 64 * 1024));
  const m = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head);
  if (!m) return '';
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return m[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return named[e.toLowerCase()] ?? all;
    })
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

// The FAB gateway's metadata convention (pod-contract tools/deweb/html-policy.mjs):
// <meta name="description">, and <meta name="fab:name:zh|en"> / <meta name="fab:description:zh|en">.
export const ICON_FILE='deweb-icon.png',ICON_MAX_BYTES=512*1024;
const decode=text=>String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(all,e)=>{if(e[0]==='#'){const n=e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return Number.isFinite(n)&&n>0&&n<0x110000?String.fromCodePoint(n):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[e.toLowerCase()]??all;});
const clean=text=>decode(text).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
const short=text=>Array.from(clean(text)).slice(0,49).join('');
export function extractMeta(bytes){
 const head=new TextDecoder('utf-8',{fatal:false}).decode(bytes.subarray(0,64*1024)),result={description:'',localized:{}};
 for(const [tag] of head.matchAll(/<meta\b[^>]*>/gi)){
  const attrs={};for(const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g))attrs[m[1].toLowerCase()]=m[3]??m[4]??m[5]??'';
  const name=(attrs.name||'').toLowerCase(),content=attrs.content||'';
  if(name==='description'&&!result.description)result.description=short(content);
  const field=/^fab:(name|description):(en|zh)$/.exec(name);
  if(field){result.localized[field[2]]??={};result.localized[field[2]][field[1]]=field[1]==='name'?clean(content).slice(0,120):short(content);}
 }
 return result;
}
