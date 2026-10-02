'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../public/js/race-replay.js'),C=require('../public/js/race-2d-course.js'),W=require('../public/js/world.js');
const track=W.TRACKS.tenku,record={distance:2400,replay:{hill:.2}},course=R.course(record,track);
const distanceAt=progress=>record.distance-course.finalStraight+progress;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('outside views keep forward and inward positions, mirroring right-handed courses',()=>{
  const left=track,right={...track,theme:'芝・右回り'},d=distanceAt(200);
  const a=C.camera(d,record,left),b=C.camera(d,record,right);
  for(const delta of [-12,0,12])for(const lane of [0,3.25,11]){
    const p=C.project(d+delta,lane,record,left,a),q=C.project(d+delta,lane,record,right,b);
    close(p.x-a.cx,delta*a.scale);close(q.x-b.cx,-delta*b.scale);close(p.y,q.y);
    close(p.y-a.cy,(lane-5.5)*course.laneWidth*a.depth*a.scale);
  }
  assert.ok(C.project(d,11,record,left,a).y>C.project(d,0,record,left,a).y);
});

test('four sections follow physical boundaries and are available in the temple trial',()=>{
  const bend=Math.PI*course.radius;
  for(const [p,key] of [[200,'straight'],[course.straight-20,'entry'],[course.straight+20,'entry'],
    [course.straight+bend/2,'curve'],[course.straight+bend-20,'exit'],[course.straight+bend+20,'exit']]){
    assert.equal(C.section(distanceAt(p),record,track),key);
    assert.equal(C.section(distanceAt(p)+course.lap,record,track),key);
  }
  for(const key of Object.keys(C.SECTIONS)){
    const d=C.sectionDistance(key,record,track);assert.notEqual(d,null);assert.equal(C.section(d,record,track),key);
  }
});

test('broadcast freezes when the goal enters view and lets the leaders run off-screen',()=>{
  for(const t of [track,{...track,theme:'芝・右回り'}])for(const size of [{width:1200,height:500},{width:390,height:430}]){
    const start=C.broadcastCamera(0,record,t,size),gates=C.camera(0,record,t,size);
    close(start.origin.x,gates.origin.x);close(start.origin.z,gates.origin.z);
    const early=C.broadcastCamera(record.distance-100,record,t,size),atLine=C.broadcastCamera(record.distance,record,t,size),late=C.broadcastCamera(record.distance+100,record,t,size);
    assert.equal(early.finishLocked,false);assert.equal(atLine.finishLocked,true);assert.equal(late.finishLocked,true);
    close(atLine.distance,late.distance);close(atLine.origin.x,late.origin.x);close(atLine.origin.z,late.origin.z);
    const goal=C.project(record.distance,0,record,t,atLine),leader=C.project(record.distance+40,0,record,t,late),rear=C.project(record.distance-20,0,record,t,late);
    assert.ok(goal.x>0&&goal.x<size.width);assert.ok(rear.x>0&&rear.x<size.width);
    assert.ok(t.theme.includes('右回り')?leader.x<0:leader.x>size.width);
    // Rewinding derives the travelling camera again without a stale latch.
    assert.deepEqual(C.broadcastCamera(record.distance-100,record,t,size),early);
  }
});

test('projected position stays continuous at every straight/corner and lap boundary',()=>{
  for(const t of Object.values(W.TRACKS)){
    const c=R.course(record,t),bend=Math.PI*c.radius;
    for(const p of [0,c.straight,c.straight+bend,2*c.straight+bend,c.lap])for(const lane of [0,5.5,11]){
      const d=record.distance-c.finalStraight+p,view=C.camera(d,record,t),a=C.project(d-1e-5,lane,record,t,view),b=C.project(d+1e-5,lane,record,t,view);
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.002);
      assert.ok([a.x,a.y,b.x,b.y].every(Number.isFinite));
    }
  }
});

test('20 physical metres play all eight frames once, including fractional replay times',()=>{
  const d=distanceAt(100),runner={lane:0,time:2,finished:false,samples:[[0,d,20,1,0],[2,d+40,20,1,0]]},path=C.gaitPath(runner,record,track);
  for(let i=0;i<8;i++){
    const time=i/8,state=R.visualSample(runner,time),metres=C.travelled(runner,time,state,path);
    close(metres,i*2.5);assert.equal(C.frame(metres),i);
  }
  assert.equal(C.frame(20),0);assert.equal(C.GAIT.stepsPerCycle,2);
  close(C.travelled(runner,1,R.visualSample(runner,1),path),20);
});

