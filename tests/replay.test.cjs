'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../public/js/ranch-engine.js');
const Replay=require('../public/js/race-replay.js');
const W=require('../public/js/world.js');
function recorded(){const state=R.initial();const mother=R.buy(state,state.sale[0]);R.breed(state,mother.id,R.sires(state)[0].id);while(state.reports.length)R.acknowledge(state);R.advance(state);const bird=R.own(state).find(b=>b.records.length);return {state,bird,record:bird.records.at(-1)};}

test('settled races record all gates, feather colors and exact finishing samples',()=>{
  const {state,bird,record:r}=recorded();assert.ok(Replay.valid(r.replay,r));
  assert.equal(r.replay.runners.length,r.field.length);assert.equal(r.replay.runners.length,12);
  assert.equal(new Set(r.replay.runners.map(x=>x.lane)).size,12);
  for(const runner of r.replay.runners){
    const result=r.field.find(x=>x.id===runner.id);assert.equal(runner.time,result.time);
    assert.equal(runner.samples.at(-1)[0],result.time);assert.equal(runner.samples.at(-1)[1],r.distance);
    assert.equal(Replay.sample(runner,runner.time).finished,true);
  }
  const mine=r.replay.runners.find(x=>x.id===bird.id);assert.equal(mine.color,bird.color);assert.equal(mine.crest,bird.crest);
  for(const runner of r.replay.runners)assert.ok(Replay.validPaddock(runner.paddock));
  assert.equal(mine.paddock.races,bird.races-1);assert.equal(mine.paddock.wins,bird.wins-1);
  assert.ok(mine.paddock.condition>bird.condition,'paddock preserves condition before the race cost');
  const before=JSON.stringify(state);Replay.commentary({...r,birdId:bird.id});Replay.standings(r.replay,50);assert.equal(JSON.stringify(state),before);
  const order=Replay.standings(r.replay,900).map(x=>x.id);assert.deepEqual(order,r.field.map(x=>x.id));
});

test('packed saves deduplicate replay in history, report and journal and reload identically',()=>{
  const {state,bird,record:r}=recorded();assert.ok(R.validState(state));
  let packed=JSON.parse(R.serializeState(state));assert.equal(packed.raceReplays.length,1);
  assert.ok(Number.isInteger(packed.birds.find(x=>x.id===bird.id).records.at(-1).replay));
  assert.deepEqual(R.deserializeState(JSON.stringify(packed)),state);
  while(state.reports.length)R.acknowledge(state);
  packed=JSON.parse(R.serializeState(state));assert.equal(packed.raceReplays.length,1);
  assert.ok(state.journal.some(x=>x.results?.some(result=>result.replay)));
  const restored=R.deserializeState(JSON.stringify(packed));assert.ok(R.validState(restored));assert.deepEqual(restored,state);
  const old=structuredClone(state);old.birds.forEach(b=>b.records.forEach(r=>delete r.replay));old.journal.forEach(x=>x.results?.forEach(r=>delete r.replay));
  assert.ok(R.validState(old));assert.deepEqual(R.deserializeState(R.serializeState(old)),old);
});

test('invalid or corrupted replay imports are rejected without relaxing save validation',()=>{
  const {record:r,state}=recorded();
  const bad=[x=>x.runners[0].samples[1][0]=-1,x=>x.runners[0].samples.at(-1)[1]=0,
    x=>x.runners[1].lane=x.runners[0].lane,x=>x.runners[0].time+=1,
    x=>x.runners[0].color='invalid',x=>x.runners[0].samples[1][2]=Infinity,
    x=>x.runners[0].samples[1][3]=99,x=>x.runners.pop(),x=>x.distance+=1];
  for(const corrupt of bad){const replay=structuredClone(r.replay);corrupt(replay);assert.equal(Replay.valid(replay,r),false);}
  const reversed={...r,field:r.field.toReversed()};assert.equal(Replay.valid(r.replay,reversed),false);
  assert.equal(Replay.valid(r.replay,{...r,time:r.time+.5}),false);
  const saved=JSON.parse(R.serializeState(state));saved.raceReplays[0].runners[0].samples[1][0]=-1;
  assert.equal(R.validState(R.deserializeState(JSON.stringify(saved))),false);
  saved.raceReplays=[];assert.throws(()=>R.deserializeState(JSON.stringify(saved)),/replay/);
});

test('interpolation handles fractional times, exact samples, timeouts and final order',()=>{
  const runner={time:10,finished:true,samples:[[0,0,0,0],[5,40,12,1],[10,100,0,2]]};
  assert.equal(Replay.sample(runner,2.5).distance,20);assert.equal(Replay.sample(runner,5).distance,40);
  assert.equal(Replay.sample(runner,-10).distance,0);assert.equal(Replay.sample(runner,20).distance,100);
  assert.equal(Replay.sample({...runner,finished:false},20).finished,false);
  assert.equal(Replay.sample({...runner,finished:false},20).stopped,true);
});

