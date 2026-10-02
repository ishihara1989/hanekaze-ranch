/* Outside-track orthographic projection of the same metre positions as 3D. */
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
    const pitch=motionPitch(viewport.pitch??1),following=camera(Math.max(0,leaderDistance-8/pitch),record,track,viewport),
      // Leave room for the goal sign as the line enters the leading edge.
      stopAt=record.distance-following.width/(2*following.motionScale)+3/pitch;
    const view=camera(Math.min(following.distance,stopAt),record,track,viewport);
    view.finishLocked=following.distance>=stopAt;
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
    return {distances,arc,course:c};
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
  return {GAIT,SCENERY,SECTIONS,section,camera,broadcastCamera,project,projectPosition,gaitPath,travelled,frame,motionPitch,sceneryDistance,sceneryPattern,sectionDistance,timeAtDistance};
});
