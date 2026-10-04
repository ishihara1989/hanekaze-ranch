'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {R,read,progress}=require('../tools/lib/ranch-fixtures.cjs');
const Race=require('../public/js/ranch-race.js');
const stakes=year=>Array.from({length:48},(_,i)=>R.calendar((year-1)*48+i+1)).flat().filter(e=>/^G/.test(e.level));
const roster=()=>({week:1,rng:123,serial:1,birds:[]});

test('background racing keeps every G1 and one compatible lead-in per division across years',()=>{
  for(const year of [1,2,10]){
    const s=roster(),tracked=[];
    for(const e of stakes(year)){
      s.week=e.week;
      const field=R.worldRoster(s,e),persistent=field.filter(b=>!b.filler&&!b.temporary);
      if(persistent.length)tracked.push({e,ids:persistent.map(b=>b.id),group:persistent[0].worldGroup});
      else assert.ok(field.filter(b=>!b.filler).every(b=>b.temporary),e.name);
    }
    assert.equal(tracked.filter(({e})=>e.level==='GI').length,37);
    const preps=tracked.filter(({e})=>e.level!=='GI');
    assert.equal(preps.length,17);
    assert.equal(new Set(preps.map(p=>p.group)).size,preps.length);
    for(const prep of preps){
      const target=tracked.find(g=>g.e.level==='GI'&&g.group===prep.group&&g.e.week-prep.e.week>=4&&g.e.week-prep.e.week<=12);
      assert.ok(target,prep.e.name);
      assert.deepEqual(prep.ids,target.ids,'lead-in runners continue to their G1');
      assert.equal(prep.e.surface,target.e.surface);
    }
    assert.ok(s.birds.filter(b=>b.owner==='npc').every(b=>!/^support-|^local-/.test(b.worldGroup)));
  }
});

test('weekly advancement simulates only selected background events when no player is racing',()=>{
  const s=R.initial();s.stage='running';s.week=1;R.own(s)[0].role='retired';
  const simulated=[],simulate=Race.simulate;
  Race.simulate=(entries,event,options)=>{simulated.push({event,trace:options.trace});return simulate(entries,event,options);};
  try{progress(s,48);}finally{Race.simulate=simulate;}
  assert.equal(simulated.length,54);
  assert.equal(simulated.filter(({event})=>event.level==='GI').length,37);
  assert.ok(simulated.every(({event,trace})=>/^G/.test(event.level)&&!trace));
  assert.equal(s.journal.filter(r=>r.type==='weekly').flatMap(r=>r.notes).filter(n=>n.startsWith('GⅠ ')).length,37);
  assert.equal(R.sires(s).filter(b=>b.owner==='public').length,50);
  assert.ok(R.validState(s));
});

test('untracked grades generate class strength only on entry, share player results and preserve breeding RNG',()=>{
  const s=R.initial(),first=R.own(s)[0];Object.assign(s,{week:38,stage:'running',money:1000000,reports:[]});
  Object.assign(first,{birthYear:-2,wins:3,races:3,lastRace:-100});
  const second=structuredClone(first);second.id=`bird-${s.serial++}`;second.name='ハネカゼノツバサ';s.birds.push(second);
  const e=R.calendar(s.week).find(e=>e.referenceName==='東京盃');
  const before=structuredClone(s),opponents=R.worldRoster(s,e);
  assert.ok(opponents.filter(b=>!b.filler).every(b=>b.temporary));
  assert.deepEqual(s,before);
  assert.deepEqual(R.worldRoster(s,e),opponents);
  assert.equal(R.raceOutlook(s,first,e).bestRivalTime,Math.min(...opponents.map(b=>R.simulateBird(s,b,e).time)));
  assert.deepEqual(s,before,'forecasting does not add birds or consume RNG');
  for(const b of [first,second])R.setSchedule(s,b.id,s.week,{mode:'race',eventId:e.id});
  R.advance(s);
  const result=first.records.at(-1);
  assert.equal(result.name,e.name);assert.equal(result.field.length,12);assert.equal(result.replay.runners.length,12);
  assert.deepEqual(result.field,second.records.at(-1).field);
  assert.ok(result.field.filter(r=>![first.id,second.id].includes(r.id)).every(r=>!R.bird(s,r.id)));
  assert.ok(s.birds.every(b=>!b.temporary&&!b.filler));
  const loaded=R.deserializeState(R.serializeState(s));assert.deepEqual(loaded,s);assert.ok(R.validState(loaded));
});

test('existing lower-grade farm careers remain saved but are no longer entered',()=>{
  const s=R.initial(),e=R.calendar(s.week).find(e=>e.level==='new');
  const old=R.createBird(s,{owner:'npc',farm:R.MAJOR_FARMS[0].name,season:1,worldGroup:'local-new-turf',
    role:'racing',kind:'general',registered:true,sex:'F',birthYear:-1});
  const saved=structuredClone(old),rng=s.rng;
  const opponents=R.worldRoster(s,e);
  assert.ok(opponents.every(b=>b.id!==old.id));assert.deepEqual(old,saved);assert.equal(s.rng,rng);
  const loaded=R.upgradeState(R.deserializeState(R.serializeState(s)));
  assert.deepEqual(R.bird(loaded,old.id),saved);assert.ok(R.validState(loaded));
  // A temporary winner still closes the player's event to a second settlement.
  s.money=1000000;const first=R.own(s)[0],second=structuredClone(first);
  second.id=`bird-${s.serial++}`;second.name='ハネカゼノツバサ';s.birds.push(second);
  R.race(s,first,e);assert.throws(()=>R.race(s,second,e),/確定済み/);
  read(s);
});