test('lateral samples interpolate continuously and old fixed-lane replays remain valid',()=>{
  const {record:r}=recorded(),runner=r.replay.runners.find(x=>x.lane===11);
  assert.equal(r.replay.version,2);assert.ok(runner.samples.some(s=>s[4]<11));
  const moving={lane:11,time:4,finished:false,samples:[[0,0,0,0,11],[4,40,15,7,9]]};
  assert.equal(Replay.sample(moving,2).lateral,10);
  const old=structuredClone(r.replay);old.version=1;
  for(const bird of old.runners)bird.samples=bird.samples.map(s=>s.slice(0,4));
  assert.ok(Replay.valid(old,r));assert.equal(Replay.sample(old.runners[0],10).lateral,old.runners[0].lane);
  for(const lateral of [-1,12,NaN]){const bad=structuredClone(r.replay);bad.runners[0].samples[1][4]=lateral;assert.equal(Replay.valid(bad,r),false);}
});

test('all courses return to the same finish plane for every lane and every lap',()=>{
  for(const track of Object.values(W.TRACKS))for(const distance of [1200,1800,3200]){
    const r={distance,replay:{hill:track.hill}};
    for(let lane=0;lane<12;lane++){
      const goal=Replay.position(distance,lane,r,track),lap=Replay.position(distance+track.lap,lane,r,track);
      assert.ok(Math.abs(goal.x)<1e-9);
      for(const k of ['x','y','z','heading'])assert.ok(Math.abs(goal[k]-lap[k])<1e-9);
      for(let d=0;d<=distance;d+=17){const p=Replay.position(d,lane,r,track);assert.ok([p.x,p.y,p.z,p.heading].every(Number.isFinite));}
    }
    const delta=Replay.position(distance-.01,0,r,track).x;
    assert.equal(delta>0,track.theme.includes('右回り'));
  }
});

test('metre-scale straights advance eight 2.5m bodies at 20m/s and span twenty bodies',()=>{
  assert.equal(Replay.METRES.birdHeight,2.5);
  for(const track of Object.values(W.TRACKS)){
    const r={distance:1400},c=Replay.course(r,track);
    assert.equal(c.scale,1);assert.equal(c.straight,track.straight);
    assert.ok(Math.abs(c.straight*2+Math.PI*2*c.radius-track.lap)<1e-9);
    for(let lane=0;lane<12;lane++){
      const a=Replay.position(r.distance-80,lane,r,track),b=Replay.position(r.distance-60,lane,r,track);
      assert.equal(a.corner,false);assert.equal(b.corner,false);
      assert.ok(Math.abs(Math.hypot(b.x-a.x,b.z-a.z)/Replay.METRES.birdHeight-8)<1e-9);
    }
    const inner=Replay.position(r.distance,-.5,r,track),outer=Replay.position(r.distance,11.5,r,track);
    assert.equal(Math.round(Math.abs(outer.z-inner.z)),50);
    assert.equal(c.width/Replay.METRES.birdHeight,20);
    assert.ok(c.finalStraight>=track.straight*.8);
  }
});

test('finish run-out preserves velocity through the line, then smoothly stops without altering results',()=>{
  const runner={id:'a',lane:0,time:70,finished:true,samples:[[0,0,20,0],[70,1400,20,2]]},
    before=JSON.stringify(runner);
  assert.equal(Replay.visualSample(runner,69).distance,1380);
  assert.equal(Replay.visualSample(runner,70).stopped,false);
  assert.equal(Replay.visualSample(runner,71).distance,1420);
  assert.equal(Replay.visualSample(runner,72).speed,20);
  let previous=Replay.visualSample(runner,72);
  for(let t=72.1;t<78;t+=.1){const current=Replay.visualSample(runner,t);
    assert.ok(current.distance>previous.distance);assert.ok(current.speed<previous.speed);previous=current;}
  const end=Replay.visualSample(runner,78);
  assert.equal(end.distance,1500);assert.equal(end.speed,0);assert.equal(end.stopped,true);
  assert.deepEqual(Replay.visualSample(runner,90),end);
  for(const t of [70,72,75,77.9]){
    const eps=.0001,left=Replay.visualSample(runner,t-eps),right=Replay.visualSample(runner,t+eps);
    assert.ok(Math.abs((right.distance-left.distance)/(2*eps)-Replay.visualSample(runner,t).speed)<.001);
  }
  assert.equal(Replay.sample(runner,71).distance,1400);
  assert.equal(Replay.standings({runners:[runner]},90)[0].distance,1400);
  assert.equal(JSON.stringify(runner),before);
  const dnf={...runner,finished:false};assert.deepEqual(Replay.visualSample(dnf,90),Replay.sample(dnf,90));
});

