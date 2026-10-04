'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../public/js/ranch-characters.js');

test('every expression has source dimensions and landmarks inside the actual PNG',()=>{
  for(const art of Object.values(C.SHIROMA)){
    const png=fs.readFileSync(path.join(__dirname,'../public',art.src));
    assert.equal(png.readUInt32BE(16),art.width);
    assert.equal(png.readUInt32BE(20),art.height);
    for(const r of [art.face,art.head]){
      assert.ok(r.x>=0&&r.y>=0&&r.width>0&&r.height>0);
      assert.ok(r.x+r.width<=art.width&&r.y+r.height<=art.height);
    }
  }
});

test('short retirement reports and tall letters keep the full head inside their frame',()=>{
  for(const art of Object.values(C.SHIROMA))for(const [w,h] of [[140,180],[210,180],[265,445],[330,750]]){
    const r=C.framing(art,'head'),scale=Math.min(w/r.width,h/r.height);
    const x=w/2-(r.x+r.width/2)*scale,y=-r.y*scale,b=art.head;
    assert.ok(x+b.x*scale>=0&&y+b.y*scale>=0);
    assert.ok(x+(b.x+b.width)*scale<=w&&y+(b.y+b.height)*scale<=h);
  }
});

test('face landmarks fit within the circular avatars, including the small report avatar',()=>{
  for(const art of Object.values(C.SHIROMA))for(const size of [35,36,45]){
    const r=C.framing(art,'face'),s=size/r.width,b=art.face;
    for(const x of [b.x,b.x+b.width])for(const y of [b.y,b.y+b.height]){
      const dx=(x-r.x)*s-size/2,dy=(y-r.y)*s-size/2;
      assert.ok(Math.hypot(dx,dy)<size/2);
    }
  }
});

test('unknown expressions use an existing portrait and mouth variants keep the same framing',()=>{
  assert.match(C.markup('missing','head'),/shiroma-talk.png/);
  assert.doesNotMatch(C.markup('missing'),/missing/);
  assert.deepEqual(C.framing(C.SHIROMA.neutral,'head'),C.framing(C.SHIROMA.talk,'head'));
});
