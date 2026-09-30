/* Shared-clock field simulation. Personality changes effort, not physical limits. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('./race-physics.js')):factory(root.RacePhysics);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RanchRace=api;
})(globalThis,function(Physics){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const TRAITS=['grit','drive','wisdom','control','crowd','fight'];
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
      const separation=Math.abs(gap);
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
  function decision(runner,context,distance){
    const {state,p,traits,cruise}=runner,u=k=>(traits[k]-50)/100;
    const remaining=distance-state.distance;
    const burden=clamp(.6*state.fatigue+.4*(1-state.reserve/p.reserveCapacity),0,1);
    const avoidance=clamp(.18+.08*u('wisdom')-.08*u('drive')-.10*u('grit'),0,.3);
    const pace=1+.025*u('drive')*(1-u('control'));
    let target=remaining<=400?p.maxSpeed:cruise*pace;
    target*=1-avoidance*burden*.15;
    // Grit both follows the rider under fatigue and commits more of the reserve.
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
    return {target:clamp(target,0,p.maxSpeed),effortCost,crowding:context.crowding,
      duel:context.duel,saving,mode:saving>.05?'余力温存':context.crowding>.1?'羽混み':
        context.duel>.1?'競り合い':lowReserve?'粘り':remaining<=400?'スパート':'巡航'};
  }
  const interpolate=(a,b,f)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+(b[k]-a[k])*f]));
  function simulate(entries,event,{trace=false,dt=.2,maxTime=900}={}){
    if(!Array.isArray(entries)||!entries.length||new Set(entries.map(x=>x.id)).size!==entries.length||
        !Number.isFinite(event.distance)||event.distance<100||event.distance>10000||
        !Number.isFinite(dt)||dt<.025||dt>.5||!Number.isFinite(maxTime)||maxTime<=0||maxTime>900)
      throw new RangeError('Invalid field simulation');
    const runners=entries.map(entry=>{
      const p=Physics.parameters(entry.p),traits={...entry.traits};
      if(!TRAITS.every(k=>Number.isFinite(traits[k])&&traits[k]>=50&&traits[k]<=150))throw new RangeError('Invalid personality');
      return {...entry,p,traits,state:{...entry.state},samples:trace?[{...entry.state,mode:'発走'}]:[],nextSample:2,
        interactions:{crowdedSeconds:0,duelSeconds:0,savingSeconds:0,extraEnergy:0}};
    });
    for(let time=0;time<maxTime;){
      // Every decision observes the same immutable snapshot, regardless of entry order.
      const states=runners.map(r=>r.state),stepTime=Math.min(dt,maxTime-time);
      let active=false;
      for(let i=0;i<runners.length;i++){
        const r=runners[i],before=states[i];
        if(before.distance>=event.distance)continue;
        active=true;
        const action=decision(r,surroundings(i,states,event.distance),event.distance);
        const slope=event.hill>.35?Physics.courseSlope('hills',before.distance)*.32:0;
        let after=Physics.step(before,r.p,stepTime,action.target,slope,r.ground.traction,action.effortCost);
        if(after.distance>=event.distance){
          after=interpolate(before,after,(event.distance-before.distance)/(after.distance-before.distance));
          after.distance=event.distance;
        }
        r.state=after;
        const elapsed=after.time-before.time;
        if(action.crowding>.1)r.interactions.crowdedSeconds+=elapsed;
        if(action.duel>.1)r.interactions.duelSeconds+=elapsed;
        if(action.saving>.05)r.interactions.savingSeconds+=elapsed;
        r.interactions.extraEnergy+=(after.energyUsed-before.energyUsed)*(1-1/action.effortCost);
        if(trace&&(after.time>=r.nextSample||after.distance>=event.distance)){
          r.samples.push({...after,mode:action.mode});r.nextSample+=2;
        }
      }
      if(!active)break;
      time+=stepTime;
    }
    return runners.map(r=>{
      if(trace&&r.samples.at(-1).time!==r.state.time)r.samples.push({...r.state,mode:r.samples.at(-1).mode});
      return {id:r.id,name:r.name,time:r.state.time,finished:r.state.distance>=event.distance,
        state:r.state,parameters:r.parameters??r.p,ground:r.ground,samples:r.samples,interactions:r.interactions};
    });
  }
  return {surroundings,decision,simulate};
});
