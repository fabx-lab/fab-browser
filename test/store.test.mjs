import test from 'node:test';
import assert from 'node:assert/strict';
import {templateGateway,addTemplateApps,storeRows} from '../src/store.mjs';
import {extractMeta} from '../src/site-metadata.mjs';

const A='0x'+'a'.repeat(40),B='0x'+'b'.repeat(40),C='0x'+'c'.repeat(40);
test('the gateway template yields one HTTPS origin per container, or nothing',()=>{
 assert.equal(templateGateway('https://r2-{container}-deweb-test.fabx.tech',A.toUpperCase().replace('0X','0x')),`https://r2-${'a'.repeat(40)}-deweb-test.fabx.tech`);
 for(const bad of ['http://r2-{container}.example','https://{container}.example/path','https://x.example',null])assert.equal(templateGateway(bad,A),null,String(bad));
 assert.equal(templateGateway('https://r2-{container}.example','0x12'),null);
});
test('published apps without a gateway get the template one, configured apps keep theirs',()=>{
 const apps=[{title:'Gomoku',circuits:C,tokenId:'3',container:A,gateway:'https://gomoku.example'}];
 const rows=[{container:A,circuits:C,tokenId:'3',title:'#3'},{container:B,circuits:C,tokenId:'7',title:'#7',metadata:{name:'Sudoku'}}];
 assert.equal(addTemplateApps(apps,rows,'https://r2-{container}.example'),1);
 assert.equal(apps[0].gateway,'https://gomoku.example');
 assert.deepEqual(apps[1],{title:'Sudoku',circuits:C,tokenId:'7',container:B,gateway:`https://r2-${'b'.repeat(40)}.example`});
 assert.equal(addTemplateApps(apps,rows,'https://r2-{container}.example'),0,'Adding twice changes nothing');
});
test('the storefront lists configured apps first, then the newest publications',()=>{
 const apps=[{container:A},{container:B},{container:C}];
 const rows=[{container:C,tokenId:'9',version:'1',blockNumber:'30',title:'#9'},{container:B,tokenId:'5',version:'1',blockNumber:'20',title:'#5',metadata:{name:'Poker',summary:'Cards',localized:{en:{name:'Hold\'em'}}}},{container:A,tokenId:'3',version:'2',blockNumber:'10',title:'#3'},{container:'0x'+'d'.repeat(40),tokenId:'1',version:'1',title:'no gateway'}];
 const shown=storeRows(rows,apps,{[A]:'gomoku'},2);
 assert.deepEqual(shown.map(r=>r.container),[A,B,C],'Unreachable apps are left out');
 assert.equal(shown[0].iconKey,'gomoku');assert.equal(shown[1].name,'Poker');assert.equal(shown[1].localized.en.name,'Hold\'em');assert.equal(shown[2].name,'#9');
});
test('release metadata follows the FAB gateway convention',()=>{
 const html=new TextEncoder().encode('<html><head><meta charset="utf-8"><meta content="一方棋盘，一场好局。" name="description"><meta name="fab:name:en" content="Gomoku &amp; friends"><meta name=\'fab:description:zh\' content="  对弈  "><title>弈</title></head>');
 assert.deepEqual(extractMeta(html),{description:'一方棋盘，一场好局。',localized:{en:{name:'Gomoku & friends'},zh:{description:'对弈'}}});
 assert.equal(Array.from(extractMeta(new TextEncoder().encode(`<meta name="description" content="${'字'.repeat(80)}">`)).description).length,49);
});
