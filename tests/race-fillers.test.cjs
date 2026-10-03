'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const scratch=(seed=123)=>({week:9,rng:seed,serial:1,birds:[]});

test('general-only novice routes recur on every surface and distance without generating farm birds',()=>{
  const s=scratch();
  for(let week=1;week<=48;week++)for(const level of ['new','maiden']){
    const events=R.calendar(week).filter(e=>e.level===level&&e.opponents==='general');
    for(const surface of ['turf','dirt'])for(const distance of surface==='turf'?[1400,1800,2200,2400,3000]:[1400,1800,2200,2400])
      assert.ok(events.some(e=>e.surface===surface&&e.distance===distance),`${week}/${level}/${surface}/${distance}`);
    s.week=week;const before=structuredClone(s),field=R.worldRoster(s,events[0]);
    assert.equal(field.length,11);assert.ok(field.every(b=>b.filler));
    assert.deepEqual(s,before);
  }
});

test('automatic beginner entry settles a general-only field and preserves its booking across saves',()=>{
  const s=R.initial(),b=R.own(s)[0];s.stage='running';s.money=1000000;
  const e=R.nextRace(s,b);assert.equal(e.opponents,'general');
  R.setSchedule(s,b.id,e.week,{mode:'race',eventId:e.id});
  const loaded=R.deserializeState(R.serializeState(s));
  assert.equal(R.nextRace(loaded,R.bird(loaded,b.id)).id,e.id);
  const before=s.birds.map(b=>b.id),result=R.race(s,b,e);
  assert.deepEqual(s.birds.map(b=>b.id),before);
  assert.equal(result.field.length,12);assert.ok(result.field.filter(r=>r.id!==b.id).every(r=>r.filler));
  assert.ok(R.validState(s));
  assert.deepEqual(R.deserializeState(R.serializeState(s)),s);
});

test('general entrants fill vacancies without persistent identities, pedigrees or breeding RNG',()=>{
  const s=scratch(),e=R.calendar(s.week).find(e=>e.level==='new');
  const first=R.worldRoster(s,e),major=first.filter(b=>!b.filler),fillers=first.filter(b=>b.filler);
  assert.equal(first.length,11);assert.equal(major.length,R.MAJOR_FARMS.length);assert.equal(fillers.length,5);
  for(const b of major){assert.equal(R.bird(s,b.id),b);assert.equal(b.parents.length,2);}
  for(const b of fillers){
    assert.equal(R.bird(s,b.id),undefined);assert.equal(b.genome,undefined);assert.equal(b.parents,undefined);
    assert.equal(b.records,undefined);assert.equal(b.farm,undefined);assert.equal(R.farmName(b,s),'一般参加');
    assert.ok(R.validBirdName(b.name));
    for(const key of Object.keys(b.abilities)){
      assert.ok(b.abilities[key]>=50&&b.abilities[key]<=65);
      assert.ok(major.every(m=>b.abilities[key]<=R.currentAbilities(s,m)[key]));
    }
  }
  const saved=structuredClone(s);
  assert.deepEqual(R.worldRoster(s,e),first);assert.deepEqual(s,saved);
  assert.deepEqual(R.worldRoster(structuredClone(saved),e),first);
  assert.equal(R.worldRoster(s,e,{slots:10}).length,10);assert.deepEqual(s,saved);
  const next={...e,week:e.week+1,id:`${e.id}:next`};s.week++;
  const later=R.worldRoster(s,next);
  assert.deepEqual(later.filter(b=>!b.filler).map(b=>b.id),major.map(b=>b.id));
  assert.ok(later.filter(b=>b.filler).every(b=>!fillers.some(f=>f.id===b.id)));
});

test('general entrants still fill the field when their normal name stock is reserved',()=>{
  const s=scratch();
  s.birds=[...new Set([...R.Names.M,...R.Names.F])].map((name,i)=>({id:`reserved-${i}`,name:`ノラ${name}`,role:'racing',parents:[]}));
  const e=R.calendar(s.week).find(e=>e.level==='new'),field=R.worldRoster(s,e);
  assert.equal(field.length,11);assert.equal(new Set(field.map(b=>b.name)).size,11);
  assert.ok(field.every(b=>R.validBirdName(b.name)));
  assert.ok(field.filter(b=>b.filler).every(b=>!R.unavailableNames(s).has(b.name)));
});