test('broadcast cameras face the last bend from the straight and cut exactly side-on before the finish',()=>{
  const runners=Array.from({length:12},(_,lane)=>({id:String(lane),lane,time:70,finished:true,
    samples:[[0,0,20,0],[70,1400,20,2]]})),record={distance:1400,replay:{runners},rank:1,finished:true};
  for(const track of Object.values(W.TRACKS)){
    const c=Replay.course(record,track),dir=c.right?-1:1;
    const race=Replay.timeline(record).race,cornerTime=race+(1400-c.finalStraight-100)/20,
      corner=Replay.cameraShot(record,track,cornerTime,'broadcast',null,4.5),
      exit=Replay.position(1400-c.finalStraight,5.5,record,track);
    assert.equal(corner.key,'final-corner');
    assert.ok((corner.position.x-exit.x)*dir>0);
    assert.ok((corner.target.x-corner.position.x)*dir<0);
    const straight=Replay.cameraShot(record,track,race+(1400-c.finalStraight/2)/20,'broadcast',null,4.5);
    assert.equal(straight.key,'home-straight');
    for(const t of [67.5,69.9,70,70.8].map(t=>t+race)){
      const goal=Replay.cameraShot(record,track,t,'broadcast',null,4.5);
      assert.equal(goal.key,'finish');assert.equal(goal.position.x,0);assert.equal(goal.target.x,0);
      assert.ok(goal.position.z>-c.radius);
    }
    assert.equal(Replay.cameraShot(record,track,race+72,'broadcast').key,'runout');
    const manual=Replay.cameraShot(record,track,race+24,'finish');assert.equal(manual.key,'finish');
    for(const mode of ['broadcast','follow','overview','finish'])for(const aspect of [.7,1.5,4.5])for(const time of [0,9,34,67.5,70,74].map(t=>t+race)){
      const shot=Replay.cameraShot(record,track,time,mode,'5',aspect);
      assert.ok([...Object.values(shot.position),...Object.values(shot.target),shot.fov].every(Number.isFinite));
      assert.ok(shot.fov>=7&&shot.fov<=48);
    }
  }
});

test('ceremony tiers grow and only an actual player win receives a podium chapter',()=>{
  const {record:r,bird}=recorded(),record={...r,birdId:bird.id};
  assert.equal(record.rank,1);const t=Replay.timeline(record);
  assert.equal(Replay.phase(record,0),'paddock');assert.equal(Replay.phase(record,t.gate),'gate');
  assert.equal(Replay.phase(record,t.race),'race');assert.equal(Replay.phase(record,t.result),'result');assert.equal(Replay.phase(record,t.award),'award');
  for(const loser of [{...record,rank:2},{...record,finished:false}]){assert.equal(Replay.timeline(loser).award,null);assert.equal(Replay.phase(loser,Replay.timeline(loser).end),'result');}
  let prev=Replay.ceremony('new');for(const level of ['GIII','GII','GI']){const next=Replay.ceremony(level);for(const k of ['cameras','crackers','confetti'])assert.ok(next[k]>prev[k]);prev=next;}
  const cues=Replay.commentary(record);assert.ok(cues.some(c=>c.speaker==='lamia'));assert.ok(cues.some(c=>c.speaker==='sahagin'));
  assert.ok(cues.every((c,i)=>!i||c.at>=cues[i-1].at));assert.ok(cues.some(c=>c.text.includes('ゴールイン')));
  assert.ok(cues.some(c=>c.at===t.award));assert.ok(!Replay.commentary({...record,rank:2}).some(c=>c.text.includes('セレモニー')));
});

test('multiple player entrants in a shared graded race preserve one immutable field',()=>{
  const state=R.initial(),first=R.own(state)[0];state.week=124;state.money=1e9;
  const second=structuredClone(first);second.id=`bird-${state.serial++}`;second.name='もう一羽';state.birds.push(second);
  const event=R.calendar(state.week).find(e=>e.level==='GIII');assert.ok(event);
  // Both birds have already reached open class and meet the stakes age requirement.
  for(const b of [first,second]){b.races=Math.max(b.races,4);b.wins=4;b.birthYear=0;b.lastRace=-100;}
  const field=R.simulateField(state,[first,second,...R.worldRoster(state,event)].slice(0,12),event,true);
  const a=R.race(state,first,event,field),b=R.race(state,second,event,field);
  assert.ok(Replay.valid(a.replay,a));assert.ok(Replay.valid(b.replay,b));assert.deepEqual(a.replay,b.replay);
  assert.equal(a.replay.runners.filter(x=>x.player).length,2);
  const packed=JSON.parse(R.serializeState(state));assert.equal(packed.raceReplays.length,1);
});
