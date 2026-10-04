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
    .find(e=>e.level===level&&(!name||e.name===name)&&R.eligible({...s,week:e.week},b,e));
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

test('museum uses farm notebook victories across birds and years after sale, return and save reload',()=>{
  const {s,b}=champion();b.sex='F';
  const successor={...structuredClone(b),id:`bird-${s.serial++}`,name:'コウケイノヒカリ',sex:'M',wins:4,races:4};
  s.birds.push(successor);
  for(const name of R.EIGHT.slice(0,5))win(s,b,'GI',name);
  R.retire(s,b.id);R.sellMare(s,b.id);
  assert.match(R.facilityReason(s,'museum'),/8大競走/);
  for(const name of R.EIGHT.slice(5))win(s,successor,'GI',name,145);
  R.retire(s,successor.id);R.releaseStud(s,successor.id);
  assert.equal(b.owner,'archive');assert.equal(successor.owner,'archive');
  assert.ok(R.EIGHT.every(name=>s.firstWins[`g1:${name}`]));
  const saved=R.serializeState(s);
  assert.equal(R.facilityReason(s,'museum'),'');
  assert.equal(R.serializeState(s),saved,'checking facilities leaves the notebook and game state untouched');
  for(const legacy of [false,true]){
    const loaded=R.deserializeState(saved);
    if(legacy){delete loaded.firstWins;loaded.journal=[];loaded.reports=[];}
    R.upgradeState(loaded);
    assert.ok(R.validState(loaded));assert.deepEqual(loaded.firstWins,s.firstWins);
    const balance=loaded.money;
    loaded.money=0;assert.match(R.facilityReason(loaded,'museum'),/ギルが足りません/);loaded.money=balance;
    assert.equal(R.facilityReason(loaded,'museum'),'');
    R.build(loaded,'museum');
    assert.equal(loaded.facilities.museum,1);assert.equal(loaded.money,balance-R.FACILITIES.museum.cost);
  }
});

test('museum stays locked without all notebook victories even if owned birds have matching race records',()=>{
  const s=R.initial(),b=R.own(s)[0];s.money=1e9;
  const last=R.EIGHT.at(-1);
  for(const name of R.EIGHT.slice(0,-1))s.firstWins[`g1:${name}`]={week:s.week,birdId:b.id,birdName:b.name,raceName:name};
  const result={week:s.week,year:1,name:last,level:'GI',rank:1,finished:true,field:[]};
  for(const [rank,finished] of [[2,true],[1,false],[1,true]]){
    b.records=[{...result,rank,finished}];
    assert.match(R.facilityReason(s,'museum'),/8大競走/);
    assert.throws(()=>R.build(s,'museum'),/8大競走/);
    assert.equal(s.facilities.museum,0);
  }
  const npc=s.birds.find(x=>x.farm);npc.records=[result];
  b.records=[];delete s.firstWins;R.upgradeState(s);
  assert.equal(s.firstWins[`g1:${last}`],undefined);
  assert.match(R.facilityReason(s,'museum'),/8大競走/);
});

test('import validation rejects malformed first-victory data while accepting older saves',()=>{
  const s=R.initial();assert.ok(R.validState(s));delete s.firstWins;assert.ok(R.validState(s));
  const b=R.own(s)[0],valid={week:9,birdId:b.id,birdName:b.name,raceName:'試走'};
  s.firstWins={graded:valid};assert.ok(R.validState(s));
  for(const value of [null,[],{graded:{...valid,week:10}},{graded:{...valid,birdId:'missing'}},{graded:{...valid,birdName:42}},{unknown:valid}]){
    s.firstWins=value;assert.equal(R.validState(s),false);
  }
});