test('all expanded stakes fill twelve slots and farm runners stay ahead on bad going',()=>{
  const s=scratch();
  for(let week=1;week<=48;week++)for(const e of R.calendar(week).filter(e=>/^G/.test(e.level))){
    s.week=week;const field=R.worldRoster(s,e,{slots:12});
    assert.equal(field.length,12,e.name);
    assert.equal(new Set(field.map(b=>b.id)).size,12);
    assert.equal(new Set(field.map(b=>b.name)).size,12);
    assert.ok(field.every(b=>R.age(s,b)>=e.minAge&&R.age(s,b)<=e.maxAge&&(!e.sex||b.sex===e.sex)),e.name);
    assert.ok(field.some(b=>!b.filler),e.name);
    assert.ok(s.birds.every(b=>!b.filler));
    const runs=R.simulateField(s,field,{...e,going:'bad'});
    assert.ok(runs.every(r=>r.finished),e.name);
    assert.ok(Math.max(...runs.filter(r=>!r.filler).map(r=>r.time))<Math.min(...runs.filter(r=>r.filler).map(r=>r.time)),e.name);
  }
});

test('farm runners beat general entrants through physics across classes, courses and seeds',()=>{
  for(const seed of [1,17,54321])for(const [level,surface,distance] of [
    ['new','turf',1400],['maiden','dirt',1800],['c1','turf',2400],['open','turf',3000],
    ['GIII','dirt',1800],['GI','turf',3200],
  ]){
    const s=scratch(seed),e=level==='GI'?R.calendar(17).find(e=>e.distance===3200):
      level==='GIII'?R.calendar(12).find(e=>e.level===level&&e.surface===surface&&e.distance===distance):
      R.calendar(9).find(e=>e.level===level&&e.surface===surface&&e.distance===distance);
    assert.ok(e);s.week=e.week;
    const field=R.worldRoster(s,e,{slots:12}),before=structuredClone(s);
    // Rotate the inner/outer gates so a favourable draw cannot hide a strength gap.
    const offset=seed%field.length,drawn=[...field.slice(offset),...field.slice(0,offset)];
    const runs=R.simulateField(s,drawn,e).sort((a,b)=>a.time-b.time);
    assert.ok(runs.every(r=>r.finished),`${seed}/${e.name}`);
    assert.ok(!runs[0].filler,`${seed}/${e.name}: ${runs[0].name}`);
    assert.ok(Math.max(...runs.filter(r=>!r.filler).map(r=>r.time))<Math.min(...runs.filter(r=>r.filler).map(r=>r.time)),`${seed}/${e.name}: every farm runner is faster`);
    assert.deepEqual(s,before);
  }
});

test('settlement stores only result snapshots for general entrants and real careers for farm runners',()=>{
  const s=R.initial(),b=R.own(s)[0];s.money=1000000;
  const e=R.calendar(s.week).find(e=>e.level==='new'),result=R.race(s,b,e);
  assert.equal(result.field.length,12);
  const fillers=result.field.filter(r=>r.filler),major=result.field.filter(r=>!r.filler&&r.id!==b.id);
  assert.ok(fillers.length);assert.ok(fillers.every(r=>R.bird(s,r.id)===undefined));
  for(const r of major){const rival=R.bird(s,r.id);assert.equal(rival.races,1);assert.equal(rival.records[0].name,e.name);}
  assert.ok(R.validState(s));
  const loaded=R.deserializeState(R.serializeState(s));
  assert.deepEqual(loaded,s);assert.ok(R.validState(loaded));
  assert.ok(loaded.birds.every(b=>!b.filler));
  assert.equal(result.replay.runners.length,12);
  // Market stock continues to be selected from fully simulated farm champions.
  for(const sire of R.sires(s).filter(b=>b.farm))assert.ok(sire.records.some(r=>r.rank===1&&r.level==='GI'&&!r.field[0].filler));
});

test('two player birds share one ordinary field and settle farm careers once',()=>{
  const s=R.initial(),first=R.own(s)[0];Object.assign(s,{stage:'running',money:1000000,reports:[]});
  const second=structuredClone(first);second.id=`bird-${s.serial++}`;second.name='ハネカゼノツバサ';s.birds.push(second);
  const e=R.calendar(s.week).find(e=>e.level==='new'&&e.surface==='turf'&&e.distance===1400);
  for(const b of [first,second])R.setSchedule(s,b.id,s.week,{mode:'race',eventId:e.id});
  const majors=R.worldRoster(s,e).filter(b=>!b.filler),loaded=structuredClone(s);
  R.advance(s);R.advance(loaded);assert.deepEqual(s,loaded);
  assert.equal(first.records.length,1);assert.equal(second.records.length,1);
  assert.deepEqual(first.records[0].field,second.records[0].field);
  assert.deepEqual(first.records[0].replay,second.records[0].replay);
  assert.notEqual(first.records[0].rank,second.records[0].rank);
  assert.equal(first.records[0].field.length,12);
  for(const b of majors){assert.equal(b.races,1);assert.equal(b.records.length,1);assert.equal(b.records[0].name,e.name);}
  assert.ok(R.validState(s));
});
