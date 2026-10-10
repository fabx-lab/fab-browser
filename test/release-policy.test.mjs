import test from 'node:test';
import assert from 'node:assert/strict';
import {inlineHashes,releasePolicy} from '../src/release-policy.mjs';
test('inline blocks are allowed only by the hash of their exact text, as the FAB gateway does',()=>{
 const html='<html><head><script type="module" crossorigin>a</script><script src="app.js"></script><STYLE rel="stylesheet">a</STYLE></head><body onload="x()"></body></html>';
 // SHA-256("a"), base64: the standard test vector.
 const a="'sha256-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='";
 assert.deepEqual(inlineHashes(html),{script:[a],style:[a]},'Scripts with src are same-release files, not inline');
 const policy=releasePolicy(Buffer.from(html),'text/html;charset=utf-8');
 assert.ok(policy.includes(`script-src 'self' ${a};`)&&policy.includes(`style-src 'self' ${a};`));
 for(const rule of ["script-src-attr 'none'","style-src-attr 'none'","connect-src 'none'","worker-src 'none'","frame-ancestors 'none'"])assert.ok(policy.includes(rule),rule);
 assert.equal(releasePolicy(Buffer.from(html),'text/javascript').includes('sha256'),false,'Only HTML documents carry inline hashes');
 assert.ok(releasePolicy(Buffer.from('<p>none</p>'),'text/html').includes("script-src 'self';"));
});
test('hashes follow what Chromium parses: CRLF, quoted > in attributes, closing-tag case',()=>{
 const a="'sha256-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='";// SHA-256("a")
 const lf="'sha256-AbpHGcgLb+kRsJGnwFEktk7uzpZOCcBY74+YBdrKVGs='";// SHA-256("\n")
 assert.deepEqual(inlineHashes('<script data-label="a>b">a</SCRIPT >').script,[a]);
 assert.deepEqual(inlineHashes('<script>\r\n</script><style>\r</style>'),{script:[lf],style:[lf]});
 assert.deepEqual(inlineHashes('<script data-x="src=1">a</script>').script,[a],'A value mentioning src is not a src attribute');
 assert.deepEqual(inlineHashes('<script src=app.js>a</script><scripts>a</scripts>').script,[]);
 assert.deepEqual(inlineHashes('<script>a').script,[],'An unclosed block is never allowed');
});
test('hash extraction stays linear on hostile markup',()=>{
 const started=Date.now();inlineHashes('<script>'.repeat(200000));inlineHashes('<script '.repeat(200000));inlineHashes('<script>'+'</'.repeat(200000));
 assert.ok(Date.now()-started<1500,'Hostile markup must not stall the main process');
});
test('comments, attribute values and text-only elements never start a block',()=>{
 const a="'sha256-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='";// SHA-256("a")
 for(const prefix of ['<!-- <script> -->','<div title="<script>">','<title><script></title>','<textarea><style></textarea>','<!DOCTYPE html>','</p >'])
  assert.deepEqual(inlineHashes(`${prefix}<script>a</script>`).script,[a],prefix);
});
test('script text follows the escaped and double-escaped tokenizer states',()=>{
 const body='<!-- var s="<script></script>"; -->',hash=text=>inlineHashes(`<script>${text}</script>`).script[0];
 const whole=inlineHashes(`<script>${body}</script><p>`).script;
 assert.equal(whole.length,1);assert.equal(whole[0],hash(body),'The inner </script> stays script text');
 assert.deepEqual(inlineHashes('<script><!-- a </script>b').script,[hash('<!-- a ')],'An escaped run still ends at </script>');
 const started=Date.now();inlineHashes('<script><!--'+'<script '.repeat(100000));assert.ok(Date.now()-started<1500);
});
test('SVG blocks hash their parsed text, and HTML is served as UTF-8',async()=>{
 const {htmlType}=await import('../src/release-policy.mjs');
 const a="'sha256-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='";// SHA-256("a")
 assert.deepEqual(inlineHashes('<svg><script><![CDATA[a]]></script><style>&#97;</style></svg>'),{script:[a],style:[a]});
 assert.deepEqual(inlineHashes('<svg><title><script>a</script></title></svg><script>a</script>').script,[a]);
 assert.equal(htmlType('text/html'),'text/html;charset=utf-8');assert.equal(htmlType('text/html; charset=utf-8'),'text/html; charset=utf-8');assert.equal(htmlType('text/css'),'text/css');assert.equal(htmlType(''),'application/octet-stream');
});
test('foreign block text stays linear on hostile markup',()=>{
 const started=Date.now();inlineHashes('<svg><script>'+'<!--'.repeat(100000)+'</script>');inlineHashes('<svg><style>'+'<'.repeat(300000)+'</style>');
 assert.ok(Date.now()-started<1500);
});
test('SVG integration points hand script parsing back to HTML',()=>{
 const html=inlineHashes('<script>window.ok = 1 < 2;</script>').script[0];
 assert.deepEqual(inlineHashes('<svg><foreignObject><script>window.ok = 1 < 2;</script></foreignObject></svg>').script,[html]);
 assert.deepEqual(inlineHashes('<svg><foreignObject></foreignObject><script><![CDATA[a]]></script></svg>').script,["'sha256-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='"]);
});
