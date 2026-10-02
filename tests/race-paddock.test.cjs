'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Replay=require('../public/js/race-replay.js');
const abilities=['speed','cardio','power','reserve','legs','economy','start','resilience'];
function profile(value=100){return {abilities:Object.fromEntries(abilities.map(key=>[key,value])),
  traits:Object.fromEntries(['grit','drive','wisdom','control','crowd','fight'].map(key=>[key,100])),
  age:3,sex:'M',races:5,wins:2,condition:100,strain:0,traction:1};}
function recording(values=Array(12).fill(100)){
  const runners=values.map((value,lane)=>({id:`bird-${lane}`,name:`テスト${lane}`,lane,color:'yellow',crest:'blue',
    player:lane===0,time:60+lane,finished:true,paddock:profile(value),samples:[[0,0,0,0],[60+lane,1800,20,2]]}));
  return {name:'パドック試走',week:24,trackId:'tenku',surface:'turf',distance:1800,rank:1,time:60,finished:true,
    field:runners.map(({id,name,time,finished})=>({id,name,time,finished})),replay:{version:1,distance:1800,hill:0,runners:runners.toReversed()}};
}
test('all entrants receive a timed introduction followed by analysis, aligned with camera selection and seeks',()=>{
  const record=recording(),before=JSON.stringify(record),clock=Replay.timeline(record),cues=Replay.commentary(record);
  assert.equal(clock.gate,6+12*16);assert.equal(clock.race,clock.gate+6);
  for(let i=0;i<12;i++){
    const at=Replay.PADDOCK.intro+i*Replay.PADDOCK.runnerSeconds,
      introduction=cues.find(c=>c.at===at),analysis=cues.find(c=>c.at===at+4);
    assert.equal(introduction.speaker,'lamia');assert.match(introduction.text,new RegExp(`${i+1}番 テスト${i}です`));
    assert.match(introduction.text,/3歳の牡羽。5戦2勝/);assert.equal(analysis.speaker,'sahagin');
    for(const time of [at,at+4,at+15.99])assert.equal(Replay.paddockAt(record,time).runner.id,`bird-${i}`);
    assert.equal(Replay.phase(record,at+15.99),'paddock');
  }
  assert.equal(Replay.phase(record,clock.gate),'gate');
  assert.equal(Replay.paddockAt(record,0).runner.id,'bird-0');
  Replay.paddockAt(record,clock.gate-1);assert.equal(Replay.paddockAt(record,6).runner.id,'bird-0');
  assert.equal(JSON.stringify(record),before);
});
test('win prospects depend on pre-race ability, condition and distance, and never on the settled outcome',()=>{
  const record=recording([125,103,100,95,80,65]),rows=Replay.paddockAssessments(record);
  assert.equal(rows[0].tier,'standout');assert.equal(rows.at(-1).tier,'longshot');
  assert.ok(rows.every((r,i)=>!i||r.chance<rows[i-1].chance));
  assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.chance,0)-1)<1e-10);
  const before=Replay.commentary(record).filter(c=>c.at<Replay.timeline(record).gate),changed=structuredClone(record);
  changed.rank=6;changed.time=65;changed.field.reverse();
  changed.replay.runners.forEach(r=>{r.time+=100;r.finished=false;r.samples=[[0,0,0,0],[r.time,300,3,1]];});
  assert.deepEqual(Replay.commentary(changed).filter(c=>c.at<Replay.timeline(changed).gate),before);
  const poor=structuredClone(record);poor.replay.runners.find(r=>r.lane===0).paddock.condition=40;
  assert.ok(Replay.paddockAssessments(poor)[0].score<rows[0].score);
  const distance=recording([100,100]),speed=distance.replay.runners.find(r=>r.lane===0).paddock.abilities,
    endurance=distance.replay.runners.find(r=>r.lane===1).paddock.abilities;
  Object.assign(speed,{speed:125,power:125,start:125,cardio:75,legs:75});
  Object.assign(endurance,{speed:75,power:75,start:75,cardio:125,legs:125});
  const short=Replay.paddockAssessments({...distance,distance:1200}),long=Replay.paddockAssessments({...distance,distance:3200});
  assert.ok(short[0].score>short[1].score);assert.ok(long[0].score<long[1].score);
});
test('commentary selects strengths, tactical style, drawbacks and a variety of prospects deterministically',()=>{
  const record=recording(),rows=Replay.paddockAssessments(record),comments=rows.map((row,i)=>Replay.paddockComment(row,record,i));
  assert.ok(new Set(comments).size>=8,'a field of equal abilities still gets varied wording');
  for(const key of abilities){
    const fixture=recording([100,100]),p=fixture.replay.runners.find(r=>r.lane===0).paddock;
    p.abilities[key]=130;p.abilities[key==='legs'?'cardio':'legs']=70;
    const row=Replay.paddockAssessments(fixture)[0],comment=Replay.paddockComment(row,fixture,0);
    assert.equal(row.strength,key);assert.equal(row.known,true);assert.ok(comment.length>35);
    assert.equal(Replay.paddockComment(row,fixture,0),comment);
    p.condition=50;assert.match(Replay.paddockComment(Replay.paddockAssessments(fixture)[0],fixture,0),/調子は万全/);
  }
  for(const [tier,pattern] of [['standout',/リード|優勝|主役|頭一つ/],['contender',/チャンス|勝ち負け|見込み|優勝争い/],['longshot',/厳しい|苦戦|分が悪い/]]){
    assert.match(Replay.paddockComment({...rows[0],tier},record,0),pattern);
  }
});
test('legacy profiles remain playable and corrupt pre-race metadata is rejected',()=>{
  const record=recording();assert.equal(Replay.valid(record.replay,record),true);
  const old=structuredClone(record);old.replay.runners.forEach(r=>delete r.paddock);
  assert.equal(Replay.valid(old.replay,old),true);
  assert.ok(Replay.paddockAssessments(old).every(row=>row.chance===null&&row.tier==='unknown'));
  assert.equal(Replay.commentary(old).filter(c=>c.at>=6&&c.at<Replay.timeline(old).gate).length,24);
  const mixed=structuredClone(record);delete mixed.replay.runners[0].paddock;
  assert.ok(Replay.paddockAssessments(mixed).every(row=>row.chance===null));
  for(const corrupt of [p=>p.abilities.power=Infinity,p=>p.traits.drive=151,p=>p.sex='?',p=>p.condition=-1,
    p=>p.age=3.2,p=>p.wins=p.races+1,p=>p.traction=NaN,p=>delete p.abilities.legs]){
    const broken=structuredClone(record);corrupt(broken.replay.runners[0].paddock);
    assert.equal(Replay.valid(broken.replay,broken),false);
  }
});

