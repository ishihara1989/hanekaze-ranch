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
  const ABILITIES=['speed','cardio','power','reserve','legs','economy','start','resilience'];
  const TRAITS=['grit','drive','wisdom','control','crowd','fight'];
  const PADDOCK=Object.freeze({intro:6,runnerSeconds:16,analysisDelay:4});
  function capture(runs,event){
    return {version:2,distance:event.distance,hill:event.hill||0,runners:runs.map((r,i)=>({
      id:r.id,name:r.name,color:r.color||'yellow',crest:r.crest||r.color||'yellow',
      lane:r.lane??i,player:!!r.player,time:r.time,finished:r.finished,
      ...(r.paddock?{paddock:{...r.paddock,abilities:{...r.paddock.abilities},traits:{...r.paddock.traits}}}:{}),
      samples:r.samples.map(s=>[s.time,s.distance,s.speed,MODES.indexOf(s.mode),s.lateral??r.lane??i]),
    }))};
  }
  function validPaddock(p){
    const finite=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
    return !!p&&!!p.abilities&&ABILITIES.every(k=>finite(p.abilities[k],50,150))&&
      !!p.traits&&TRAITS.every(k=>finite(p.traits[k],50,150))&&finite(p.condition,0,100)&&
      finite(p.strain,0,100)&&finite(p.traction,0,2)&&Number.isInteger(p.age)&&finite(p.age,0,50)&&
      ['M','F'].includes(p.sex)&&Number.isInteger(p.races)&&finite(p.races,0,1e15)&&
      Number.isInteger(p.wins)&&finite(p.wins,0,p.races);
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
        (r.paddock!==undefined&&!validPaddock(r.paddock))||
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
    // Subtracting the broadcast intro can place the exact finish a few ulps early.
    const atFinish=time>=runner.time-1e-9,samples=runner.samples,t=atFinish?runner.time:clamp(time,0,runner.time);
    let lo=0,hi=samples.length-1;
    while(lo<hi){const m=(lo+hi)>>1;if(samples[m][0]<t)lo=m+1;else hi=m;}
    const b=samples[lo],a=samples[Math.max(0,lo-1)],f=b[0]===a[0]?0:(t-a[0])/(b[0]-a[0]);
    return {distance:a[1]+(b[1]-a[1])*f,speed:a[2]+(b[2]-a[2])*f,
      lateral:(a[4]??runner.lane??0)+((b[4]??runner.lane??0)-(a[4]??runner.lane??0))*f,
      mode:MODES[a[3]],finished:runner.finished&&atFinish,stopped:atFinish};
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
    const gate=PADDOCK.intro+record.replay.runners.length*PADDOCK.runnerSeconds,race=gate+6;
    return {paddock:0,gate,race,result:race+raceEnd,award:awarded?race+8+raceEnd:null,
      end:race+8+raceEnd+(awarded?16:0),raceEnd};
  }
  // One immutable pre-race snapshot per entrant; results and samples are never
  // consulted by the paddock assessment, including when watching a saved race.
  function paddockOrder(record){return record.replay.runners.slice().sort((a,b)=>a.lane-b.lane);}
  function paddockAt(record,time){
    const order=paddockOrder(record),index=clamp(Math.floor((time-PADDOCK.intro)/PADDOCK.runnerSeconds),0,order.length-1),
      at=PADDOCK.intro+index*PADDOCK.runnerSeconds;
    return {runner:order[index],index,total:order.length,at,elapsed:Math.max(0,time-at),intro:time<PADDOCK.intro};
  }
  function paddockAssessments(record){
    const endurance=clamp((record.distance-1200)/2000,0,1),
      weights={speed:1.3-.65*endurance,cardio:.7+1.2*endurance,power:1-.5*endurance,
        reserve:.8,legs:.5+1.1*endurance,economy:.8+.6*endurance,start:.7-.45*endurance,resilience:.5+.5*endurance};
    const rows=paddockOrder(record).map(runner=>{
      const p=runner.paddock;if(!validPaddock(p))return {runner,known:false,tier:'unknown',chance:null};
      const a=p.abilities,total=Object.values(weights).reduce((x,y)=>x+y,0),
        score=ABILITIES.reduce((sum,k)=>sum+a[k]*weights[k],0)/total+
          (p.condition-100)*.08-p.strain*.035+(p.traction-1)*65+
          (p.traits.wisdom+p.traits.control-200)*.015,
        strength=ABILITIES.slice().sort((x,y)=>a[y]-a[x]||ABILITIES.indexOf(x)-ABILITIES.indexOf(y))[0],
        weakness=ABILITIES.slice().sort((x,y)=>a[x]-a[y]||ABILITIES.indexOf(x)-ABILITIES.indexOf(y))[0],
        style=(a.start+a.resilience-a.power-a.reserve)>12?'front':
          (a.power+a.reserve-a.start-a.resilience)>12?'closer':'balanced';
      return {runner,known:true,score,strength,weakness,style,tier:'unknown',chance:null};
    });
    // Partial legacy fields cannot support a comparison with the whole field.
    if(rows.some(r=>!r.known))return rows;
    const sorted=rows.slice().sort((a,b)=>b.score-a.score||a.runner.lane-b.runner.lane),best=sorted[0].score,
      total=rows.reduce((sum,r)=>sum+Math.exp((r.score-best)/7),0),average=1/rows.length;
    for(const row of rows){
      row.chance=Math.exp((row.score-best)/7)/total;
      row.tier=rows.length===1?'solo':row===sorted[0]&&best-sorted[1].score>=8?'standout':
        row.chance<average*.3?'longshot':row.chance<average*.65?'outsider':
        row.chance>=average*1.3?'contender':'open';
    }
    return rows;
  }
  const STRENGTH_LINES={
    speed:['スピードが持ち味です。直線での伸びに注目したいですね。','最高速には見るものがあります。速い流れにも対応できそうです。','持ち前のスピードを生かせれば、最後の直線が楽しみです。','速さを武器にするタイプです。自分のリズムで走りたいですね。'],
    cardio:['心肺の強さが持ち味です。息の長い脚を使えそうです。','持久力を生かして、じっくり勝負したいタイプですね。','長く脚を使えるのが強みです。消耗戦になれば面白いでしょう。','安定した巡航力があります。道中の流れには乗れそうです。'],
    power:['瞬発力が持ち味です。勝負どころの加速に注目です。','一瞬の切れ味が魅力です。加速のタイミングが合えば怖い存在ですね。','反応の鋭さが強みです。直線で抜け出す脚はありそうです。','加速する力を備えています。勝負どころでどう使うかですね。'],
    reserve:['スパートを長く続けられるのが持ち味です。','終いに使える脚を持っています。早くから加速する展開も合いそうです。','最後の勝負に向けた余力が強みです。道中でどれだけ脚をためられるかですね。','スパートを始めてからの持続力に注目です。長い直線は楽しみですね。'],
    legs:['脚の持久力が持ち味です。最後までしぶとく走れそうです。','長く踏ん張れる脚があります。タフな流れは歓迎でしょう。','持続力で勝負するタイプです。早めに動く展開も合いそうですね。','脚を長く使えるのがいいですね。終盤の粘りに注目です。'],
    economy:['無駄の少ない走りが持ち味です。道中で脚をためられそうです。','効率よく運べるのが強みです。長い距離でも楽しみがあります。','力を浪費せずに走れるタイプですね。終いの余力につなげたいところです。','走りの効率がいいですね。落ち着いた流れなら力を出せそうです。'],
    start:['立ち上がりの速さが持ち味です。好位置を取れそうですね。','スタートから流れに乗れるタイプです。序盤の位置取りに注目です。','出脚の良さがあります。すんなり前につけたいですね。','序盤の反応がいいですね。ゲートを出てからの動きに注目です。'],
    resilience:['疲れてからの粘りが持ち味です。最後まで簡単には止まらないでしょう。','苦しい場面でも踏ん張れるタイプです。競り合いも楽しみですね。','疲労に強いのが魅力です。厳しい流れでも粘りを見せそうです。','終盤に踏ん張れるのがいいですね。最後のひと伸びに期待しましょう。']
  };
  const WEAKNESS_LINES={
    speed:['ただ、速さ比べでは少し分が悪いですね。','瞬間の最高速は課題です。本人の位置取りと加速のタイミングが鍵ですね。','スピード勝負になると、もうひと押しが欲しいですね。'],
    cardio:['道中で飛ばしすぎると、息切れが心配です。','持久力には課題があります。ペース配分が鍵でしょう。','厳しい流れでは、本人が道中の消耗を抑えられるかですね。'],
    power:['急な加速には課題があります。余裕を持って加速できるかですね。','切れ味比べより、流れに乗る競馬が合いそうです。','一瞬の反応は控えめです。加速に時間がかかりそうです。'],
    reserve:['スパートの余力には限りがあります。使いどころが大切です。','長い追い比べになると、最後の余力が心配ですね。','終いの脚を残せるかですね。早くから飛ばすと消耗が心配です。'],
    legs:['脚の消耗には注意が必要です。長い追い比べはどうでしょうか。','長く脚を使う形では、終盤の踏ん張りが課題ですね。','脚をためられるかですね。早くから消耗すると終盤が心配です。'],
    economy:['走りに力を使いやすい面があります。余力を残せるかですね。','道中のロスを抑えられるかですね。消耗が最後に響くかもしれません。','力を浪費しない走りが鍵です。本人の落ち着きにも注目です。'],
    start:['出脚は課題です。序盤で置かれすぎないか気になりますね。','立ち上がりはゆっくりです。慌てず流れに乗れるかでしょう。','スタート後に本人がどの位置を選ぶか注目です。'],
    resilience:['疲れてからの踏ん張りが課題です。本人の余力配分が鍵ですね。','消耗が重なると、終盤の失速が心配です。','厳しいペースでは最後の粘りが鍵になりますね。']
  };
  const CHANCE_LINES={
    standout:['この中では実力は頭一つ抜けているように見えます。中心になるでしょう。','能力比較では一歩リードしています。勝ち負けを期待したいですね。','ここでは有力な一羽です。力を出せれば優勝に近いでしょう。','この顔ぶれなら、主役を張れるだけの力があります。'],
    contender:['チャンスは十分あるでしょう。上位争いが楽しみです。','この相手でも勝ち負けに加われる力があります。','勝つ見込みは十分です。うまく流れに乗れれば楽しみですね。','優勝争いに加わってきそうです。展開がはまれば面白いでしょう。'],
    open:['力関係は拮抗しています。展開ひとつでチャンスはあるでしょう。','この顔ぶれなら、うまく運べば上位に届いてもおかしくありません。','抜けた存在ではありませんが、勝つチャンスはありそうです。','混戦ですからね。持ち味を出せれば勝負になるでしょう。','勝負は位置取り次第でしょう。十分に見せ場を作れる一羽です。'],
    outsider:['相手はそろっていますが、展開が向けば食い込めるでしょう。','簡単な相手ではありません。持ち味を生かして、どこまで迫れるかですね。','上位とは少し差がありますが、一角を崩す余地はあるでしょう。','勝つにはひと工夫が必要でしょう。展開の助けも欲しいところです。'],
    longshot:['厳しい戦いになると思いますが、爪痕を残せるかに注目です。','この相手では苦戦も予想されます。最後まで持ち味を見せてほしいですね。','能力比較では分が悪いですが、一つでも上を目指したいところです。','勝ち負けには厳しい相手です。自分の競馬で見せ場を作れるでしょうか。'],
    solo:['自分のリズムで走って、力を出し切ってほしいですね。'],
    unknown:['今回は力関係が読みづらいですね。自分のリズムで走れるかに注目しましょう。','比較は難しい顔ぶれですが、展開を味方につけたいですね。','ここは実際の走りを見てみたいですね。落ち着いて流れに乗れるかでしょう。']
  };
  const STYLE_LINES={front:['先行してレースを作っていきそうです。','前々で流れに乗る競馬が合いそうです。','出脚を生かして、早めに好位置を取りそうですね。'],
    closer:['道中で脚をためて、直線で勝負したいタイプです。','終いの脚を生かす競馬が合いそうです。','じっくり構えて、勝負どころで動いていきそうです。'],
    balanced:['位置取りには融通が利きそうです。','流れを見ながら、無理なく走れそうですね。','前を見ながら、自分のリズムで進めそうですね。']};
  function paddockComment(row,record,index){
    let seed=0;for(const char of `${record.name}|${record.week||0}|${record.distance}|${record.trackId||''}`)seed=(seed*31+char.charCodeAt(0))>>>0;
    const pick=(pool,salt=0)=>pool[(seed+index+salt)%pool.length],p=row.runner.paddock;
    if(!row.known)return pick(CHANCE_LINES.unknown);
    const a=p.abilities,parts=[pick(STRENGTH_LINES[row.strength])];
    // Use real pre-race deficiencies before describing the bird's running style.
    if(p.condition<70)parts.push('ただ、調子は万全とは言えません。どこまで力を出せるかですね。');
    else if(p.strain>55)parts.push('疲れが少し気になります。終盤まで踏ん張れるかでしょう。');
    else if(p.traction<.9)parts.push('今日の馬場は得意とは言えません。ロスを抑えたいですね。');
    else if(a[row.weakness]<90)parts.push(pick(WEAKNESS_LINES[row.weakness],1));
    else parts.push(pick(STYLE_LINES[row.style],2));
    parts.push(pick(CHANCE_LINES[row.tier],3));
    return parts.join('');
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
  // Pure playback data: neither the DOM nor a renderer takes part in the race.
  // Official standings stay separate from the visible run-out after the finish.
  function frame(record,track={},time=0){
    const clock=timeline(record),at=clamp(time,0,clock.end),stage=phase(record,at),
      raceTime=Math.max(0,at-clock.race),racing=stage==='race'||stage==='result',
      order=standings(record.replay,raceTime),runners=record.replay.runners.map(entry=>{
        const state=racing?visualSample(entry,raceTime):{distance:0,lateral:entry.lane,speed:0,stopped:true},
          p=position(state.distance,state.lateral,record,track);
        if(racing&&!state.stopped){
          const next=visualSample(entry,raceTime+.1),q=position(next.distance,next.lateral,record,track);
          if(Math.hypot(q.x-p.x,q.z-p.z)>.001)p.heading=Math.atan2(q.x-p.x,q.z-p.z);
        }
        return {entry,state,position:p};
      });
    return {time:at,phase:stage,raceTime,order,runners};
  }
  function cameraShot(record,track,time,mode='broadcast',focusId=null,aspect=1,sampledFrame=null){
    const current=sampledFrame||frame(record,track,time),c=course(record,track),raceTime=current.raceTime,
      order=current.order,leader=order[0],focus=order.find(r=>r.id===focusId)||leader,
      subject=mode==='follow'?focus:leader,p=current.runners.find(r=>r.entry.id===subject.id).position,
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
      const positions=current.runners.map(r=>r.position);
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
  // Calls use only the field at this moment and its recent movement. Pre-race
  // prospects come from paddock snapshots, never the eventual finishing order.
  function raceCommentary(record,track,clock,add,assessments){
    const replay=record.replay,number=r=>`${r.lane+1}番 ${r.name}`,
      prospects=assessments.every(row=>row.chance!==null)?assessments.slice()
        .sort((a,b)=>b.score-a.score||a.runner.lane-b.runner.lane).slice(0,2):[],
      introduced=new Set(),mentions=new Map(),lastMention=new Map(),c=course(record,track);
    let lastCall=-2,opening=false,settled=false,lineupAt=14,prospectAt=19,prospectIndex=0,
      announcedLeader=null,corner=false,straight=false,finishCall=false;
    const emit=(sec,speaker,text,runners=[])=>{
      add(clock.race+sec,speaker,text);lastCall=sec;
      for(const r of runners){mentions.set(r.id,(mentions.get(r.id)||0)+1);lastMention.set(r.id,sec);}
    };
    const rankText=(r,index)=>`${index===0?'先頭':`${index+1}番手`}は${number(r)}`;
    const gapText=gap=>gap<3?'ほとんど差はありません。':`先頭との差はおよそ${Math.round(gap)}メートルです。`;
    const introduce=(sec,order,secondsToStraight)=>{
      const unintroduced=order.map((r,i)=>({r,rank:i})).filter(x=>!introduced.has(x.r.id)),
        // Short races need a briefer overview before the home straight.
        size=secondsToStraight<=12?unintroduced.length:record.distance<=1400?4:3,
        group=unintroduced.slice(0,size),first=introduced.size===0;
      group.forEach(x=>introduced.add(x.r.id));
      emit(sec,'lamia',`${first?'ここで隊列を見ていきます。':'続く隊列です。'}${group.map(x=>rankText(x.r,x.rank)).join('、')}。${introduced.size===order.length?'これで全羽の位置をお伝えしました。':''}`,group.map(x=>x.r));
      lineupAt=sec+6;
    };
    for(let sec=3;sec<clock.raceEnd;sec++){
      const order=standings(replay,sec),leader=order[0],second=order[1],remaining=record.distance-leader.distance,
        inStraight=remaining<=c.finalStraight,nearFinish=remaining<=100,
        gap=second?leader.distance-second.distance:Infinity;
      if(leader.finished||leader.stopped||sec-lastCall<(nearFinish?3:inStraight?4:5))continue;
      if(!opening){
        opening=true;announcedLeader=leader.id;
        const front=order.slice(0,3).filter(r=>leader.distance-r.distance<=8);
        emit(sec,'lamia',`${number(leader)}が好ダッシュ！ ${front.length>1?`${front.slice(1).map(number).join('、')}も前へ。ハナをうかがいます。`:'まずは前に出ました。'}`,front);
        continue;
      }
      if(nearFinish){
        const changed=announcedLeader!==leader.id;
        if(!finishCall||changed||sec-lastCall>=4){
          finishCall=true;announcedLeader=leader.id;
          emit(sec,'lamia',second?(gap<3?
            `ゴールは目前！ ${number(leader)}と${number(second)}、ほとんど並んで先頭争い！`:
            gap<10?`ゴールは目前！ ${number(leader)}が先頭、${number(second)}が${Math.round(gap)}メートル差で追う！`:
            `ゴールは目前！ ${number(leader)}が後続におよそ${Math.round(gap)}メートルのリード！`):
            `ゴールは目前！ ${number(leader)}が最後まで駆けていきます！`,order.slice(0,2));
          continue;
        }
      }
      if(inStraight&&!straight){
        straight=true;announcedLeader=leader.id;
        emit(sec,'lamia',`最後の直線に入りました！ ${number(leader)}が先頭${second?`、${number(second)}が${gap<3?'すぐ隣で競り合う':`${Math.round(gap)}メートル差で続く`}`:''}！`,order.slice(0,2));
        continue;
      }
      if(!settled&&!inStraight){
        settled=true;announcedLeader=leader.id;
        const front=order.slice(1,3).filter(r=>leader.distance-r.distance<=10);
        emit(sec,'lamia',`${number(leader)}がハナを切ります。${front.length?`${front.map(number).join('、')}が続いて、先行争い。`:
          second?`${number(second)}をおよそ${Math.round(gap)}メートル離してレースを引っ張ります。`:'自分のリズムで進んでいきます。'}`,[leader,...front]);
        continue;
      }
      if(announcedLeader!==leader.id){
        announcedLeader=leader.id;
        emit(sec,'lamia',`${number(leader)}が先頭に立ちました！ ${second?`${number(second)}は${gap<3?'すぐ後ろ、先頭争いが続きます！':`${Math.round(gap)}メートル差で追いかけます。`}`:''}`,order.slice(0,2));
        continue;
      }
      const before=standings(replay,Math.max(0,sec-5)),past=new Map(before.map((r,i)=>[r.id,{r,rank:i}])),
        movers=order.map((r,i)=>{
          const prev=past.get(r.id),gained=prev.rank-i,
            closed=(before[0].distance-prev.r.distance)-(leader.distance-r.distance);
          return {r,rank:i,gained,closed};
        }).filter(x=>!x.r.stopped&&sec-(lastMention.get(x.r.id)??-20)>=10&&
          (x.gained>=2||x.gained>=1&&x.closed>=2||x.rank>0&&x.closed>=4))
        .sort((a,b)=>b.gained-a.gained||b.closed-a.closed||a.rank-b.rank);
      if(inStraight&&movers.length){
        const m=movers[0];
        emit(sec,'lamia',`${number(m.r)}が伸びてきました！ ${m.gained>0?`${m.gained}つ順位を上げて${m.rank===0?'先頭へ':`${m.rank+1}番手へ`}！`:
          `先頭との差を詰めて、現在${m.rank+1}番手！`}`, [m.r]);
        continue;
      }
      const lineupDue=!inStraight&&introduced.size<order.length&&sec>=lineupAt,
        pace=Math.max(1,(leader.distance-before[0].distance)/5),secondsToStraight=(remaining-c.finalStraight)/pace;
      if(lineupDue&&secondsToStraight<=12){
        introduce(sec,order,secondsToStraight);
        continue;
      }
      if(!corner&&!inStraight&&remaining<=c.finalStraight+Math.PI*c.radius){
        corner=true;
        emit(sec,'lamia',`最終コーナー、${number(leader)}が先頭。${second?`${number(second)}が${gap<3?'ぴったり続きます。':`${Math.round(gap)}メートル差で追います。`}`:''}直線の攻防へ向かいます。`,order.slice(0,2));
        continue;
      }
      if(!nearFinish&&prospects.length&&sec>=prospectAt){
        const index=prospectIndex++%prospects.length,id=prospects[index].runner.id,rank=order.findIndex(r=>r.id===id),r=order[rank],
          prev=past.get(id),movement=prev.rank>rank?'順位を上げてきています。':prev.rank<rank?'少し位置を下げています。':
            r.mode==='前詰まり'?'前が詰まって、進路を探しています。':'この位置で運んでいます。';
        emit(sec,'sahagin',`${index===0?'本命視される':'対抗に挙げた'}${number(r)}は${rank===0?'先頭':`現在${rank+1}番手`}。${movement}${rank>0?gapText(leader.distance-r.distance):''}`,[r]);
        prospectAt=sec+18;
        continue;
      }
      if(lineupDue){
        introduce(sec,order,secondsToStraight);
        continue;
      }
      if(sec-lastCall>=(inStraight?6:12)){
        if(inStraight){
          emit(sec,'lamia',second&&gap<3?`${number(leader)}と${number(second)}、直線で先頭を競り合っています！`:
            `${number(leader)}が先頭を保っています。${second?`${number(second)}までおよそ${Math.round(gap)}メートル。`:''}`,order.slice(0,2));
        }else{
          // Cover the rest of the field without automatically choosing the owner.
          const r=order.filter(r=>!r.stopped).sort((a,b)=>(mentions.get(a.id)||0)-(mentions.get(b.id)||0)||
            (lastMention.get(a.id)??-20)-(lastMention.get(b.id)??-20)||a.lane-b.lane)[0],rank=order.findIndex(x=>x.id===r.id),
            movement=r.mode==='前詰まり'?'前が詰まり、進路を探しています。':r.mode==='進路確保'?'進路を確保しています。':
              r.mode==='余力温存'?'余力を温存して運んでいます。':past.get(r.id).rank>rank?'順位を上げてきました。':'この位置でレースを進めています。';
          emit(sec,'sahagin',`${number(r)}は${rank===0?'先頭':`${rank+1}番手`}。${movement}${rank>0?gapText(leader.distance-r.distance):''}`,[r]);
        }
      }
    }
  }
  function commentary(record,track={}){
    const t=timeline(record),replay=record.replay,own=replay.runners.find(r=>r.id===record.birdId)||replay.runners.find(r=>r.player),
      cues=[],add=(at,speaker,text)=>cues.push({at,speaker,text});
    const number=r=>`${r.lane+1}番 ${r.name}`;
    add(0,'lamia',`${record.name}。パドックからお届けします！ ${replay.runners.length}羽が登場です。`);
    add(3,'sahagin',`${record.distance}メートル、${record.surface==='dirt'?'ダート':'芝'}の競走です。一羽ずつご紹介しましょう。`);
    const assessments=paddockAssessments(record);
    assessments.forEach((row,index)=>{
      const r=row.runner,p=r.paddock,at=PADDOCK.intro+index*PADDOCK.runnerSeconds,
        details=row.known?`${p.age}歳の${p.sex==='M'?'牡羽':'牝羽'}。${p.races?`${p.races}戦${p.wins}勝`:'これが初めてのレース'}です。`:'';
      add(at,'lamia',`${number(r)}です。${details}`);
      add(at+PADDOCK.analysisDelay,'sahagin',paddockComment(row,record,index));
    });
    add(t.gate,'lamia','各羽、ゲートに入りました。まもなく発走です！');
    add(t.race,'lamia','ゲートが開いた！ 全羽、いっせいにスタート！');
    const firstFinish=Math.min(...replay.runners.filter(r=>r.finished).map(r=>r.time));
    raceCommentary(record,track,t,add,assessments);
    const winner=replay.runners.find(r=>r.id===record.field[0].id);
    if(Number.isFinite(firstFinish))add(t.race+firstFinish,'lamia',`${winner.name}、いま先頭でゴールイン！`);
    add(t.result,'lamia',`着順が確定しました。${own?`${own.name}は${record.rank}着です。`:'全羽の結果をご覧ください。'}`);
    add(t.result+3,'sahagin',record.rank===1?'見事な走りでした。育ててきた力を発揮しましたね。':'この経験を、次の調教とレースにつなげましょう。');
    if(t.award!==null){add(t.award,'lamia',`${ceremony(record.level).title}。${own?.name||winner.name}、おめでとうございます！`);
      add(t.award+6,'sahagin','表彰台で翼を振って、応援に応えています。牧場にとって大切な一勝ですね。');}
    return cues.sort((a,b)=>a.at-b.at);
  }
  return {MODES,COLORS,METRES,PADDOCK,capture,valid,validPaddock,paddockOrder,paddockAt,paddockAssessments,paddockComment,sample,visualSample,standings,ceremony,timeline,phase,course,position,frame,cameraShot,commentary};
});
