/* Shared-clock field simulation. Personality changes effort, not physical limits. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('./race-physics.js'),require('./race-course.js')):factory(root.RacePhysics,root.RaceCourse);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RanchRace=api;
})(globalThis,function(Physics,Course){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const TRAITS=['grit','drive','wisdom','control','crowd','fight'];
  const CLEARANCE=4,LATERAL_CLEARANCE=.8,LATERAL_RATE=.7;
  function courseEffect(runner,distance,c){
    const section=Course.section(runner.state.distance,distance,c),aptitude=runner.aptitude||{};
    if(section.corner){
      const fit=aptitude[c.right?'rightTurn':'leftTurn']??.5,
        severity=clamp(160/(c.radius+((runner.state.lateral??runner.lane??0)+.5)*c.laneWidth),.65,1.35);
      // Even a specialist slows on bends. A tighter bend demands more control.
      return {speedFactor:1-(.10-.08*fit)*severity,forceFactor:1,effortCost:1+.04*(1-fit)};
    }
    const fit=2*((aptitude.straight??.5)-.5),
      // Only a bend actually traversed after the gate grants the exit bonus.
      exit=runner.state.distance-section.fromCorner>1e-8?clamp(1-section.fromCorner/60,0,1):0;
    return {speedFactor:1+.02*fit,forceFactor:1+.04*fit*exit,effortCost:1};
  }
  function surroundings(index,states,distance){
    const me=states[index];
    const proximity=[];
    let duel=0,nearestBehind=Infinity,pursuerSpeed=0,ahead=false,opponents=0;
    for(let i=0;i<states.length;i++){
      if(i===index)continue;
      const other=states[i],gap=other.distance-me.distance;
      // A finisher still rules out a winning lead, but no longer crowds the field.
      if(gap>=0)ahead=true;
      if(other.distance>=distance)continue;
      opponents++;
      const separation=Math.hypot(gap,Number.isFinite(me.lateral)&&Number.isFinite(other.lateral)?
        (other.lateral-me.lateral)*Course.METRES.trackWidth/Course.METRES.lanes:0);
      proximity.push(Math.max(0,1-separation/12));
      duel=Math.max(duel,Math.max(0,1-separation/6));
      if(gap<0){
        nearestBehind=Math.min(nearestBehind,-gap);
        // The fastest chaser may not be the nearest one.
        pursuerSpeed=Math.max(pursuerSpeed,other.speed);
      }
    }
    // Gate lanes aren't a pack. Blend interactions in over the first 40 metres.
    const active=clamp(me.distance/40,0,1);
    const density=proximity.sort((a,b)=>a-b).reduce((sum,x)=>sum+x,0);
    return {crowding:clamp((density-1)/3,0,1)*active,duel:duel*active,
      leading:!ahead&&opponents>0,lead:nearestBehind,pursuerSpeed};
  }
  function decision(runner,context,distance,effect={speedFactor:1,effortCost:1}){
    const {state,p,traits,cruise}=runner,u=k=>(traits[k]-50)/100;
    const remaining=distance-state.distance;
    const burden=clamp(.6*state.fatigue+.4*(1-state.reserve/p.reserveCapacity),0,1);
    const avoidance=clamp(.18+.08*u('wisdom')-.08*u('drive')-.10*u('grit'),0,.3);
    const pace=1+.025*u('drive')*(1-u('control'));
    let target=remaining<=400?p.maxSpeed:cruise*pace;
    target*=1-avoidance*burden*.15;
    // Grit sustains the bird's own effort under fatigue and commits more reserve.
    const reserveFloor=.12-.10*u('grit');
    const lowReserve=state.reserve<p.reserveCapacity*reserveFloor;
    if(lowReserve)target=Math.min(target,cruise);
    const fighting=context.duel*u('fight')*(1-.65*u('control'));
    const resolve=context.duel*u('grit')*burden;
    target*=1+.045*fighting+.025*resolve;
    target*=1-.075*context.crowding*(1-u('crowd'));
    // Wisdom avoids wasted motion; control prevents an expensive early duel.
    const effortCost=1+(.10*context.crowding*(1-u('crowd'))+.07*fighting)*(1-.8*u('wisdom'));
    let saving=0;
    if(context.leading&&context.lead>12&&state.distance>200){
      const horizon=Math.max(1,remaining/Math.max(state.speed,1));
      const safeSpeed=Math.max(cruise*.85,context.pursuerSpeed+(12-context.lead)/horizon);
      saving=safeSpeed<target?u('wisdom')*clamp((context.lead-12)/24,0,1):0;
      target-=Math.max(0,target-safeSpeed)*saving;
    }
    return {target:clamp(target,0,p.maxSpeed)*effect.speedFactor,effortCost:effortCost*effect.effortCost,crowding:context.crowding,
      duel:context.duel,saving,mode:saving>.05?'余力温存':context.crowding>.1?'羽混み':
        context.duel>.1?'競り合い':lowReserve?'粘り':remaining<=400?'スパート':'巡航'};
  }
  const interpolate=(a,b,f)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+(b[k]-a[k])*f]));
  // Swept clearance prevents two simultaneous lane changes from crossing each other.
  function conflicts(a,b,nextA,nextB){
    const dx=(a.distance-b.distance)/CLEARANCE,dy=(a.lateral-b.lateral)/LATERAL_CLEARANCE,
      vx=(nextA.distance-nextB.distance)/CLEARANCE-dx,vy=(nextA.lateral-nextB.lateral)/LATERAL_CLEARANCE-dy,
      t=clamp(-(dx*vx+dy*vy)/(vx*vx+vy*vy||1),0,1);
    return (dx+vx*t)**2+(dy+vy*t)**2<1-1e-9;
  }
  function routing(index,runners,states,event,c,target,dt){
    const r=runners[index],me=states[index],section=Course.section(me.distance,event.distance,c),
      finalStraight=me.distance>=event.distance-c.finalStraight,
      wisdom=(r.traits.wisdom-50)/100,horizon=section.finalApproach?5+4*wisdom:3+2*wisdom,
      speed=Math.max(me.speed,Math.min(target,me.speed+2)),
      forward=(v,lane)=>v/(section.corner?1+(lane+.5)*c.laneWidth/c.radius:1),
      mySpeed=forward(speed,me.lateral),others=states.filter((s,i)=>i!==index&&s.distance<event.distance);
    let best={score:Infinity,lateral:me.lateral,target:me.lateral};
    for(const lane of [me.lateral,...Array.from({length:Course.METRES.lanes},(_,i)=>i)]){
      const lateral=clamp(lane,me.lateral-LATERAL_RATE*dt,me.lateral+LATERAL_RATE*dt),
        previewTime=Math.min(1,Math.abs(lane-me.lateral)/LATERAL_RATE),
        preview={distance:me.distance+mySpeed*previewTime,
          lateral:clamp(lane,me.lateral-LATERAL_RATE*previewTime,me.lateral+LATERAL_RATE*previewTime)};
      if(lane!==me.lateral&&others.some(s=>conflicts(me,s,preview,
        {distance:s.distance+forward(s.speed,s.lateral)*previewTime,lateral:s.lateral})))continue;
      // Near a bend, the saved arc length dominates a small cost for changing lanes.
      const cornerTime=finalStraight?0:section.corner?horizon:Math.max(0,horizon-section.toCorner/Math.max(speed,1)),
        pathLoss=cornerTime*speed*(lane+.5)*c.laneWidth/c.radius,
        arrival=Math.abs(lane-me.lateral)/LATERAL_RATE;
      // On the home straight, stop shifting as soon as the current corridor is clear.
      let score=.16*Math.abs(lane-me.lateral);
      if(!finalStraight)score+=.35*lane+pathLoss+(lane===r.routeTarget?0:.05);
      for(const s of others){
        const gap=s.distance-me.distance;
        if(gap<=0||Math.abs(s.lateral-lane)>=LATERAL_CLEARANCE)continue;
        const closing=forward(speed,lane)-forward(s.speed,s.lateral),
          delay=Math.max(0,closing*horizon-gap+CLEARANCE);
        score+=delay*(section.finalApproach?3:1.5);
        // Prepare an exit before the last bend: avoid sitting behind slower traffic
        // when neither neighbouring corridor will be available at catch-up time.
        if(section.finalApproach&&closing>0&&gap/closing<horizon+arrival){
          const catchTime=Math.min(horizon,gap/closing),escape=[lane-1,lane+1].some(exit=>
            exit>=0&&exit<Course.METRES.lanes&&!others.some(o=>Math.abs(o.lateral-exit)<LATERAL_CLEARANCE&&
              Math.abs(o.distance-me.distance+(forward(o.speed,o.lateral)-forward(speed,lane))*catchTime)<CLEARANCE*2));
          if(!escape)score+=16;
        }
      }
      if(score<best.score-1e-9)best={score,lateral,target:lane};
    }
    let limit=target,blocked=false;
    for(const s of others){
      const gap=s.distance-me.distance;
      if(gap<=0||Math.abs(s.lateral-best.lateral)>=LATERAL_CLEARANCE)continue;
      const factor=section.corner?1+(best.lateral+.5)*c.laneWidth/c.radius:1,
        safe=(forward(s.speed,s.lateral)+Math.max(0,gap-CLEARANCE)/1.5)*factor;
      if(safe<limit){limit=safe;blocked=true;}
    }
    return {...best,limit,blocked,finalApproach:section.finalApproach};
  }
  function simulate(entries,event,{trace=false,dt=.2,maxTime=900,track={},sampleEvery=2}={}){
    if(!Array.isArray(entries)||!entries.length||new Set(entries.map(x=>x.id)).size!==entries.length||
        !Number.isFinite(event.distance)||event.distance<100||event.distance>10000||
        !Number.isFinite(dt)||dt<.025||dt>.5||!Number.isFinite(maxTime)||maxTime<=0||maxTime>900||
        !Number.isFinite(sampleEvery)||sampleEvery<dt||sampleEvery>10)
      throw new RangeError('Invalid field simulation');
    const c=Course.course(event,track),gateOrder=entries.map(e=>e.id).sort(),
      runners=entries.map(entry=>{
      const p=Physics.parameters(entry.p),traits={...entry.traits};
      if(!TRAITS.every(k=>Number.isFinite(traits[k])&&traits[k]>=50&&traits[k]<=150))throw new RangeError('Invalid personality');
      const aptitude={rightTurn:.5,leftTurn:.5,straight:.5,...entry.aptitude};
      if(!['rightTurn','leftTurn','straight'].every(k=>Number.isFinite(aptitude[k])&&aptitude[k]>=(k==='straight'?.5:0)&&aptitude[k]<=1))
        throw new RangeError('Invalid course aptitude');
      const lane=entry.lane??gateOrder.indexOf(entry.id),lateral=entry.state.lateral??lane;
      if(!Number.isInteger(lane)||lane<0||lane>=Course.METRES.lanes||!Number.isFinite(lateral)||lateral<0||lateral>Course.METRES.lanes-1)
        throw new RangeError('Invalid race lane');
      const state={...entry.state,lateral,travelled:entry.state.travelled??0};
      return {...entry,lane,p,traits,aptitude,state,routeTarget:lateral,lateralVelocity:0,samples:trace?[{...state,mode:'発走'}]:[],nextSample:sampleEvery,
        interactions:{crowdedSeconds:0,duelSeconds:0,savingSeconds:0,extraEnergy:0,blockedSeconds:0,laneChanges:0,distanceLoss:0}};
    });
    if(new Set(runners.map(r=>r.lane)).size!==runners.length)throw new RangeError('Duplicate race lanes');
    for(let time=0;time<maxTime;){
      // Every decision observes the same immutable snapshot, regardless of entry order.
      const states=runners.map(r=>r.state),stepTime=Math.min(dt,maxTime-time);
      const actions=[],routes=[],proposed=[];
      let active=false;
      for(let i=0;i<runners.length;i++){
        const r=runners[i],before=states[i];
        if(before.distance>=event.distance)continue;
        active=true;
        const effect=courseEffect(r,event.distance,c),
          action=actions[i]=decision(r,surroundings(i,states,event.distance),event.distance,effect),
          route=routes[i]=routing(i,runners,states,event,c,action.target,stepTime);
        const slope=event.hill>.35?Physics.courseSlope('hills',before.distance)*.32:0;
        // Section targets brake gradually; changing sections cannot snap velocity.
        const sectionParameters={...r.p,maxSpeed:Math.max(r.p.maxSpeed*Math.max(1,effect.speedFactor),before.speed-4*stepTime),
          maxForce:r.p.maxForce*effect.forceFactor};
        const after=Physics.step(before,sectionParameters,stepTime,route.limit,slope,r.ground.traction,action.effortCost),
          metres=after.distance-before.distance,
          sideways=(route.lateral-before.lateral)*c.laneWidth;
        after.lateral=before.lateral+Math.sign(sideways)*Math.min(Math.abs(sideways),metres)/c.laneWidth;
        after.travelled=before.travelled+metres;
        after.distance=Course.advance(before.distance,Math.sqrt(Math.max(0,metres**2-((after.lateral-before.lateral)*c.laneWidth)**2)),
          (before.lateral+after.lateral)/2,event.distance,c);
        proposed[i]=after;
      }
      if(!active)break;
      // Cancel conflicting lateral moves together; all plans used the same snapshot.
      const cancelled=new Set();
      for(let i=0;i<runners.length;i++)for(let j=i+1;j<runners.length;j++){
        if(!proposed[i]||!proposed[j])continue;
        if(conflicts(states[i],states[j],proposed[i],proposed[j])){cancelled.add(i);cancelled.add(j);}
      }
      for(const i of cancelled){
        const after=proposed[i],before=states[i];after.lateral=before.lateral;
        after.distance=Course.advance(before.distance,after.travelled-before.travelled,before.lateral,event.distance,c);
      }
      // Keep a following bird behind traffic if braking alone cannot clear a gap.
      const frontOrder=runners.map((_,i)=>i).sort((i,j)=>states[j].distance-states[i].distance||
        runners[i].lane-runners[j].lane);
      for(let n=0;n<frontOrder.length;n++){
        const i=frontOrder[n],after=proposed[i];if(!after)continue;
        for(let m=0;m<n;m++){
          const j=frontOrder[m],front=proposed[j];
          if(!front||front.distance>=event.distance||states[j].distance<=states[i].distance||
            Math.abs(after.lateral-front.lateral)>=LATERAL_CLEARANCE)continue;
          if(after.distance>front.distance-CLEARANCE){
            after.distance=Math.max(states[i].distance,front.distance-CLEARANCE);
            after.speed=Math.min(after.speed,front.speed);routes[i].blocked=true;
          }
        }
      }
      for(let i=0;i<runners.length;i++){
        if(!proposed[i])continue;
        const r=runners[i],before=states[i],action=actions[i],route=routes[i];
        let after=proposed[i];
        if(after.distance>=event.distance){
          after=interpolate(before,after,(event.distance-before.distance)/(after.distance-before.distance));
          after.distance=event.distance;
        }
        r.state=after;
        r.routeTarget=route.target;
        const elapsed=after.time-before.time;
        if(action.crowding>.1)r.interactions.crowdedSeconds+=elapsed;
        if(action.duel>.1)r.interactions.duelSeconds+=elapsed;
        if(action.saving>.05)r.interactions.savingSeconds+=elapsed;
        r.interactions.extraEnergy+=(after.energyUsed-before.energyUsed)*(1-1/action.effortCost);
        r.interactions.blockedSeconds+=route.blocked?elapsed:0;
        r.interactions.laneChanges+=Math.abs(after.lateral-before.lateral);
        r.interactions.distanceLoss+=Math.max(0,(after.travelled-before.travelled)-(after.distance-before.distance));
        if(route.blocked)action.mode='前詰まり';
        else if(Math.abs(after.lateral-before.lateral)>.001)action.mode=route.finalApproach||after.lateral>before.lateral?'進路確保':'内へ進路変更';
        const lateralVelocity=(after.lateral-before.lateral)/elapsed,
          turn=Math.abs(lateralVelocity-r.lateralVelocity)>.01;
        if(trace&&turn&&before.time>r.samples.at(-1).time)r.samples.push({...before,mode:action.mode});
        if(trace&&(turn||after.time>=r.nextSample||after.distance>=event.distance)){
          r.samples.push({...after,mode:action.mode});
          if(after.time>=r.nextSample)r.nextSample+=sampleEvery;
        }
        r.lateralVelocity=lateralVelocity;
      }
      time+=stepTime;
    }
    return runners.map(r=>{
      if(trace&&r.samples.at(-1).time!==r.state.time)r.samples.push({...r.state,mode:r.samples.at(-1).mode});
      return {id:r.id,name:r.name,lane:r.lane,time:r.state.time,finished:r.state.distance>=event.distance,
        ...(r.paddock?{paddock:r.paddock}:{}),
        state:r.state,parameters:r.parameters??r.p,ground:r.ground,samples:r.samples,interactions:r.interactions};
    });
  }
  return {CLEARANCE,LATERAL_CLEARANCE,LATERAL_RATE,courseEffect,surroundings,decision,routing,simulate};
});
