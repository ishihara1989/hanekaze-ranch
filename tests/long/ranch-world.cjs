'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {R,progress:advance}=require('../../tools/lib/ranch-fixtures.cjs');
const publicSires=s=>R.sires(s).filter(b=>b.owner==='public');

test('annual public roster replaces exactly ten; expired sires retain their pedigree records',()=>{
  const s=R.initial();s.stage='running';R.own(s)[0].role='retired';
  let previous=publicSires(s).map(b=>b.id);
  for(let year=1;year<=6;year++){
    advance(s,year===1?40:48);
    const current=publicSires(s).map(b=>b.id);
    assert.equal(current.length,50);assert.equal(current.filter(id=>!previous.includes(id)).length,10);
    for(const id of previous.filter(id=>!current.includes(id))){assert.equal(R.bird(s,id).role,'archived');assert.ok(R.bird(s,id).records.length);}
    previous=current;
  }
  const bytes=Buffer.byteLength(R.serializeState(s),'utf8');
  assert.ok(R.validState(s));assert.ok(bytes<20*1024*1024,`six-year save exceeds backup import limit: ${bytes}`);
});

