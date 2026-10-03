'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const W=require('../public/js/world.js');
const copy=x=>structuredClone(x);

test('every class offers suitable distances on both surfaces, preserving legacy event IDs',()=>{
  for(let week=1;week<=48;week++){
    const events=R.calendar(week);
    assert.equal(new Set(events.map(e=>e.id)).size,events.length);
    for(const old of W.calendar(week))assert.ok(events.some(e=>e.id===old.id&&e.distance===old.distance&&e.trackId===old.trackId));
    for(const level of ['new','maiden','c1','c2','c3','open']){
      const races=events.filter(e=>e.level===level);
      for(const surface of ['turf','dirt'])for(const distance of [1400,1800,2200,2400]){
        assert.ok(races.some(e=>e.surface===surface&&e.distance===distance),`${week}/${level}/${surface}/${distance}`);
      }
      assert.ok(races.some(e=>e.surface==='turf'&&e.distance===3000));
    }
    for(const e of events)assert.equal(e.track.surface,e.surface);
  }
});

test('automatic racing stays within distance aptitude at every class and under either policy',()=>{
  const s=R.initial(),b=R.own(s)[0],before=s.rng;
  for(const policy of ['steady','challenge'])for(const [tendency,min,max] of [[-.85,1000,1600],[0,1600,2200],[.5,2200,3600],[.85,2200,3600]]){
    b.policy=policy;b.genome.distance=[tendency,tendency];
    for(let wins=0;wins<=6;wins++)for(const races of wins?[wins]:[0,1])for(let week=1;week<=48;week++){
      Object.assign(b,{wins,races,birthYear:-2,lastRace:week-4});s.week=week;
      const e=R.nextRace(s,b);
      assert.ok(e,`${policy}/${tendency}/${wins}/${week}`);
      assert.ok(e.distance>=min&&e.distance<=max,`${policy}/${tendency}/${wins}/${week}: ${e.name} ${e.distance}`);
      assert.ok(e.week-b.lastRace>=4);
      assert.ok(R.eligible({...s,week:e.week},b,e));
    }
  }
  assert.equal(s.rng,before);
});

test('challenge policy cannot outweigh a pronounced surface preference or distance mismatch',()=>{
  const s=R.initial(),b=R.own(s)[0];
  Object.assign(b,{wins:2,races:2,birthYear:-2,policy:'challenge'});b.genome.distance=[-.8,-.8];
  for(const surface of ['turf','dirt']){
    b.genome.traits.aptitude[surface]=[1,1];b.genome.traits.aptitude[surface==='turf'?'dirt':'turf']=[0,0];
    for(let week=1;week<=48;week++){
      s.week=week;const e=R.nextRace(s,b);
      assert.equal(e.surface,surface);assert.ok(e.distance<=1600);
    }
  }
  s.week=21;b.genome.distance=[.5,.5];b.genome.traits.aptitude.turf=[1,1];b.genome.traits.aptitude.dirt=[0,0];
  assert.equal(R.nextRace(s,b).name,'チョコボダービー');
});

test('future plans apply next calendar year age restrictions and keep the four-week interval',()=>{
  const s=R.initial(),b=R.own(s)[0];s.week=47;b.birthYear=-6;b.lastRace=47;
  const e=R.nextRace(s,b);assert.ok(e);assert.equal(e.week,51);assert.ok(R.eligible({...s,week:e.week},b,e));
  b.birthYear=-8;assert.equal(R.nextRace(s,b),null);
});

test('steady policy targets winnable stakes with two wins, falls back against stronger rivals and preserves previews',()=>{
  const s=R.initial(),b=R.own(s)[0];
  Object.assign(s,{week:13,money:1000000});
  Object.assign(b,{birthYear:-3,wins:2,races:2,policy:'steady',lastRace:9});
  b.genome.distance=[0,0];b.genome.traits.aptitude.turf=[1,1];b.genome.traits.aptitude.dirt=[0,0];
  for(const key in b.potential){b.potential[key]=150;b.training[key]=1;}
  const before=JSON.stringify(s),event=R.nextRace(s,b);
  assert.ok(/^G/.test(event.level),event.name);assert.equal(event.week,s.week);
  const outlook=R.raceOutlook(s,b,event);
  assert.equal(outlook.contender,true);
  assert.equal(outlook.time,R.simulateBird(s,b,event).time,'outlook uses the shared race physics');
  assert.equal(R.weeklyPlan(s,b).mode,'race');
  assert.equal(JSON.stringify(s),before,'planning generates neither persistent birds nor RNG changes');
  assert.equal(R.nextRace(s,b).id,event.id,'cached preview is deterministic');
  const loaded=R.deserializeState(R.serializeState(s));
  assert.equal(R.nextRace(loaded,R.bird(loaded,b.id)).id,event.id);
  for(const key in b.potential)b.potential[key]=50;
  assert.equal(R.raceOutlook(s,b,event).contender,false);
  assert.ok(!/^G/.test(R.nextRace(s,b).level),'weak bird returns to its ordinary class');
  for(const key in b.potential)b.potential[key]=150;
  b.wins=1;assert.ok(!/^G/.test(R.nextRace(s,b).level),'two wins remain necessary');
  b.wins=2;s.money=1000;assert.ok(!/^G/.test(R.nextRace(s,b).level),'unaffordable stakes do not block ordinary races');
});

