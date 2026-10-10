// Reproducible FAB bitmap mark, generated with Node built-ins only.
import {deflateSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
const size=512, data=Buffer.alloc(size*(1+size*4));
const glyphs=['11111/10000/10000/11110/10000/10000/10000','01110/10001/10001/11111/10001/10001/10001','11110/10001/10001/11110/10001/10001/11110'].map(s=>s.split('/'));
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const i=y*(1+size*4)+1+x*4;let on=false;
 for(let g=0;g<3;g++){const col=Math.floor((x-62-g*135)/22),row=Math.floor((y-179)/22);if(col>=0&&col<5&&row>=0&&row<7&&glyphs[g][row][col]==='1')on=true;}
 data.set(on?[221,186,91,255]:[29,69,55,255],i);
}
function crc(b){let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,b){const t=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(b.length);c.writeUInt32BE(crc(Buffer.concat([t,b])));return Buffer.concat([n,t,b,c]);}
const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
writeFileSync('build/icon.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))]));
