'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {R}=require('../tools/lib/breeding-balance.cjs');
const {prepareWorld}=require('../tools/lib/ranch-fixtures.cjs');
const {evolveWorld,auditEvolvingBreeding,reference}=require('../tools/lib/evolving-breeding-balance.cjs');
const Physics=require('../public/js/race-physics.js'),Race=require('../public/js/ranch-race.js');
const initial=()=>R.initial(20260930,{},prepareWorld());

test('evolving audit uses production pedigrees and replaces ten public sires per year without physics',()=>{
  const base=initial(),before=JSON.stringify(base),simulate=Race.simulate,step=Physics.step;
  let world;
  Physics.step=()=>{throw Error('Race physics must not run');};
  try{world=evolveWorld(base,{years:4,breedingYears:[1,2,3,4]});}
  finally{Physics.step=step;}
  assert.equal(Race.simulate,simulate);assert.equal(JSON.stringify(base),before);
  let previous=R.sires(base).filter(b=>b.owner==='public').map(b=>b.id);
  for(const season of world.seasons){
    const market=season.market.map(b=>b.id);
    assert.equal(market.length,50);assert.equal(market.filter(id=>!previous.includes(id)).length,10);
    previous=market;
    if(season.year>1)assert.equal(season.events.length,37);
    assert.ok(season.events.every(e=>e.entrants.every(b=>b.farm)&&e.fieldSize===6));
  }
  for(const [year,s] of world.markets){
    const sires=R.sires(s).filter(b=>b.owner==='public'&&b.farm);
    assert.equal(sires.length,50);
    assert.ok(sires.every(b=>year-b.retiredYear<5));
    assert.ok(sires.every(b=>b.records.some(r=>r.level==='GI'&&r.rank===1)));
    const current=s.birds.filter(b=>b.owner==='npc');
    assert.ok(current.every(b=>b.parents.length===2&&b.parents.every(id=>R.bird(s,id))),`year ${year} retains real parents`);
  }
  assert.ok(world.seasons[3].reference.mean>world.seasons[0].reference.mean,'NPC genetic strength evolves');
});

test('world substitution is restored even when a progress callback fails',()=>{
  const simulate=Race.simulate;
  assert.throws(()=>evolveWorld(initial(),{years:1,onYear:()=>{throw Error('Stop audit');}}),/Stop audit/);
  assert.equal(Race.simulate,simulate);
});

test('offspring face future age-eligible fields and expired sires cannot be selected',()=>{
  const base=initial(),before=JSON.stringify(base);
  const audit=auditEvolvingBreeding(base,{worlds:1,trials:2,generations:2,levels:[9]});
  assert.equal(JSON.stringify(base),before);
  assert.equal(audit.stationaryMarket,false);assert.equal(audit.lastYear,7);
  for(const scenario of audit.scenarios){
    assert.deepEqual(scenario.rows.map(r=>[r.birthYear,r.raceYear]),[[1,4],[4,7]]);
    assert.ok(scenario.rows.every(r=>r.sampleCount===2));
    assert.ok(scenario.rows[1].gap.mean>0,'second generation exceeds its contemporary opponents');
    assert.equal(scenario.rows[0].referenceMean,reference(audit.results[0].seasons[3].events).mean);
    const previous=new Set(audit.results[0].seasons[2].market.map(b=>b.name));
    assert.ok(scenario.rows[1].sires.every(b=>previous.has(b.name)),'father is in the current market');
  }
});

test('reference excludes juvenile and male-only fields for a three-year-old filly',()=>{
  const field=(minAge,maxAge,sex,value)=>({minAge,maxAge,sex,mean:value,best:value});
  const r=reference([field(2,2,null,200),field(3,3,'M',200),field(3,3,'F',100),field(3,9,null,120)]);
  assert.equal(r.eventCount,2);assert.equal(r.mean,110);assert.equal(r.best,120);
});