test('2D paddock renders only the introduced walker and reproduces its gait after rewind regardless of race pitch',async()=>{
  const Projection=require('../public/js/race-2d-course.js'),originals={RaceReplay:globalThis.RaceReplay,Race2DCourse:globalThis.Race2DCourse,window:globalThis.window};
  Object.assign(globalThis,{RaceReplay:Replay,Race2DCourse:Projection,window:{devicePixelRatio:1}});
  try{
    const {RaceViewer2D}=await import('../public/js/race-viewer-2d.js'),record=recording(),before=JSON.stringify(record),
      manifest=require('../public/assets/chocobo-sprite-study/v5/manifest.json'),rendered=[],node={},
      ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(object,key)=>object[key]||(()=>{})}),
      viewer=Object.assign(Object.create(RaceViewer2D.prototype),{ready:true,disposed:false,record,replay:record.replay,
        track:{id:'tenku'},theme:{key:'temple'},manifest,ctx,canvas:{},stage:{dataset:{},getBoundingClientRect:()=>({width:390,height:360})},
        course:Replay.course(record),root:{querySelectorAll:()=>[]},$:()=>node,cameraMode:'finish',motionPitch:2,
        bird(...args){rendered.push(args);},updateOverlay(){},minimap(){throw Error('Paddock must not draw the race course.');}});
    for(const index of [0,11,4,0]){
      viewer.time=6+index*16+4.3;rendered.length=0;viewer.draw();
      assert.equal(rendered.length,1);assert.equal(rendered[0][0].id,`bird-${index}`);assert.equal(rendered[0][6],'walk');
      const gait=rendered[0][3];assert.ok(gait>=0&&gait<8);
      assert.equal(viewer.stage.dataset.paddockId,`bird-${index}`);
      viewer.motionPitch=1;rendered.length=0;viewer.draw();assert.equal(rendered[0][3],gait);
    }
    assert.equal(JSON.stringify(record),before);
  }finally{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
