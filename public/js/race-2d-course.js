/* Outside-track orthographic projection of recorded metre positions. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('./race-replay.js')):factory(root.RaceReplay);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.Race2DCourse=api;
})(globalThis,function(R){
  'use strict';
  const GAIT=Object.freeze({metresPerCycle:20,frames:8,stepsPerCycle:2});
  const SCENERY=Object.freeze({postSpacing:5});
  const SECTIONS=Object.freeze({straight:'直線',entry:'直線 → カーブ',curve:'カーブ',exit:'カーブ → 直線'});
  const mod=(v,n)=>((v%n)+n)%n;
  function section(distance,record,track){
    const c=R.course(record,track),p=mod(distance-record.distance+c.finalStraight,c.lap),bend=Math.PI*c.radius,
      entries=[c.straight,2*c.straight+bend],exits=[0,c.straight+bend],transition=50;
    const near=boundaries=>boundaries.some(b=>Math.abs(mod(p-b+c.lap/2,c.lap)-c.lap/2)<transition);
    if(near(entries))return 'entry';
    if(near(exits))return 'exit';
    return p>c.straight&&p<c.straight+bend||p>2*c.straight+bend?'curve':'straight';
  }
  function camera(distance,record,track,{width=1000,height=500,span=58,pitch=1}={}){
    const c=R.course(record,track),p=R.position(distance,5.5,record,track),dir=c.right?-1:1,
      tangent={x:Math.sin(p.heading),z:Math.cos(p.heading)},
      outward={x:Math.cos(p.heading)*dir,z:-Math.sin(p.heading)*dir},
      scale=Math.min(width/span,height/16),gain=motionPitch(pitch),
      // Keep actual lateral movement legible when the viewport limits bird size.
      depth=Math.max(.19,Math.min(.34,height*.3/(c.width*scale)));
    return {distance,origin:p,tangent,outward,dir,width,height,
      scale,pitch:gain,motionScale:scale*gain,depth,curveDepth:.65,cx:width/2,cy:height*.73};
  }
  function project(distance,lateral,record,track,view){
    return projectPosition(R.position(distance,lateral,record,track),distance,record,track,view);
  }
  function projectPosition(p,distance,record,track,view){
    const centre=R.position(distance,5.5,record,track),dx=p.x-view.origin.x,dz=p.z-view.origin.z,
      along=dx*view.tangent.x+dz*view.tangent.z,depth=dx*view.outward.x+dz*view.outward.z,
      centreDepth=(centre.x-view.origin.x)*view.outward.x+(centre.z-view.origin.z)*view.outward.z;
    // Compress the 50m lane depth, while keeping the bend legible in side view.
    // Every runner and fixed track object uses the same longitudinal scale.
    // Relative speed is independent of whether the camera follows or stops.
    return {x:view.cx+view.dir*along*view.motionScale,y:view.cy+(centreDepth*view.curveDepth+(depth-centreDepth)*view.depth)*view.scale,
      depth,heading:p.heading,corner:p.corner};
  }
  function broadcastCamera(leaderDistance,record,track,viewport={}){
    const framing=camera(0,record,track,viewport),
      // Gates sit 15% from the trailing edge. The leader and finish line
      // sit one third from the leading edge, leaving a visible run-out.
      leadOffset=framing.width/(6*framing.motionScale),
      startAt=framing.width*.35/framing.motionScale,
      stopAt=record.distance-leadOffset,following=leaderDistance-leadOffset;
    const view=camera(Math.min(Math.max(startAt,following),stopAt),record,track,viewport);
    view.startLocked=following<=startAt;
    view.finishLocked=following>=stopAt;
    return view;
  }
  // Physical metres include the longer outside arc and lateral movement.
  // This makes one left/right step cycle cover 20m on every lane of a bend.
  function gaitPath(runner,record,track){
    const c=R.course(record,track),bend=Math.PI*c.radius;
    const arc=d=>{const p=d-record.distance+c.finalStraight,laps=Math.floor(p/c.lap),u=mod(p,c.lap);
      return laps*2*bend+Math.max(0,Math.min(bend,u-c.straight))+Math.max(0,u-2*c.straight-bend);};
    const distances=[0];
    for(let i=1;i<runner.samples.length;i++){
      const a=runner.samples[i-1],b=runner.samples[i],lateral=((a[4]??runner.lane)+(b[4]??runner.lane))/2,
        forward=b[1]-a[1]+(arc(b[1])-arc(a[1]))*(lateral+.5)*c.laneWidth/c.radius,
        sideways=((b[4]??runner.lane)-(a[4]??runner.lane))*c.laneWidth;
      distances.push(distances[i-1]+Math.hypot(forward,sideways));
    }
    // Use the first settled cruising interval as the opening animation tempo.
    // The physical path stays intact for positioning and dust. Only the feet
    // receive a phase offset, so the handoff cannot reset or jump the gait.
    let opening=null;
    if(runner.samples[0][2]===0&&runner.samples.length>2){
      let end=1;
      for(let i=1;i<runner.samples.length-1&&runner.samples[i][0]<=12;i++){
        end=i;
        const a=runner.samples[i-1],b=runner.samples[i];
        if(a[0]>=4&&b[2]>0&&Math.abs(b[2]-a[2])/(b[0]-a[0])<=.25)break;
      }
      const at=runner.samples[end][0],next=runner.samples[end+1][0],
        speed=(distances[end+1]-distances[end])/(next-at);
      if(speed>0)opening={time:at,speed,offset:at*speed-distances[end]};
    }
    return {distances,arc,course:c,opening};
  }
  function travelled(runner,time,state,path){
    let lo=0,hi=runner.samples.length-1;
    while(lo<hi){const m=(lo+hi)>>1;if(runner.samples[m][0]<time)lo=m+1;else hi=m;}
    const i=lo,a=runner.samples[Math.max(0,i-1)],b=runner.samples[i],
      f=b[0]===a[0]?0:Math.max(0,Math.min(1,(time-a[0])/(b[0]-a[0])));
    let d=path.distances[Math.max(0,i-1)]+(path.distances[i]-path.distances[Math.max(0,i-1)])*f;
    if(time>runner.time&&state.finished){const last=runner.samples.at(-1),c=path.course;
      d+=state.distance-last[1]+(path.arc(state.distance)-path.arc(last[1]))*(state.lateral+.5)*c.laneWidth/c.radius;}
    return d;
  }
  function animationTravelled(runner,time,state,path){
    const opening=path.opening;
    if(!opening)return travelled(runner,time,state,path);
    if(time<=opening.time)return Math.max(0,time)*opening.speed;
    return travelled(runner,time,state,path)+opening.offset;
  }
  const motionPitch=value=>Number.isFinite(Number(value))?Math.max(1,Math.min(2,Number(value))):2;
  const sceneryDistance=(distance,pitch=1)=>distance*motionPitch(pitch);
  function sceneryPattern(distance,reach,spacing,pitch){
    // Repeat spacing is in display metres; points remain fixed on the course.
    // No camera-dependent offset may slide the ground under gates or the goal.
    const physicalSpacing=spacing/motionPitch(pitch??1);
    return {spacing:physicalSpacing,first:Math.floor((distance-reach)/physicalSpacing),last:Math.ceil((distance+reach)/physicalSpacing)};
  }
  const frame=(metres,pitch=1)=>Math.floor(mod(sceneryDistance(metres,pitch),GAIT.metresPerCycle)/GAIT.metresPerCycle*GAIT.frames);
  function sectionDistance(key,record,track){
    // First occurrence after the gates; works for partial and multiple laps.
    for(let d=0;d<record.distance;d+=2)if(section(d,record,track)===key)return d;
    return null;
  }
  function timeAtDistance(runner,distance){
    const i=runner.samples.findIndex(s=>s[1]>=distance);
    if(i<0)return null;if(!i)return runner.samples[0][0];
    const a=runner.samples[i-1],b=runner.samples[i];
    return a[0]+(b[0]-a[0])*(distance-a[1])/(b[1]-a[1]);
  }
  return {GAIT,SCENERY,SECTIONS,section,camera,broadcastCamera,project,projectPosition,gaitPath,travelled,animationTravelled,frame,motionPitch,sceneryDistance,sceneryPattern,sectionDistance,timeAtDistance};
});
