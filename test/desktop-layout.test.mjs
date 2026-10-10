import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopLayout} from '../src/desktop-layout.mjs';
test('application never overlaps browser navigation, status or desktop sidebar',()=>{
 for(const width of [390,800,1280])for(const sidebar of [false,true]){
  const {application:a,hideApplication}=desktopLayout(width,900,sidebar);
  assert.equal(a.y,96);assert.equal(a.y+a.height,872);assert.equal(a.x+a.width,width);
  assert.equal(hideApplication,sidebar&&width<700);
  if(sidebar&&width>=700)assert.equal(a.x,288);
  if(!sidebar)assert.equal(a.x,0);
 }
});
