'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Physics=require('../public/js/race-physics.js'),Simulation=require('../public/js/ranch-race.js');
const Replay=require('../public/js/race-replay.js'),Projection=require('../public/js/race-2d-course.js');
const track=require('../public/js/world.js').TRACKS.tenku;
const p=Physics.parameters(),traits=Object.fromEntries(['grit','drive','wisdom','control','crowd','fight'].map(key=>[key,100]));
const entries=[{id:'outer',name:'ソトワク',lane:11,p,traits,cruise:p.criticalSpeed,ground:{traction:1},state:{...Physics.createState(p),lateral:11}}];
const event={distance:2000,surface:'turf',trackId:track.id};
const runs=Simulation.simulate(entries,event,{trace:true,track}).map(run=>({...run,color:'yellow',crest:'blue',player:true}));
const record={...event,birdId:'outer',name:'独立した試走',rank:1,level:'open',time:runs[0].time,finished:true,
  field:runs.map(({id,name,time,finished})=>({id,name,time,finished})),replay:Replay.capture(runs,event)};
const nearRail=runs[0].samples.find(s=>s.distance>0&&s.lateral===0);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('headless simulation records inward routing once; replay frames preserve it across viewport, speed and rewind',()=>{
  assert.equal(typeof document,'undefined');assert.ok(nearRail);assert.ok(Replay.valid(record.replay,record));
  const before=JSON.stringify({entries,record}),clock=Replay.timeline(record),start=Replay.frame(record,track,clock.race),
    inward=Replay.frame(record,track,clock.race+nearRail.time);
  assert.equal(start.runners[0].state.lateral,11);close(inward.runners[0].state.lateral,0);
  for(const direction of [track,{...track,theme:'右回り'}])for(const width of [390,1200])for(const pitch of [1,2]){
    const current=Replay.frame(record,direction,clock.race+nearRail.time),{state,position}=current.runners[0],
      view=Projection.camera(state.distance,record,direction,{width,height:360,pitch}),
      projected=Projection.projectPosition(position,state.distance,record,direction,view),
      originalGate=Projection.project(state.distance,11,record,direction,view);
    assert.ok(projected.y<originalGate.y-30,'recorded inner movement is visible on both sizes and directions');
    close(position.x,Replay.position(state.distance,state.lateral,record,direction).x);
    close(position.z,Replay.position(state.distance,state.lateral,record,direction).z);
    assert.deepEqual(Replay.frame(record,direction,current.time),current);
  }
  for(const rate of [.5,1,2,4]){
    // Sampling the same race clock does not depend on how quickly the UI gets there.
    const elapsed=nearRail.time/rate;
    close(Replay.frame(record,track,clock.race+elapsed*rate).runners[0].state.lateral,0);
  }
  Replay.frame(record,track,clock.end);assert.deepEqual(Replay.frame(record,track,clock.race),start);
  assert.equal(JSON.stringify({entries,record}),before);
});

test('official finish and visible run-out stay separate and legacy records never invent routing',()=>{
  const clock=Replay.timeline(record),finish=Replay.frame(record,track,clock.race+record.time),
    later=Replay.frame(record,track,clock.race+record.time+1);
  assert.equal(finish.order[0].distance,record.distance);assert.equal(later.order[0].distance,record.distance);
  assert.ok(later.runners[0].state.distance>finish.runners[0].state.distance);
  assert.equal(later.runners[0].state.lateral,finish.runners[0].state.lateral);
  const legacy=structuredClone(record);legacy.replay.version=1;legacy.replay.runners.forEach(r=>r.samples=r.samples.map(s=>s.slice(0,4)));
  assert.ok(Replay.valid(legacy.replay,legacy));assert.equal(Replay.frame(legacy,track,clock.race+nearRail.time).runners[0].state.lateral,11);
});

test('2D rendering projects the shared frame and cannot rerun or replace the recorded path',async()=>{
  globalThis.RaceReplay=Replay;globalThis.Race2DCourse=Projection;
  const {RaceViewer2D}=await import('../public/js/race-viewer-2d.js');
  const oldWindow=globalThis.window;globalThis.window={devicePixelRatio:1};
  try{
    const rendered=[],element={textContent:''},clock=Replay.timeline(record),
      viewer=Object.assign(Object.create(RaceViewer2D.prototype),{ready:true,disposed:false,record,replay:record.replay,track,timeline:clock,
        time:clock.race+nearRail.time,motionPitch:2,cameraMode:'follow',focusId:'outer',theme:{dirt:false,key:'temple'},course:Replay.course(record,track),
        stage:{getBoundingClientRect:()=>({width:390,height:360}),dataset:{}},canvas:{width:390,height:360},ctx:{setTransform(){}},
        paths:new Map([['outer',Projection.gaitPath(record.replay.runners[0],record,track)]]),root:{querySelectorAll:()=>[]},$:()=>element,
        backdrop(){},trackSurface(){},rail(){},gates(){},edges(){},minimap(){},updateOverlay(){},bird(entry,p){rendered.push(p);}});
    const original=Simulation.simulate,before=JSON.stringify(record);Simulation.simulate=()=>{throw Error('A renderer cannot simulate a race');};
    try{viewer.draw();const frame=Replay.frame(record,track,viewer.time),runner=frame.runners[0];
      assert.deepEqual(rendered[0],Projection.projectPosition(runner.position,runner.state.distance,record,track,viewer.currentView));
      viewer.time=clock.race;viewer.draw();assert.equal(rendered.length,2);assert.equal(JSON.stringify(record),before);
    }finally{Simulation.simulate=original;}
  }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
