'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../public/js/ranch-engine.js');
const Replay=require('../public/js/race-replay.js');

test('all generated source, market, foundation, opponent and newborn names use two to nine katakana',()=>{
  const s=R.initial();assert.ok(s.birds.every(b=>R.validBirdName(b.name)));
  assert.ok(R.ROOTS.every(b=>R.validBirdName(b.name)));
  const child=R.createBird(s);assert.ok(R.validBirdName(child.name));
  s.week=49;const event=R.calendar(s.week).find(e=>e.level==='GI')||R.calendar(s.week)[0];
  assert.ok(R.worldRoster(s,event).every(b=>R.validBirdName(b.name)));
  for(let i=0;i<160;i++){
    const name=R.generatedName(s,'ファイア');assert.ok(R.validBirdName(name));
    assert.ok(!s.birds.some(b=>b.name===name));s.birds.push({name});s.serial++;
  }
});

test('rename and registration reject kanji, numbers, hiragana and invalid lengths atomically',()=>{
  const s=R.initial(),b=R.own(s)[0],original=b.name;
  for(const name of ['ア','アイウエオカキクケコ','漢字','チョコボ2','チョコボ２','あおば','ア・オ','Aオ','ｱｵ']){
    assert.throws(()=>R.rename(s,b.id,name),/2〜9文字のカタカナ/);assert.equal(b.name,original);
  }
  for(const name of ['アオ','ヴァルキリー','アイウエオカキクケ']){R.rename(s,b.id,name);assert.equal(b.name,name);}
  const a=R.createBird(s),c=R.createBird(s);
  s.reports=[{id:`report-${s.serial++}`,type:'registration',birdIds:[a.id,c.id]}];
  const before=JSON.stringify(s);
  assert.throws(()=>R.acknowledge(s,{names:{[a.id]:'アオバ',[c.id]:'漢字'}}),/カタカナ/);
  assert.equal(JSON.stringify(s),before);
  R.acknowledge(s);assert.ok(a.registered&&c.registered);
});

test('legacy names migrate consistently across race fields and replay without altering identities or RNG',()=>{
  const s=R.initial(),mother=R.buy(s,s.sale[0]);R.breed(s,mother.id,R.sires(s)[0].id);
  while(s.reports.length)R.acknowledge(s);R.advance(s);
  const b=R.own(s).find(b=>b.records.length),r=b.records.at(-1),oldName='外枠新星 2026';
  b.name=oldName;
  for(const field of [r.field,r.replay.runners])field.find(x=>x.id===b.id).name=oldName;
  const before={rng:s.rng,id:b.id,parents:[...b.parents],time:r.time};
  assert.ok(R.validState(s));R.upgradeState(s);
  assert.ok(R.validBirdName(b.name));assert.equal(r.field.find(x=>x.id===b.id).name,b.name);
  assert.equal(r.replay.runners.find(x=>x.id===b.id).name,b.name);assert.ok(Replay.valid(r.replay,r));
  assert.deepEqual({rng:s.rng,id:b.id,parents:b.parents,time:r.time},before);
  const once=JSON.stringify(s);R.upgradeState(s);assert.equal(JSON.stringify(s),once);
});
