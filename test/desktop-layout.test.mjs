import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopLayout,SIDE_WIDTH,BAR_HEIGHT,FIND_HEIGHT} from '../src/desktop-layout.mjs';
test('application never overlaps the tab column, the folded bar or the find bar',()=>{
 for(const width of [390,800,1280])for(const sidebar of [false,true])for(const find of [false,true]){
  const {application:a,hideApplication}=desktopLayout(width,900,{sidebar,find});
  const beside=sidebar&&width>=700,top=(beside?0:BAR_HEIGHT)+(find?FIND_HEIGHT:0);
  assert.equal(a.y,top);assert.equal(a.y+a.height,900);assert.equal(a.x+a.width,width);
  assert.equal(a.x,beside?SIDE_WIDTH:0);
  assert.equal(hideApplication,sidebar&&width<700);
 }
});