test('visual pitch accelerates all eight frames without changing the physical replay or finish camera',()=>{
  assert.equal(C.motionPitch(undefined),2);assert.equal(C.motionPitch(NaN),2);
  assert.equal(C.motionPitch(.5),1);assert.equal(C.motionPitch(3),2);
  const d=distanceAt(100),runner={lane:0,time:2,finished:false,samples:[[0,d,20,1,0],[2,d+40,20,1,0]]},
    path=C.gaitPath(runner,record,track),before=JSON.stringify(runner);
  for(const pitch of [1,1.5,2]){
    for(let i=0;i<8;i++){
      const time=(i+.01)/(8*pitch),state=R.visualSample(runner,time),metres=C.travelled(runner,time,state,path);
      assert.equal(C.frame(metres,pitch),i);close(metres,20*time);
      const view=C.camera(state.distance,record,track),p=C.project(state.distance,0,record,track,view);
      close(p.x,view.cx); // Pitch has no effect on the shared physical position.
    }
    close(C.sceneryDistance(100,pitch)-C.sceneryDistance(80,pitch),20*pitch);
    const a=C.broadcastCamera(record.distance,record,track),b=C.broadcastCamera(record.distance+50,record,track);
    close(C.sceneryDistance(a.distance,pitch),C.sceneryDistance(b.distance,pitch));
  }
  assert.equal(JSON.stringify(runner),before);
});

test('ground and five-metre fence posts travel four intervals in one eight-frame cycle',()=>{
  assert.equal(C.SCENERY.postSpacing,5);
  for(const t of [track,{...track,theme:'芝・右回り'}])for(const pitch of [1,1.5,2]){
    const start=distanceAt(200),forward=C.GAIT.metresPerCycle/pitch,
      a=C.camera(start,record,t,{pitch}),b=C.camera(start+forward,record,t,{pitch}),
      pa=C.sceneryPattern(start,60,5,pitch),pb=C.sceneryPattern(start+forward,60,5,pitch),
      index=Math.round(start/pa.spacing),
      p=C.project(index*pa.spacing,5.5,record,t,a),q=C.project(index*pb.spacing,5.5,record,t,b);
    close(Math.abs(q.x-p.x)/a.scale,C.GAIT.metresPerCycle);
    close(Math.abs(q.x-p.x)/(5*a.scale),4);
    // The same post and grain remain at constant course coordinates.
    close(pa.spacing,pb.spacing);close(pa.spacing,5/pitch);
    close(C.sceneryPattern(start,60,2,pitch).spacing,C.sceneryPattern(start+forward,60,2,pitch).spacing);
    const finish=C.broadcastCamera(record.distance,record,t),late=C.broadcastCamera(record.distance+70,record,t);
    assert.deepEqual(C.sceneryPattern(finish.distance,60,5,pitch),C.sceneryPattern(late.distance,60,5,pitch));
  }
});

test('gate and finish move with the posts, with unchanged relative runner speed when the camera locks',()=>{
  const before=JSON.stringify(record);
  for(const t of Object.values(W.TRACKS))for(const pitch of [1,1.5,2])for(const size of [{width:1200,height:500},{width:390,height:430}]){
    const viewport={...size,pitch},dir=t.theme.includes('右回り')?-1:1,
      a=C.broadcastCamera(record.distance-35,record,t,viewport),locked=C.broadcastCamera(record.distance,record,t,viewport),
      stop=locked.distance,threshold=stop+8/pitch;
    // Goal/camera coincidence uses the scaled projection on every display.
    close(C.project(record.distance,5.5,record,t,locked).x,locked.cx+dir*(size.width/2-3*locked.scale));
    const goal=record.distance,post=Math.floor(goal/(5/pitch))*(5/pitch),
      delta=(distance,v1,v2)=>C.project(distance,5.5,record,t,v2).x-C.project(distance,5.5,record,t,v1).x;
    close(delta(goal,a,locked),delta(post,a,locked));
    // Compare the constant-speed runner against one actual fixed post before,
    // across and after the lock, then across the finish line itself.
    for(const d of [threshold-.5,threshold,threshold+.5,record.distance-.5,record.distance+.5]){
      const dt=.01,speed=20,v1=C.broadcastCamera(d,record,t,viewport),v2=C.broadcastCamera(d+speed*dt,record,t,viewport),
        relative=(runnerDistance,view)=>C.project(runnerDistance,5.5,record,t,view).x-C.project(post,5.5,record,t,view).x;
      close((relative(d+speed*dt,v2)-relative(d,v1))/dt,dir*speed*locked.motionScale);
    }
    const rewound=C.broadcastCamera(threshold-.5,record,t,viewport);assert.equal(rewound.finishLocked,false);
    assert.equal(C.broadcastCamera(threshold+.5,record,t,viewport).finishLocked,true);
  }
  assert.equal(JSON.stringify(record),before);
});