test('steady stakes forecasts respect the live field, distance, surface, race spacing and health',()=>{
  const s=R.initial(),b=R.own(s)[0];
  Object.assign(s,{week:13,money:1000000,stage:'running',reports:[]});
  Object.assign(b,{birthYear:-3,wins:2,races:2,lastRace:9});
  b.genome.distance=[0,0];b.genome.traits.aptitude.turf=[1,1];b.genome.traits.aptitude.dirt=[0,0];
  for(const key in b.potential){b.potential[key]=150;b.training[key]=1;}
  const e=R.nextRace(s,b);assert.ok(/^G/.test(e.level));
  const rivals=R.worldRoster(s,e);
  for(const r of rivals){for(const key in r.potential){r.potential[key]=50;r.training[key]=1;}}
  const easy=R.raceOutlook(s,b,e);assert.equal(easy.contender,true);
  for(const r of rivals){for(const key in r.potential)r.potential[key]=150;}
  const hard=R.raceOutlook(s,b,e);assert.ok(hard.bestRivalTime<easy.bestRivalTime,'live rival changes invalidate time estimates');
  assert.equal(hard.bestRivalTime,Math.min(...rivals.map(r=>R.simulateBird({...s,week:e.week},r,e).time)));
  assert.equal(e.surface,'turf');assert.ok(e.distance>=1600&&e.distance<=2200);
  b.lastRace=12;assert.ok(R.nextRace(s,b).week>=16);
  b.lastRace=9;
  for(const patch of [{condition:74,strain:0,health:0},{condition:100,strain:25,health:0},{condition:100,strain:0,health:1}]){
    Object.assign(b,patch);assert.equal(R.weeklyPlan(s,b).mode,'rest');
  }
  Object.assign(b,{condition:100,strain:0,health:0});
  // The real weekly advance must enter the selected shared stakes field.
  const selected=R.nextRace(s,b);R.advance(s);
  assert.equal(selected.week,13);assert.ok(/^G/.test(selected.level));
  assert.equal(b.records.at(-1).name,selected.name);assert.equal(b.lastRace,13);
});

test('prize tiers, top-five payouts, allowances and distance/surface slopes hold across the year',()=>{
  const events=Array.from({length:48},(_,i)=>R.calendar(i+1)).flat();
  for(const e of events){
    const prize=e.purse[0];
    if(e.level==='GI')assert.ok(prize>=100000000&&prize<=500000000);
    else if(e.level==='GII')assert.ok(prize>=10000000&&prize<100000000);
    else if(e.level==='GIII')assert.ok(prize>=1000000&&prize<10000000);
    else if(e.level==='open')assert.ok(prize>=100000&&prize<1000000);
    else assert.ok(prize>=10000&&prize<100000);
    assert.deepEqual(e.purse,[1,.4,.25,.15,.1,0].map(ratio=>Math.round(prize*ratio)));
    assert.ok(e.allowance>=prize*.01&&e.allowance<=prize*.05);
  }
  const races=R.calendar(9),find=(level,surface,distance)=>races.find(e=>e.level===level&&e.surface===surface&&e.distance===distance);
  for(const level of ['new','maiden','c1','c2','c3','open']){
    const short=find(level,'turf',1400),mile=find(level,'turf',1800),long=find(level,'turf',3000),dirt=find(level,'dirt',1800);
    assert.ok(short.purse[0]<mile.purse[0]&&mile.purse[0]<long.purse[0]);
    assert.ok(dirt.purse[0]<mile.purse[0]);
    assert.ok(short.fee<mile.fee&&mile.fee<long.fee&&dirt.fee<mile.fee);
  }
  for(const surface of ['turf','dirt'])for(const distance of [1400,1800,2200,2400]){
    const purses=['maiden','new','c1','c2','c3','open'].map(level=>find(level,surface,distance).purse[0]);
    assert.ok(purses.every((v,i)=>!i||v>purses[i-1]));
  }
  assert.equal(events.find(e=>e.name==='チョコボダービー').purse[0],300000000);
  assert.equal(events.find(e=>e.name==='CRAワールドカップ').purse[0],500000000);
  assert.equal(events.find(e=>e.name==='バハムート記念').purse[0],500000000);
  assert.equal(events.find(e=>e.name==='王宮大賞典').purse[0],27600000);
  assert.equal(events.find(e=>e.name==='コスタ・デル・ソル杯').purse[0],3200000);
});

