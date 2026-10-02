'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../public/js/race-physics.js');
const F=require('../public/js/ranch-race.js');
const C=require('../public/js/race-course.js');
const p=P.parameters(),traits=Object.fromEntries(['grit','drive','wisdom','control','crowd','fight'].map(k=>[k,100]));
function entry(id,lane,distance=0,speed=0){
  return {id,name:id,lane,p,traits,cruise:p.criticalSpeed,ground:{traction:1},
    state:{...P.createState(p),distance,speed,lateral:lane}};
}
const event={distance:2000},course=C.course(event);

test('an unobstructed outer gate reaches the rail before the first bend, with bounded lateral speed',()=>{
  const outer=F.simulate([entry('outer',11)],event,{trace:true})[0];
  const beforeCorner=outer.samples.find(s=>s.distance>0&&s.lateral===0);
  assert.ok(beforeCorner.distance>230&&beforeCorner.distance<260);
  assert.ok(outer.interactions.laneChanges>=11);assert.ok(outer.interactions.distanceLoss>0);
  for(let i=1;i<outer.samples.length;i++){
    const a=outer.samples[i-1],b=outer.samples[i];
    assert.ok(Math.abs(b.lateral-a.lateral)<=(b.time-a.time)*F.LATERAL_RATE+1e-9);
  }
});

test('outer bends consume extra physical metres and boundary crossings use the correct radius',()=>{
  const atCorner=260,metres=50;
  assert.ok(C.advance(atCorner,metres,0,event.distance,course)>C.advance(atCorner,metres,11,event.distance,course));
  const factor=1+.5*course.laneWidth/course.radius;
  assert.ok(Math.abs(C.advance(250,30,0,event.distance,course)-(260+20/factor))<1e-8);
  for(const theme of ['左回り','右回り'])assert.equal(C.advance(atCorner,metres,3,event.distance,C.course(event,{theme})),C.advance(atCorner,metres,3,event.distance,course));
});

test('a faster bird prepares an outside passing route before the final corner',()=>{
  const entries=[entry('me',0,1100,22),entry('slow',1,1130,16)];
  entries[1].state.lateral=0;
  entries[1].p=P.parameters({criticalSpeed:14,maxSpeed:16});entries[1].cruise=14;
  const plan=F.routing(0,entries,entries.map(e=>e.state),event,course,23,.2);
  assert.equal(plan.finalApproach,true);assert.ok(plan.target>0);assert.ok(plan.lateral>0);
  const [me,slow]=F.simulate(entries,event,{trace:true});
  assert.ok(me.samples.some(s=>s.lateral>=F.LATERAL_CLEARANCE));
  assert.ok(me.time<slow.time);
});

test('occupied escape routes cause waiting instead of cutting through neighbours',()=>{
  const entries=[entry('me',0,1500,22),entry('front',1,1506,16),entry('side',2,1500,22)];
  entries[1].state.lateral=0;entries[2].state.lateral=1;
  const plan=F.routing(0,entries,entries.map(e=>e.state),event,course,23,.2);
  assert.equal(plan.lateral,0);assert.equal(plan.blocked,true);assert.ok(plan.limit<23);
  const runs=F.simulate(entries,event,{trace:true,maxTime:3,dt:.1});
  assert.ok(runs[0].interactions.blockedSeconds>0);
  assert.ok(runs[0].state.distance<runs[1].state.distance);
});

test('routing is independent of processing order with explicit gates and stays inside the course',()=>{
  const entries=Array.from({length:12},(_,i)=>entry(String(i),i,0,0)),original=JSON.stringify(entries);
  const a=F.simulate(entries,event,{trace:true}),b=F.simulate(entries.toReversed(),event,{trace:true}).reverse();
  assert.deepEqual(a,b);assert.equal(JSON.stringify(entries),original);
  assert.ok(a.every(r=>r.finished&&r.samples.every(s=>s.lateral>=0&&s.lateral<=11)));
  assert.throws(()=>F.simulate([entry('a',0),entry('b',0)],event),/Duplicate/);
});

test('a converging field never overlaps or swaps through another bird at any shared simulation step',()=>{
  const entries=Array.from({length:12},(_,i)=>entry(String(i),i,0,0));
  const runs=F.simulate(entries,event,{trace:true,dt:.1,sampleEvery:.1,maxTime:35});
  for(let step=0;step<runs[0].samples.length;step++)for(let i=0;i<runs.length;i++)for(let j=i+1;j<runs.length;j++){
    const a=runs[i].samples[step],b=runs[j].samples[step];
    const separation=((a.distance-b.distance)/F.CLEARANCE)**2+((a.lateral-b.lateral)/F.LATERAL_CLEARANCE)**2;
    assert.ok(separation>=1-1e-8,`overlap at ${a.time}: ${i}, ${j}`);
  }
});
