'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {R}=require('../tools/lib/ranch-fixtures.cjs');
const {eventAge,prepareEntrant,auditG1Races}=require('../tools/lib/g1-race-balance.cjs');
const Race=require('../public/js/ranch-race.js'),Physics=require('../public/js/race-physics.js');

test('race preparation keeps birth potential, inherited aptitudes and growth, with real age development',()=>{
  const s=R.initial(),child=R.own(s)[0],before=structuredClone(child),b=prepareEntrant(child);
  assert.deepEqual(child,before);
  assert.deepEqual(b.potential,child.potential);assert.deepEqual(b.genome,child.genome);
  assert.deepEqual(b.personality,child.inborn);
  assert.ok(Object.values(b.training).every(x=>x===.95));
  assert.equal(b.condition,100);assert.equal(b.strain,0);assert.equal(b.wins,2);
  const juvenile=R.currentAbilities({...s,week:(b.birthYear+1)*48+8},b);
  const mature=R.currentAbilities({...s,week:(b.birthYear+4)*48+8},b);
  assert.ok(Object.keys(juvenile).some(key=>juvenile[key]<mature[key]),'age factors cannot be bypassed');
});

test('physical G1 audit runs three independent maternal lines, settles genuine victories and retains eligible ages',()=>{
  const base=R.initial(),before=JSON.stringify(base),simulate=Race.simulate,step=Physics.step;
  let physicsSteps=0,physicalFields=0,audit;
  Physics.step=(...args)=>{physicsSteps++;return step(...args);};
  Race.simulate=(...args)=>{physicalFields++;return simulate(...args);};
  try{audit=auditG1Races(base,{generations:[2],eventNames:['チョコボダービー','オニオンガールステークス']});}
  finally{Physics.step=step;Race.simulate=simulate;}
  assert.equal(JSON.stringify(base),before);
  assert.equal(physicalFields,6,'all six actual races use physics; background world does not');
  assert.ok(physicsSteps>1000);
  assert.equal(audit.eventCount,2);assert.equal(audit.attemptsPerEvent,3);
  const [stage]=audit.stages;
  assert.equal(stage.runs,6);
  for(const row of stage.rows){
    assert.equal(new Set(row.attempts.map(a=>a.mother)).size,3);
    assert.equal(new Set(row.attempts.map(a=>a.seed)).size,3);
    for(const attempt of row.attempts){
      assert.equal(attempt.age,row.age);
      assert.equal(attempt.raceYear,attempt.birthYear+row.age);
      assert.equal(attempt.fieldSize,12);assert.equal(attempt.validReplay,true);
      assert.equal(attempt.g1Recorded,Number(attempt.rank===1&&attempt.finished));
      assert.equal(attempt.field[attempt.rank-1].time,attempt.time);
      assert.ok(attempt.field.every(b=>b.finished&&Number.isFinite(b.time)));
    }
  }
  assert.ok(stage.winningEvents>0);
});

test('G1 audit respects juvenile, classic and older age ranges',()=>{
  assert.equal(eventAge({minAge:2,maxAge:2}),2);
  assert.equal(eventAge({minAge:3,maxAge:3}),3);
  assert.equal(eventAge({minAge:3,maxAge:9}),5);
  assert.equal(eventAge({minAge:4,maxAge:9}),5);
  assert.equal(eventAge({minAge:6,maxAge:9}),6);
});