test('the renderer keeps actual gate anchors, ground features and goal on fixed course coordinates',async()=>{
  globalThis.RaceReplay=R;globalThis.Race2DCourse=C;
  const {RaceViewer2D}=await import('../public/js/race-viewer-2d.js');
  const ctx=new Proxy({measureText:()=>({width:20})},{get:(target,key)=>target[key]??(()=>{})});
  for(const t of [track,W.TRACKS.oukyu])for(const pitch of [1,2]){
    const viewer=Object.assign(Object.create(RaceViewer2D.prototype),{ctx,record,track:t,motionPitch:pitch,course:R.course(record,t),theme:{dirt:false,flag:'#fff'},replay:{runners:[{lane:0}]} });
    let points=[];viewer.point=(distance,lane,view)=>{const p=C.project(distance,lane,record,t,view);points.push({distance,lane,p});return p;};
    const frames=[];
    for(const distance of [0,1]){
      points=[];const view=C.camera(distance,record,t,{pitch});
      viewer.gates(view,'race',1,false);viewer.gates(view,'race',1,true);
      const gate=points.find(p=>p.distance===0&&p.lane===0);assert.ok(gate);
      const posts=C.sceneryPattern(distance,20,5,pitch),post=C.project(0*posts.spacing,0,record,t,view);
      close(gate.p.x,post.x);close(gate.p.y,post.y);frames.push(points.map(p=>[p.distance,p.lane]));
    }
    assert.deepEqual(frames[0],frames[1]); // Camera movement cannot translate any gate anchor.
    for(const distance of [record.distance-24,record.distance-23]){
      points=[];const view=C.camera(distance,record,t,{pitch});viewer.trackSurface(view);
      const goal=points.find(p=>p.distance===record.distance&&p.lane===-.5);assert.ok(goal);
      const post=C.project(record.distance,-.5,record,t,view);
      close(goal.p.x,post.x);close(goal.p.y,post.y);
    }
  }
});

test('all six venues have complete generated backdrop assets and distinct surface themes',async()=>{
  const {themeFor,BACKGROUNDS}=await import('../public/js/race-2d-graphics.js');
  const keys=[];
  for(const id of ['oukyu','sunahama','haikou']){
    const theme=themeFor(W.TRACKS[id],'dirt');assert.equal(theme.dirt,true);
    assert.equal(theme.soil.length,6);keys.push(theme.key);
  }
  assert.deepEqual(keys,['city','coast','mine']);
  assert.equal(themeFor(W.TRACKS.tenku,'turf').key,'temple');
  assert.equal(themeFor(W.TRACKS.mitsurin,'turf').key,'jungle');
  assert.equal(themeFor(W.TRACKS.iseki,'turf').key,'ruins');
  const fs=require('node:fs'),path=require('node:path'),manifest=require('../public/assets/race-2d-backgrounds/manifest-v1.json');
  assert.deepEqual(Object.keys(BACKGROUNDS),Object.keys(W.TRACKS));
  for(const entry of manifest.venues){
    assert.equal(BACKGROUNDS[entry.id],`/assets/race-2d-backgrounds/${entry.file}`);
    const png=fs.readFileSync(path.join(__dirname,'../public',BACKGROUNDS[entry.id]));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),entry.width);assert.equal(png.readUInt32BE(20),entry.height);
    assert.equal(png.length,entry.bytes);assert.ok(entry.width>=entry.height*1.9);
  }
  assert.equal(manifest.venues.length,6);
});

test('the gait pays the longer outside arc and sideways distance, and freezes after run-out',()=>{
  const d=distanceAt(course.straight+100),lane=11,factor=1+(lane+.5)*course.laneWidth/course.radius,
    runner={lane,time:1,finished:false,samples:[[0,d,20,1,lane],[1,d+20/factor,20,1,lane]]};
  const path=C.gaitPath(runner,record,track);close(path.distances[1],20);
  const lateral={lane:0,time:1,finished:false,samples:[[0,0,0,1,0],[1,0,0,1,1]]};
  close(C.gaitPath(lateral,record,track).distances[1],course.laneWidth);
  const finisher={lane:0,time:120,finished:true,samples:[[0,0,20,1,0],[120,2400,20,1,0]]},fp=C.gaitPath(finisher,record,track),before=JSON.stringify(finisher);
  close(C.travelled(finisher,130,R.visualSample(finisher,130),fp),C.travelled(finisher,200,R.visualSample(finisher,200),fp));
  assert.equal(JSON.stringify(finisher),before);
});

test('section seeking interpolates recorded times and does not invent missing race sections',()=>{
  const r={samples:[[0,0],[10,150],[20,300]]};
  assert.equal(C.timeAtDistance(r,75),5);assert.equal(C.timeAtDistance(r,300),20);assert.equal(C.timeAtDistance(r,400),null);
  const short={distance:100};assert.equal(C.sectionDistance('curve',short,track),null);
});
