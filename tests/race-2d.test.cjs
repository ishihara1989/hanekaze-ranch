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

test('broadcast starts fixed and freezes with the goal one third from the leading edge',()=>{
  for(const t of [track,{...track,theme:'芝・右回り'}])for(const size of [{width:1200,height:500},{width:390,height:430}]){
    const start=C.broadcastCamera(0,record,t,size);
    assert.equal(start.startLocked,true);assert.equal(start.finishLocked,false);
    assert.deepEqual(C.broadcastCamera(1,record,t,size),start);
    const early=C.broadcastCamera(record.distance-100,record,t,size),atLine=C.broadcastCamera(record.distance,record,t,size),late=C.broadcastCamera(record.distance+100,record,t,size);
    assert.equal(early.finishLocked,false);assert.equal(atLine.finishLocked,true);assert.equal(late.finishLocked,true);
    close(atLine.distance,late.distance);close(atLine.origin.x,late.origin.x);close(atLine.origin.z,late.origin.z);
    const goal=C.project(record.distance,0,record,t,atLine),leader=C.project(record.distance+40,0,record,t,late),rear=C.project(record.distance-20,0,record,t,late);
    close(goal.x,size.width*(t.theme.includes('右回り')?1/3:2/3));
    const runout=C.project(record.distance+3,0,record,t,late);
    assert.ok(runout.x>0&&runout.x<size.width,'a short run-out remains visible');
    assert.ok(goal.x>0&&goal.x<size.width);assert.ok(rear.x>0&&rear.x<size.width);
    assert.ok(t.theme.includes('右回り')?leader.x<0:leader.x>size.width);
    // Rewinding derives the travelling camera again without a stale latch.
    assert.deepEqual(C.broadcastCamera(record.distance-100,record,t,size),early);
  }
});

