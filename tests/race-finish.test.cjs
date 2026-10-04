'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Replay=require('../public/js/race-replay.js');

function recording(times=[50,52,54,56,60,150,200]){
  const runners=times.map((time,lane)=>({id:String(lane),name:`チョコボ${lane}`,lane,time,finished:true,
    samples:[[0,0,1200/time,0,lane],[time,1200,1200/time,0,lane]]}));
  return {distance:1200,name:'試走',birdId:'5',rank:6,time:times[5],finished:true,level:'open',
    field:runners.map(({id,name,time,finished})=>({id,name,time,finished})),
    replay:{distance:1200,runners:runners.slice().reverse()}};
}

test('playback cuts three seconds after fifth place and reveals the full result without waiting for slower runners',()=>{
  const record=recording(),tail=record.replay.runners.find(r=>r.id==='6');
  tail.samples.splice(1,0,[63,900,6,0,tail.lane]);
  const before=JSON.stringify(record),clock=Replay.timeline(record);
  assert.equal(clock.raceEnd,63);assert.equal(clock.fullRaceEnd,200);
  assert.equal(clock.result,clock.race+63);assert.equal(clock.end,clock.result+8);
  assert.equal(Replay.frame(record,{},clock.race+60).order.filter(r=>r.finished).length,5);
  const beforeCut=Replay.frame(record,{},clock.result-.01),result=Replay.frame(record,{},clock.result);
  assert.equal(beforeCut.phase,'race');assert.equal(beforeCut.order[5].id,'6');
  assert.equal(result.phase,'result');assert.equal(result.raceTime,200);
  assert.deepEqual(result.order.map(r=>r.id),record.field.map(r=>r.id));
  assert.ok(result.order.every(r=>r.finished));
  assert.equal(Replay.frame(record,{},clock.result+1).raceTime,201);
  assert.deepEqual(Replay.frame(record,{},clock.result-.01),beforeCut);
  assert.equal(JSON.stringify(record),before);
  const win={...record,rank:1,birdId:'0',time:50},winClock=Replay.timeline(win);
  assert.equal(winClock.award,winClock.result+8);
  assert.equal(Replay.phase(win,winClock.award),'award');
  assert.ok(Replay.commentary(win).some(c=>c.at===winClock.result&&c.text.includes('着順が確定')));
});

test('short fields, close finishes and nonfinishers have finite timelines and keep their recorded results',()=>{
  for(const times of [[50],[50,52,54,56],[50,52,54,56,60],[50,52,54,56,60,61]]){
    const record=recording(times),clock=Replay.timeline(record);
    assert.equal(clock.raceEnd,times.at(-1));
    assert.ok(Object.values(clock).every(v=>v===null||Number.isFinite(v)));
  }
  const partial=recording();partial.replay.runners.filter(r=>Number(r.id)>=4).forEach(r=>{
    r.finished=false;r.samples.at(-1)[1]=700;
  });
  const clock=Replay.timeline(partial);assert.equal(clock.raceEnd,59);
  assert.equal(Replay.frame(partial,{},clock.result).order.filter(r=>r.finished).length,4);
  partial.replay.runners.forEach(r=>r.finished=false);
  assert.equal(Replay.timeline(partial).raceEnd,200);
});

test('finish margins use interpolated distance at the preceding finish, including ties and legacy samples',()=>{
  const record=recording(),replay=record.replay,second=replay.runners.find(r=>r.id==='1'),third=replay.runners.find(r=>r.id==='2');
  second.samples.splice(1,0,[48,1000,25,0,1]);
  third.samples.splice(1,0,[50,1100,25,0,2]);
  const before=JSON.stringify(record);
  assert.equal(Replay.finishGap(replay,'0'),null);
  assert.equal(Replay.finishGap(replay,'1'),100);
  assert.equal(Replay.finishGap(replay,'2'),50);
  assert.equal(Replay.finishGap(replay,'missing'),null);
  assert.equal(JSON.stringify(record),before);
  replay.runners.forEach(r=>r.samples=r.samples.map(s=>s.slice(0,4)));
  assert.equal(Replay.finishGap(replay,'2'),50);
  second.time=50;second.samples=[[0,0,24,0],[50,1200,24,0]];
  assert.equal(Replay.finishGap(replay,'1'),0);
  third.finished=false;assert.equal(Replay.finishGap(replay,'2'),null);
});
