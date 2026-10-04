'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {R,racer}=require('../tools/lib/ranch-fixtures.cjs');

test('open promotion follows age and the June, December and January boundaries',()=>{
  const {s,b}=racer();
  b.records=[];b.graded=0;b.g1=0;
  for(const [years,month,openWins] of [[2,1,1],[2,12,1],[3,1,2],[3,6,2],[3,7,3],[3,12,3],[4,1,4],[9,12,4]]){
    s.week=(month-1)*4+1;b.birthYear=1-years;
    for(let wins=0;wins<=5;wins++){
      b.wins=wins;b.races=Math.max(1,wins);
      const expected=wins===0?'maiden':wins>=openWins?'open':`c${wins}`;
      assert.equal(R.classFor(s,b),expected,`${years} years / month ${month} / ${wins} wins`);
      for(const level of ['new','maiden','c1','c2','c3','open','GIII','GII','GI']){
        const e={level,minAge:2,maxAge:9};
        assert.equal(R.eligible(s,b,e),/^G/.test(level)?expected==='open':level===expected);
      }
    }
    b.wins=0;b.races=0;
    assert.equal(R.classFor(s,b),'new');
    assert.ok(R.eligible(s,b,{level:'new',minAge:2,maxAge:9}));
    assert.ok(R.eligible(s,b,{level:'maiden',minAge:2,maxAge:9}));
  }
});

test('only completed open and graded victories preserve open class with fewer wins',()=>{
  const {s,b}=racer();s.week=1;b.birthYear=-3;b.wins=1;b.races=2;
  b.graded=0;b.g1=0;
  for(const level of ['open','GIII','GII','GI']){
    b.records=[{level,rank:1}];
    assert.equal(R.classFor(s,b),'open','old records without a finished flag count');
    b.records[0].finished=true;
    assert.equal(R.classFor(s,b),'open');
    b.records[0].rank=2;
    assert.equal(R.classFor(s,b),'c1','participation and placing do not count');
    Object.assign(b.records[0],{rank:1,finished:false});
    assert.equal(R.classFor(s,b),'c1','an unfinished first row is not a victory');
  }
  for(const level of ['new','maiden','c1','c2','c3']){
    b.records=[{level,rank:1,finished:true}];
    assert.equal(R.classFor(s,b),'c1');
  }
  b.records=[];
  b.graded=1;assert.equal(R.classFor(s,b),'open');
  b.graded=0;b.g1=1;assert.equal(R.classFor(s,b),'open');
});

test('future reservations and automatic plans use the class at the race week',()=>{
  const {s,b}=racer();s.week=24;b.birthYear=-2;b.races=2;b.wins=2;b.records=[];b.lastRace=-100;
  const june=R.calendar(24).find(e=>e.level==='open'),july=R.calendar(25).find(e=>e.level==='open');
  assert.ok(R.raceOptions(s,b,24).some(e=>e.id===june.id));
  assert.ok(!R.raceOptions(s,b,25).some(e=>e.id===july.id));
  assert.ok(R.raceOptions(s,b,25).some(e=>e.level==='c2'));
  assert.throws(()=>R.setSchedule(s,b.id,25,{mode:'race',eventId:july.id}),/出走できません/);
  b.lastRace=21;
  const next=R.nextRace(s,b);
  assert.ok(next.week>=25);assert.equal(next.level,'c2');
  b.lastRace=-100;b.wins=3;b.races=3;s.week=48;
  assert.ok(R.raceOptions(s,b,48).some(e=>e.level==='open'));
  assert.ok(!R.raceOptions(s,b,49).some(e=>e.level==='open'));
  assert.ok(R.raceOptions(s,b,49).some(e=>e.level==='c3'));
  b.wins=1;b.races=1;b.birthYear=-1;
  assert.ok(R.raceOptions(s,b,48).some(e=>e.level==='open'));
  assert.ok(R.raceOptions(s,b,49).some(e=>e.level==='c1'));
});

test('a two-year-old can enter GI after one win and an open victory survives aging and reload',()=>{
  const {s,b}=racer();s.week=46;b.birthYear=-1;b.wins=1;b.races=1;b.lastRace=-100;s.money=1e9;
  const gi=R.calendar(47).find(e=>e.level==='GI'&&e.maxAge===2&&(!e.sex||e.sex===b.sex));
  assert.ok(gi);assert.ok(R.raceOptions(s,b,47).some(e=>e.id===gi.id));
  R.setSchedule(s,b.id,47,{mode:'race',eventId:gi.id});
  assert.equal(R.nextRace(s,b).id,gi.id);
  assert.equal(R.eligible({...s,week:47},{...b,sex:b.sex==='M'?'F':'M'},{...gi,sex:b.sex}),false);
  assert.equal(R.eligible({...s,week:47},{...b,birthYear:-2},gi),false);
  assert.equal(R.eligible({...s,week:47},{...b,registered:false},gi),false);
  R.setSchedule(s,b.id,47,{mode:'auto'});
  for(const key in b.potential){b.potential[key]=150;b.training[key]=1;}
  const open=R.calendar(s.week).find(e=>e.level==='open'&&e.surface==='turf'&&e.distance===1800);
  const result=R.race(s,b,open);
  assert.equal(result.rank,1);assert.equal(result.finished,true);assert.equal(b.wins,2);
  for(const week of [49,73,97])assert.equal(R.classFor({...s,week},b),'open');
  s.week=97;
  const loaded=R.deserializeState(R.serializeState(s)),saved=R.bird(loaded,b.id);
  assert.ok(R.validState(loaded));assert.equal(R.classFor(loaded,saved),'open');
  assert.ok(R.raceOptions(loaded,saved,97).some(e=>e.level==='open'));
});
