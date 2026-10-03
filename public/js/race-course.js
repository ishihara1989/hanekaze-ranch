/* Shared metre-scale geometry for racing decisions and replay rendering. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceCourse=api;
})(globalThis,function(){
  'use strict';
  const METRES=Object.freeze({birdHeight:2.5,trackWidth:50,lanes:12,runoutSeconds:8});
  function course(record,track={}){
    const lap=track.lap||1800,straight=track.straight||400;
    return {lap,straight,radius:(lap-2*straight)/(2*Math.PI),scale:1,
      width:METRES.trackWidth,laneWidth:METRES.trackWidth/METRES.lanes,
      finishOffset:straight*.35,finalStraight:straight*.85,
      right:track.theme?.includes('右回り')||false,hill:record.replay?.hill||0};
  }
  function section(distance,raceDistance,c){
    const progress=((distance-raceDistance+c.finalStraight)%c.lap+c.lap)%c.lap,
      bend=Math.PI*c.radius,boundaries=[c.straight,c.straight+bend,2*c.straight+bend,c.lap],
      index=boundaries.findIndex(end=>progress<end),end=boundaries[index];
    return {progress,corner:index===1||index===3,toBoundary:end-progress,
      fromCorner:index===0?progress:index===2?progress-c.straight-bend:null,
      toCorner:index===1||index===3?0:end-progress,
      finalApproach:raceDistance-distance<=c.finalStraight+bend+100};
  }
  // Spend physical metres on each straight/bend separately, including boundaries.
  function advance(distance,metres,lateral,raceDistance,c){
    let next=distance,left=metres;
    while(left>1e-9){
      const s=section(next,raceDistance,c),factor=s.corner?1+(lateral+.5)*c.laneWidth/c.radius:1,
        progress=Math.min(left/factor,s.toBoundary);
      next+=progress;left-=progress*factor;
      if(progress<1e-9){next+=1e-8;left=Math.max(0,left-1e-8*factor);}
    }
    return next;
  }
  return {METRES,course,section,advance};
});