test('opening holds the gates, follows at the leading third, and rewinds without camera jumps',()=>{
  for(const source of Object.values(W.TRACKS))for(const right of [false,true])for(const pitch of [1,1.5,2])
  for(const size of [{width:1200,height:500},{width:390,height:430}])for(const distance of [1200,2400,3200]){
    const t={...source,theme:right?'右回り':'左回り'},r={distance},viewport={...size,pitch},
      start=C.broadcastCamera(0,r,t,viewport),offset=size.width/(6*start.motionScale),
      threshold=start.distance+offset,epsilon=1e-6;
    for(const lane of [0,5.5,11]){
      const gate=C.project(0,lane,r,t,start),trailing=right?size.width-gate.x:gate.x;
      assert.ok(trailing>0&&trailing<size.width*.2,'gates fit at the trailing side, even on a bend');
    }
    assert.deepEqual(C.broadcastCamera(threshold*.5,r,t,viewport),start);
    const a=C.broadcastCamera(threshold-epsilon,r,t,viewport),b=C.broadcastCamera(threshold+epsilon,r,t,viewport),
      leader=C.project(threshold,5.5,r,t,start),anchor=size.width*(right?1/3:2/3);
    assert.ok(Math.abs(leader.x-anchor)<size.width*.04,'following starts near one third from the leading edge');
    assert.equal(a.startLocked,true);assert.equal(b.startLocked,false);
    for(const [d,lane] of [[0,0],[0,11],[threshold,5.5]]){
      const p=C.project(d,lane,r,t,a),q=C.project(d,lane,r,t,b);
      assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<.001,'fixed and tracking shots share the same boundary position');
    }
    const following=C.broadcastCamera(threshold+10,r,t,viewport);
    assert.equal(following.startLocked,false);assert.equal(following.finishLocked,false);
    assert.deepEqual(C.broadcastCamera(0,r,t,viewport),start);
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

test('opening feet keep the cruising cadence and phase through acceleration, handoff and rewind',()=>{
  const d=distanceAt(100),runner={lane:0,time:12,finished:false,samples:[
    [0,d,0,0,0],[2,d+10,10,1,0],[4,d+36,15,1,0],[6,d+68,17,1,0],
    [8,d+103,17.2,1,0],[10,d+138,17.3,1,0],[12,d+173,17.3,1,0]]},
    before=JSON.stringify(runner),path=C.gaitPath(runner,record,track),
    animation=t=>C.animationTravelled(runner,t,R.visualSample(runner,t),path),
    epsilon=1e-5;
  // The recorded opening accelerates; the feet use the same 17.5m/s cycle
  // as the settled 8–10s cruise interval, with no cadence or phase reset.
  close(C.travelled(runner,1,R.visualSample(runner,1),path),5);
  close(animation(1),17.5);
  for(const time of [0,1,2,4,6,8,9])close(animation(time),17.5*time);
  for(const boundary of [2,4,6,8]){
    close((animation(boundary)-animation(boundary-epsilon))/epsilon,17.5);
    close((animation(boundary+epsilon)-animation(boundary))/epsilon,17.5);
  }
  for(const pitch of [1,1.5,2])for(let i=0;i<8;i++){
    const time=(i+.01)*20/(17.5*8*pitch);
    assert.equal(C.frame(animation(time),pitch),i);
    assert.equal(C.frame(animation(time+8),pitch),C.frame(17.5*(time+8),pitch));
  }
  const later=animation(9);animation(1);close(animation(9),later);
  close(animation(-1),0);close(animation(20),animation(12));
  assert.equal(JSON.stringify(runner),before);
});

test('opening cadence respects outside path length, legacy samples, and finish deceleration',()=>{
  const d=distanceAt(course.straight+100),lane=11,factor=1+(lane+.5)*course.laneWidth/course.radius,
    runner={lane,time:12,finished:false,samples:[
      [0,d,0,0,lane],[4,d+20/factor,10,1,lane],[6,d+45/factor,15,1,lane],
      [8,d+75/factor,15.2,1,lane],[10,d+105/factor,15.2,1,lane],[12,d+135/factor,15.2,1,lane]]},
    path=C.gaitPath(runner,record,track),legacy={...runner,samples:runner.samples.map(s=>s.slice(0,4))},
    oldPath=C.gaitPath(legacy,record,track);
  const at=t=>C.animationTravelled(runner,t,R.visualSample(runner,t),path);
  close(at(1),15);
  for(const time of [0,1,5,8,9,12])close(at(time),C.animationTravelled(legacy,time,R.visualSample(legacy,time),oldPath));
  const finisher={lane:0,time:12,finished:true,samples:[
    [0,0,0,0,0],[4,45,18,1,0],[6,85,20,1,0],[8,125,20,1,0],[10,165,20,1,0],[12,205,20,1,0]]},
    fp=C.gaitPath(finisher,{distance:205},track),phase=t=>C.animationTravelled(finisher,t,R.visualSample(finisher,t),fp),
    eps=1e-5;
  close(phase(12+eps)-phase(12),20*eps);
  close(phase(20),phase(100));
  const steady={lane:0,time:2,finished:false,samples:[[0,0,20,1,0],[2,40,20,1,0]]},
    sp=C.gaitPath(steady,record,track),s=R.visualSample(steady,1);
  close(C.animationTravelled(steady,1,s,sp),C.travelled(steady,1,s,sp));
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
      stop=locked.distance,threshold=stop+size.width/(6*locked.motionScale);
    // Goal/camera coincidence uses the scaled projection on every display.
    close(C.project(record.distance,5.5,record,t,locked).x,size.width*(dir===1?2/3:1/3));
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

test('last-spurt motion follows replay effort, including final traffic, rewinds and the finish',async()=>{
  globalThis.RaceReplay=R;globalThis.Race2DCourse=C;
  const {spriteMotion}=await import('../public/js/race-viewer-2d.js');
  const sprint={distance:2050,speed:20,mode:'スパート',stopped:false,finished:false};
  assert.equal(spriteMotion(sprint,'race',2400),'spurt');
  for(const mode of ['競り合い','羽混み','内へ進路変更','進路確保','前詰まり']){
    assert.equal(spriteMotion({...sprint,mode},'race',2400),'spurt');
    assert.equal(spriteMotion({...sprint,mode,distance:1800},'race',2400),'run');
  }
  for(const mode of ['発走','巡航','余力温存','粘り'])assert.equal(spriteMotion({...sprint,mode},'race',2400),'run');
  assert.equal(spriteMotion(sprint,'paddock',2400),'walk');
  for(const phase of ['gate','result','award'])assert.equal(spriteMotion(sprint,phase,2400),'run');
  assert.equal(spriteMotion({...sprint,stopped:true},'race',2400),'run');
  assert.equal(spriteMotion({...sprint,finished:true},'race',2400),'run');
  const runner={lane:0,time:120,finished:true,samples:[[0,0,20,1],[100,2000,20,2],[120,2400,20,2]]},before=JSON.stringify(runner);
  const motion=time=>spriteMotion(R.visualSample(runner,time),'race',2400);
  assert.equal(motion(110),'spurt');assert.equal(motion(50),'run');assert.equal(motion(110),'spurt');
  assert.equal(motion(121),'run');assert.equal(JSON.stringify(runner),before);
});

test('all three sprite motions provide all color layers and draw matching frames in either direction',async()=>{
  globalThis.RaceReplay=R;globalThis.Race2DCourse=C;
  const {RaceViewer2D}=await import('../public/js/race-viewer-2d.js');
  const fs=require('node:fs'),path=require('node:path'),m=require('../public/assets/chocobo-sprite-study/v5/manifest.json'),spurt=m.motions.spurt;
  assert.equal(spurt.frameCount,8);assert.equal(spurt.cellWidth,m.cellWidth);assert.equal(spurt.cellHeight,m.cellHeight);
  assert.deepEqual(Object.keys(spurt.body),Object.keys(m.body));assert.deepEqual(Object.keys(spurt.crest),Object.keys(m.crest));
  const images=new Map();
  for(const [prefix,manifest] of [['',m],...Object.entries(m.motions).map(([key,value])=>[key+':',value])])for(const kind of ['body','crest'])for(const [key,entry] of Object.entries(manifest[kind])){
    const bytes=fs.readFileSync(path.join(__dirname,'../public/assets/chocobo-sprite-study/v5',entry.file));
    assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),manifest.width);assert.equal(bytes.readUInt32BE(20),manifest.height);
    images.set(prefix+kind+':'+key,entry.file);
  }
  const draws=[],scales=[],ctx=new Proxy({drawImage:(...args)=>draws.push(args),scale:(...args)=>scales.push(args)},{get:(target,key)=>target[key]??(()=>{})}),
    viewer=Object.assign(Object.create(RaceViewer2D.prototype),{manifest:m,images,ctx,plaque(){}});
  for(const color of Object.keys(m.body))for(const crest of Object.keys(m.crest))for(const motion of ['run','spurt','walk'])for(const dir of [-1,1])for(let frame=0;frame<8;frame++){
    draws.length=0;const entry={id:'bird',lane:0,color,crest},active=m.motions[motion]||m;
    viewer.bird(entry,{x:60,y:100},{dir,scale:5},frame,null,false,motion);
    assert.equal(draws.length,2);assert.equal(draws[0][0],active.body[color].file);assert.equal(draws[1][0],active.crest[crest].file);
    assert.deepEqual(draws[0].slice(1),draws[1].slice(1));
    assert.equal(draws[0][1],frame%4*448);assert.equal(draws[0][2],Math.floor(frame/4)*448);
    assert.deepEqual(scales.at(-1),[dir,1]);
  }
});
