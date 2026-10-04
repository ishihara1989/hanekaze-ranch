'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {R,racer}=require('../tools/lib/ranch-fixtures.cjs');
const W=require('../public/js/world.js');

function champion(){
  const {s,b}=racer();s.money=1e9;b.birthYear=0;b.wins=2;b.races=3;b.policy='challenge';b.growth='early';
  for(const key in b.potential){b.potential[key]=150;b.training[key]=1;}
  for(const key in b.personality)b.personality[key]=150;
  return {s,b};
}
function win(s,b,level,name,startWeek=97){
  const event=Array.from({length:R.YEAR},(_,i)=>W.calendar(i+startWeek)).flat()
    .find(e=>e.level===level&&(!name||e.name===name)&&e.minAge<=3&&e.maxAge>=3&&(!e.sex||e.sex===b.sex));
  assert.ok(event);s.week=event.week;Object.assign(b,{condition:100,strain:0,health:0,lastRace:-100});
  const result=R.race(s,b,event);assert.equal(result.rank,1);assert.equal(result.finished,true);
  return result;
}

test('first graded wins retain the original winner and each G1 has its own saved first victory',()=>{
  const {s,b}=champion();
  const first=win(s,b,'GIII');
  const expected={week:first.week,birdId:b.id,birdName:b.name,raceName:first.name};
  assert.deepEqual(s.firstWins.graded,expected);assert.deepEqual(s.firstWins.g3,expected);
  b.name='アタラシイナマエ';
  const g2=win(s,b,'GII');assert.equal(s.firstWins.g2.birdName,b.name);
  assert.deepEqual(s.firstWins.graded,expected);
  const derby=win(s,b,'GI','チョコボダービー');
  const derbyFirst=structuredClone(s.firstWins['g1:チョコボダービー']);
  assert.equal(derbyFirst.week,derby.week);assert.equal(derbyFirst.birdName,b.name);
  assert.deepEqual(s.firstWins.derby,derbyFirst);assert.deepEqual(s.firstWins.g1,derbyFirst);
  b.name='ベツノナマエ';win(s,b,'GI','バハムート記念');
  assert.equal(s.firstWins['g1:バハムート記念'].birdName,b.name);
  const successor={...structuredClone(b),id:`bird-${s.serial++}`,name:'コウケイノヒカリ',birthYear:1};
  s.birds.push(successor);win(s,successor,'GI','チョコボダービー',145);
  assert.deepEqual(s.firstWins['g1:チョコボダービー'],derbyFirst);
  const loaded=R.deserializeState(R.serializeState(s));
  assert.deepEqual(loaded.firstWins,s.firstWins);assert.ok(R.validState(loaded));
});

test('legacy saves recover the earliest victory and race-time name, including sold birds, without NPC wins',()=>{
  const {s,b}=champion();const derby=win(s,b,'GI','チョコボダービー');
  const original=structuredClone(s.firstWins),snapshot=JSON.stringify({rng:s.rng,money:s.money,reports:s.reports});
  b.name='イマノナマエ';b.owner='archive';b.role='archived';
  // Earlier apparent placings with an unfinished run must never become first wins.
  const unfinished={...structuredClone(derby),week:9,finished:false};delete unfinished.replay;
  b.records.push(unfinished);
  const npc=s.birds.find(x=>x.farm&&x.records.some(r=>r.level==='GI'&&r.rank===1));
  assert.ok(npc);npc.owner='player';npc.role='mare';
  delete s.firstWins;assert.ok(R.validState(s));R.upgradeState(s);
  assert.deepEqual(s.firstWins,original);
  assert.equal(JSON.stringify({rng:s.rng,money:s.money,reports:s.reports}),snapshot);
  const before=R.serializeState(s);R.upgradeState(s);assert.equal(R.serializeState(s),before);
  // Pre-replay saves still have our sold bird's result field and its original name.
  delete s.firstWins;s.journal=[];s.reports=[];b.records.forEach(r=>delete r.replay);
  R.upgradeState(s);assert.deepEqual(s.firstWins,original);assert.ok(R.validState(s));
});

test('import validation rejects malformed first-victory data while accepting older saves',()=>{
  const s=R.initial();assert.ok(R.validState(s));delete s.firstWins;assert.ok(R.validState(s));
  const b=R.own(s)[0],valid={week:9,birdId:b.id,birdName:b.name,raceName:'試走'};
  s.firstWins={graded:valid};assert.ok(R.validState(s));
  for(const value of [null,[],{graded:{...valid,week:10}},{graded:{...valid,birdId:'missing'}},{graded:{...valid,birdName:42}},{unknown:valid}]){
    s.firstWins=value;assert.equal(R.validState(s),false);
  }
});
