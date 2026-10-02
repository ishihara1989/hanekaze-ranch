/* Official race samples, metre-scale staging and broadcast camera planning. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('./race-course.js')):factory(root.RaceCourse);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceReplay=api;
})(globalThis,function(Course){
  'use strict';
  const MODES=['発走','巡航','スパート','競り合い','羽混み','粘り','余力温存','内へ進路変更','進路確保','前詰まり'];
  const COLORS=['yellow','golden','red','blue','green','rose','white','black','purple','gray'];
  const METRES=Course.METRES;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function capture(runs,event){
    return {version:2,distance:event.distance,hill:event.hill||0,runners:runs.map((r,i)=>({
      id:r.id,name:r.name,color:r.color||'yellow',crest:r.crest||r.color||'yellow',
      lane:r.lane??i,player:!!r.player,time:r.time,finished:r.finished,
      samples:r.samples.map(s=>[s.time,s.distance,s.speed,MODES.indexOf(s.mode),s.lateral??r.lane??i]),
    }))};
  }
  function valid(replay,record){
    const finite=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
    if(!replay||![1,2].includes(replay.version)||replay.distance!==record.distance||!finite(replay.hill,0,1)||
      !Array.isArray(replay.runners)||replay.runners.length!==record.field.length||
      replay.runners.length<1||replay.runners.length>12)return false;
    const ids=new Set(),lanes=new Set();
    const runnersValid=replay.runners.every(r=>{
      const result=record.field.find(x=>x.id===r?.id);
      if(!r||!result||ids.has(r.id)||lanes.has(r.lane)||typeof r.name!=='string'||r.name!==result.name||
        !COLORS.includes(r.color)||![...COLORS,'rainbow'].includes(r.crest)||
        !Number.isInteger(r.lane)||r.lane<0||r.lane>=12||typeof r.player!=='boolean'||
        typeof r.finished!=='boolean'||r.finished!==result.finished||r.time!==result.time||
        !finite(r.time,0,900)||!Array.isArray(r.samples)||r.samples.length<2||r.samples.length>(replay.version===2?36002:452))return false;
      ids.add(r.id);lanes.add(r.lane);
      if(!r.samples.every((s,i)=>Array.isArray(s)&&s.length===(replay.version===2?5:4)&&finite(s[0],0,r.time)&&
        finite(s[1],0,replay.distance)&&finite(s[2],0,60)&&Number.isInteger(s[3])&&s[3]>=0&&s[3]<MODES.length&&
        (replay.version===1||finite(s[4],0,METRES.lanes-1))&&
        (!i||s[0]>r.samples[i-1][0]&&s[1]>=r.samples[i-1][1])))return false;
      const first=r.samples[0],last=r.samples.at(-1);
      return first[0]===0&&first[1]===0&&(replay.version===1||first[4]===r.lane)&&last[0]===r.time&&(!r.finished||last[1]===replay.distance);
    });
    if(!runnersValid)return false;
    const ordered=standings(replay,900);
    return record.field.every((runner,i)=>runner.id===ordered[i].id)&&
      Number.isInteger(record.rank)&&record.time===record.field[record.rank-1]?.time&&
      record.finished===record.field[record.rank-1]?.finished;
  }
  function sample(runner,time){
    const samples=runner.samples,t=clamp(time,0,runner.time);
    let lo=0,hi=samples.length-1;
    while(lo<hi){const m=(lo+hi)>>1;if(samples[m][0]<t)lo=m+1;else hi=m;}
    const b=samples[lo],a=samples[Math.max(0,lo-1)],f=b[0]===a[0]?0:(t-a[0])/(b[0]-a[0]);
    return {distance:a[1]+(b[1]-a[1])*f,speed:a[2]+(b[2]-a[2])*f,
      lateral:(a[4]??runner.lane??0)+((b[4]??runner.lane??0)-(a[4]??runner.lane??0))*f,
      mode:MODES[a[3]],finished:runner.finished&&time>=runner.time,stopped:time>=runner.time};
  }
  function standings(replay,time){
    return replay.runners.map(r=>({...r,...sample(r,time)})).sort((a,b)=>
      Number(b.finished)-Number(a.finished)||(a.finished?a.time-b.time:b.distance-a.distance)||a.lane-b.lane);
  }
  // The result stays at the official finish. Only the visible bird runs on.
  // Two seconds at finishing speed, then six seconds of smooth deceleration.
  function visualSample(runner,time){
    const s=sample(runner,time);
    if(!s.finished)return s;
    const age=clamp(time-runner.time,0,METRES.runoutSeconds),v=runner.samples.at(-1)[2],
      cruise=2,deceleration=METRES.runoutSeconds-cruise,x=clamp((age-cruise)/deceleration,0,1);
    return {...s,distance:s.distance+v*(Math.min(age,cruise)+deceleration*(x-x**3+.5*x**4)),
      speed:v*(1-3*x*x+2*x**3),stopped:age>=METRES.runoutSeconds};
  }
  function ceremony(level){
    const tier={GIII:1,GII:2,GI:3}[level]||0;
    return {tier,cameras:[0,2,4,7][tier],crackers:[0,2,4,8][tier],confetti:[0,90,210,420][tier],
      title:['勝利の記念撮影','GⅢ 優勝セレモニー','GⅡ 優勝セレモニー','GⅠ 栄光の表彰式'][tier]};
  }
  function timeline(record){
    const raceEnd=Math.max(...record.replay.runners.map(r=>r.time));
    const awarded=record.rank===1&&record.finished!==false;
    return {paddock:0,gate:10,race:16,result:16+raceEnd,award:awarded?24+raceEnd:null,
      end:24+raceEnd+(awarded?16:0),raceEnd};
  }
  function phase(record,time){
    const t=timeline(record);
    return time<t.gate?'paddock':time<t.race?'gate':time<t.result?'race':
      t.award!==null&&time>=t.award?'award':'result';
  }
  const course=Course.course;
  // Distances are metres along the inner reference line; lateral offsets do
  // not stretch the straights. The finish is 85% along the home straight.
  // Lateral position is continuous; physical path length is paid by the simulation.
  function position(distance,lane,record,track={}){
    const c=course(record,track),radius=c.radius+(lane+.5)*c.laneWidth,straight=c.straight;
    let u=((distance-record.distance+c.finalStraight)%c.lap+c.lap)%c.lap;
    let x,z,dx,dz,corner=false;
    if(u<straight){x=-straight/2+u;z=-radius;dx=1;dz=0;}
    else if((u-=straight)<Math.PI*c.radius){const a=-Math.PI/2+u/c.radius;
      x=straight/2+Math.cos(a)*radius;z=Math.sin(a)*radius;dx=-Math.sin(a);dz=Math.cos(a);corner=true;
    }else if((u-=Math.PI*c.radius)<straight){x=straight/2-u;z=radius;dx=-1;dz=0;}
    else{const a=Math.PI/2+(u-straight)/c.radius;
      x=-straight/2+Math.cos(a)*radius;z=Math.sin(a)*radius;dx=-Math.sin(a);dz=Math.cos(a);corner=true;
    }
    x-=c.finishOffset;
    if(c.right){x=-x;dx=-dx;}
    return {x,z,y:0,heading:Math.atan2(dx,dz),corner};
  }
  function cameraShot(record,track,time,mode='broadcast',focusId=null,aspect=1){
    const c=course(record,track),clock=timeline(record),raceTime=Math.max(0,time-clock.race),
      order=standings(record.replay,raceTime),leader=order[0],focus=order.find(r=>r.id===focusId)||leader,
      state=visualSample(mode==='follow'?focus:leader,raceTime),
      subject=mode==='follow'?focus:leader,p=position(state.distance,state.lateral,record,track),
      dir=c.right?-1:1,centreX=-dir*c.finishOffset,centreZ=-c.radius-c.width/2;
    const shot=(key,label,eye,target,height=24)=>{
      const distance=Math.hypot(eye.x-target.x,eye.y-target.y,eye.z-target.z);
      const fov=clamp(2*Math.atan(Math.max(height,70/Math.max(.5,aspect))/(2*distance))*180/Math.PI,7,48);
      return {key,label,position:eye,target,fov};
    };
    const finish=()=>shot('finish','ゴール・真横',
      {x:0,y:10,z:-c.radius+90},{x:0,y:4,z:centreZ},24);
    if(mode==='overview'){
      const span=Math.max(2*(c.radius+c.width)+50,(c.straight+2*(c.radius+c.width)+50)/Math.max(.5,aspect));
      return {key:'overview',label:'コース全景',position:{x:centreX,y:span/2/Math.tan(Math.PI/8)*1.18,z:span*.05},
        target:{x:centreX,y:0,z:0},fov:45};
    }
    if(mode==='finish')return finish();
    const target={x:p.x,y:4,z:p.z};
    const followSide=c.right?1:-1;
    if(mode==='follow')return shot('follow','注目羽を追走',
      {x:p.x+followSide*Math.cos(p.heading)*55-Math.sin(p.heading)*18,y:9,
        z:p.z-followSide*Math.sin(p.heading)*55-Math.cos(p.heading)*18},target,18);
    const firstFinish=Math.min(...record.replay.runners.filter(r=>r.finished).map(r=>r.time)),
      lastFinish=Math.max(...record.replay.runners.filter(r=>r.finished).map(r=>r.time)),
      remaining=record.distance-leader.distance;
    // Cut early enough that the camera is settled exactly side-on at the line.
    if(raceTime>=firstFinish-2.5&&raceTime<=lastFinish+1)return finish();
    if(raceTime>lastFinish+1&&Number.isFinite(lastFinish)){
      const positions=order.map(r=>{const s=visualSample(r,raceTime);return position(s.distance,s.lateral,record,track);});
      target.x=positions.reduce((sum,q)=>sum+q.x,0)/positions.length;
      target.z=positions.reduce((sum,q)=>sum+q.z,0)/positions.length;
      return shot('runout','入線後の走り',{x:0,y:10,z:-c.radius+90},target,34);
    }
    // Frame the leading group rather than cutting off the inner or outer lanes.
    const pack=order.slice(0,6).filter(r=>leader.distance-r.distance<=60),
      points=pack.map(r=>position(r.distance,r.lateral,record,track));
    target.x=points.reduce((sum,q)=>sum+q.x,0)/points.length;
    target.z=points.reduce((sum,q)=>sum+q.z,0)/points.length;
    if(remaining>c.finalStraight&&remaining<=c.finalStraight+Math.min(180,Math.PI*c.radius)){
      // A camera planted on the home straight pans back towards the last bend.
      return shot('final-corner','最終コーナー・直線側',
        {x:dir*(-c.finalStraight+95),y:6,z:centreZ},target,32);
    }
    if(remaining<=c.finalStraight)return shot('home-straight','最後の直線',
      {x:-dir*c.finalStraight*.42,y:18,z:-c.radius+130},target,28);
    // Eight fixed trackside camera stations; pan and zoom, then cut stations.
    const progress=((leader.distance-record.distance+c.finalStraight)%c.lap+c.lap)%c.lap,
      sector=Math.floor(progress/(c.lap/8)),anchor=(sector+.5)*c.lap/8,
      rail=position(record.distance-c.finalStraight+anchor,11.5,record,track),
      outward={x:Math.cos(rail.heading)*(c.right?-1:1),z:-Math.sin(rail.heading)*(c.right?-1:1)};
    return shot(`trackside-${sector}`,rail.corner?'コーナー中継':'向正面中継',
      {x:rail.x+outward.x*80,y:32,z:rail.z+outward.z*80},target,26);
  }
  function commentary(record){
    const t=timeline(record),replay=record.replay,own=replay.runners.find(r=>r.id===record.birdId)||replay.runners.find(r=>r.player),
      cues=[],add=(at,speaker,text)=>cues.push({at,speaker,text});
    const number=r=>`${r.lane+1}番 ${r.name}`;
    add(0,'lamia',`${record.name}。パドックからお届けします！ ${replay.runners.length}羽が登場です。`);
    add(4,'sahagin',`${record.distance}メートル、${record.surface==='dirt'?'ダート':'芝'}の競走です。${own?`${own.name}の走りにも注目しましょう。`:''}`);
    add(t.gate,'lamia','各羽、ゲートに入りました。まもなく発走です！');
    add(t.race,'lamia','ゲートが開いた！ 全羽、いっせいにスタート！');
    let previous='',lastCall=-20,spurt=false;
    const firstFinish=Math.min(...replay.runners.filter(r=>r.finished).map(r=>r.time));
    for(let sec=6;sec<t.raceEnd;sec+=4){
      const order=standings(replay,sec),leader=order[0],remaining=record.distance-leader.distance;
      if(leader.finished)continue;
      if(remaining<=400&&!spurt){spurt=true;lastCall=sec;
        add(t.race+sec,'lamia',`残り${Math.ceil(remaining/100)*100}メートル！ ${number(leader)}が先頭！ 最後の勝負です！`);
      }else if(leader.id!==previous&&sec-lastCall>=8){lastCall=sec;
        add(t.race+sec,'lamia',`${number(leader)}が先頭に立ちました！ ${order[1]?`${order[1].name}が追いかける！`:''}`);
      }else if(sec-lastCall>=14){lastCall=sec;
        if(order[1]&&leader.distance-order[1].distance<3)add(t.race+sec,'lamia',`${leader.name}と${order[1].name}、並んで競り合う！`);
        else add(t.race+sec,'sahagin',`${own?`${own.name}は現在${order.findIndex(r=>r.id===own.id)+1}番手。`:''}${remaining>400?'まだ距離があります。ここは余力を残したいところです。':'翼を広げてスパート。最後まで脚を使えるかが鍵です。'}`);
      }
      previous=leader.id;
    }
    const winner=replay.runners.find(r=>r.id===record.field[0].id);
    if(Number.isFinite(firstFinish))add(t.race+firstFinish,'lamia',`${winner.name}、いま先頭でゴールイン！`);
    add(t.result,'lamia',`着順が確定しました。${own?`${own.name}は${record.rank}着です。`:'全羽の結果をご覧ください。'}`);
    add(t.result+3,'sahagin',record.rank===1?'見事な走りでした。育ててきた力を発揮しましたね。':'この経験を、次の調教とレースにつなげましょう。');
    if(t.award!==null){add(t.award,'lamia',`${ceremony(record.level).title}。${own?.name||winner.name}、おめでとうございます！`);
      add(t.award+6,'sahagin','表彰台で翼を振って、応援に応えています。牧場にとって大切な一勝ですね。');}
    return cues.sort((a,b)=>a.at-b.at);
  }
  return {MODES,COLORS,METRES,capture,valid,sample,visualSample,standings,ceremony,timeline,phase,course,position,cameraShot,commentary};
});