test('all twelve finishing positions settle top-five prize money and a 3% allowance exactly once',()=>{
  const s=R.initial(),first=R.own(s)[0];s.money=1000000;s.facilities.stalls=2;
  const birds=[first];
  for(let i=1;i<12;i++){
    const b=copy(first);b.id=`bird-${s.serial++}`;b.name=`カゼ${'アイウエオカキクケコサ'[i-1]}`;s.birds.push(b);birds.push(b);
  }
  const e=R.calendar(s.week).find(e=>e.level==='new'),runs=R.simulateField(s,birds,e,true);
  const ranks=new Set();
  for(const b of birds){
    const before=s.money,earnings=b.earnings,result=R.race(s,b,e,runs);
    ranks.add(result.rank);
    assert.equal(result.prize,e.purse[result.rank-1]||0);
    assert.equal(result.allowance,Math.round(e.purse[0]*.03));
    assert.equal(result.reward,result.prize+result.allowance);
    assert.equal(s.money,before-e.fee+result.reward);assert.equal(b.earnings,earnings+result.reward);
    assert.throws(()=>R.race(s,b,e,runs));assert.equal(s.money,before-e.fee+result.reward);
  }
  assert.equal(ranks.size,12);assert.ok(R.validState(s));
  assert.deepEqual(R.deserializeState(R.serializeState(s)),s);
});

test('early stall expansions and research can be funded by a debut and one-win-class victory',()=>{
  const s=R.initial();s.money-=3400;
  const races=R.calendar(9),debut=races.find(e=>e.level==='new'&&e.surface==='dirt'&&e.distance===1400),c1=races.find(e=>e.level==='c1'&&e.surface==='dirt'&&e.distance===1400);
  const research=copy(s);
  s.money+=debut.purse[0]+debut.allowance-debut.fee;
  assert.equal(R.facilityCost(s,'stalls'),25000);R.build(s,'stalls');
  s.money+=c1.purse[0]+c1.allowance-c1.fee;
  assert.equal(R.facilityCost(s,'stalls'),35000);R.build(s,'stalls');
  assert.deepEqual(R.capacity(s),{racing:24,mare:12,stud:12});assert.ok(s.money>0);
  assert.equal(R.facilityCost(s,'stalls'),12000000);
  research.money+=debut.purse[0]+debut.allowance-debut.fee;research.milestones.win=9;
  assert.equal(R.facilityReason(research,'lab'),'');R.build(research,'lab');assert.equal(R.labLevel(research),1);
  assert.throws(()=>R.build(research,'lab'),/最大/);
});

test('post-race energy and leg wear rise with turf distance and are lower on dirt',()=>{
  const base=R.initial(),losses={};
  for(const [key,surface,distance] of [['short','turf',1400],['mile','turf',1800],['long','turf',3000],['dirt','dirt',1800]]){
    const s=copy(base),b=R.own(s)[0];s.money=1000000;
    for(const ability in b.potential){b.potential[ability]=100;b.training[ability]=1;}
    for(const aptitude in b.genome.traits.aptitude)b.genome.traits.aptitude[aptitude]=[.5,.5];
    const e=R.calendar(s.week).find(e=>e.level==='new'&&e.surface===surface&&e.distance===distance);
    R.race(s,b,e,R.simulateField(s,[b],e,true));
    losses[key]={condition:100-b.condition,strain:b.strain};assert.ok(R.validState(s));
  }
  for(const stat of ['condition','strain']){
    assert.ok(losses.short[stat]<losses.mile[stat]&&losses.mile[stat]<losses.long[stat],JSON.stringify(losses));
    assert.ok(losses.dirt[stat]<losses.mile[stat],JSON.stringify(losses));
  }
});
