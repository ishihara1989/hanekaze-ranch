'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Replay=require('../public/js/race-replay.js');

function profile(value){
  return {abilities:Object.fromEntries(['speed','cardio','power','reserve','legs','economy','start','resilience'].map(k=>[k,value])),
    traits:Object.fromEntries(['grit','drive','wisdom','control','crowd','fight'].map(k=>[k,100])),
    age:3,sex:'M',races:5,wins:2,condition:100,strain:0,traction:1};
}
function recording(count=12){
  const runners=Array.from({length:count},(_,lane)=>({id:`bird-${lane}`,name:`チョコボ${String.fromCharCode(65+lane)}`,
    lane,color:'yellow',crest:'yellow',player:lane===count-1,time:100+lane,finished:true,
    paddock:profile(lane===8?130:lane===6?120:100),
    samples:[[0,0,0,0],[100+lane,1800,18,1]]}));
  return {name:'実況試走',birdId:runners.at(-1).id,distance:1800,rank:count,time:runners.at(-1).time,finished:true,
    field:runners.map(({id,name,time,finished})=>({id,name,time,finished})),replay:{version:1,distance:1800,hill:0,runners}};
}
function calls(record,track){
  const clock=Replay.timeline(record);
  return Replay.commentary(record,track).filter(c=>c.at>clock.race&&c.at<clock.result)
    .map(c=>({...c,sec:c.at-clock.race}));
}

test('opening covers the actual early leaders and the lineup introduces the entire field in current order',()=>{
  const record=recording(),before=JSON.stringify(record),cues=calls(record);
  assert.equal(cues[0].sec,3);assert.match(cues[0].text,/1番 チョコボAが好ダッシュ/);
  assert.match(cues.find(c=>c.text.includes('ハナを切ります')).text,/1番 チョコボA.*2番 チョコボB/);
  const lineup=cues.filter(c=>/隊列を/.test(c.text)||c.text.startsWith('続く隊列'));
  assert.equal(lineup.length,4);
  const names=lineup.flatMap(c=>[...c.text.matchAll(/\d+番 (チョコボ[A-L])/g)].map(m=>m[1]));
  assert.deepEqual(names,record.replay.runners.map(r=>r.name));
  for(const cue of lineup){
    const order=Replay.standings(record.replay,cue.sec);
    for(const match of cue.text.matchAll(/(先頭|\d+番手)は(\d+)番 (チョコボ[A-L])/g)){
      const rank=match[1]==='先頭'?0:Number.parseInt(match[1])-1;
      assert.equal(order[rank].name,match[3]);
    }
  }
  assert.equal(JSON.stringify(record),before);
  assert.deepEqual(calls(record),cues);
});

test('prospects recur independently of the lineup and of which entrant belongs to the player',()=>{
  const record=recording(),cues=calls(record),fav=cues.filter(c=>c.text.includes('本命視')),rival=cues.filter(c=>c.text.includes('対抗に'));
  assert.ok(fav.length>=2);assert.ok(rival.length>=2);
  assert.ok(fav.every(c=>c.text.includes('9番 チョコボI')));
  assert.ok(rival.every(c=>c.text.includes('7番 チョコボG')));
  for(const cue of [...fav,...rival]){
    const order=Replay.standings(record.replay,cue.sec),name=cue.text.includes('本命視')?'チョコボI':'チョコボG';
    assert.ok(cue.text.includes(`現在${order.findIndex(r=>r.name===name)+1}番手`));
  }
  const changed=structuredClone(record);changed.birdId='bird-0';changed.rank=1;
  changed.replay.runners.forEach(r=>r.player=r.id===changed.birdId);
  assert.deepEqual(calls(changed),cues,'race coverage is independent of the owner focus');
  changed.field.reverse();
  assert.deepEqual(calls(changed).filter(c=>!c.text.includes('ゴールイン')),cues.filter(c=>!c.text.includes('ゴールイン')),
    'pre-race prospects do not come from the finishing order');
});

test('short races summarize the tail before the home straight instead of abandoning the lineup',()=>{
  const record=recording();record.distance=record.replay.distance=1200;
  record.replay.runners.forEach((r,i)=>{r.time=50+i;r.samples[1][0]=r.time;r.samples[1][1]=1200;});
  const cues=calls(record,{lap:1800,straight:600}),straight=cues.find(c=>c.text.includes('最後の直線に')),
    lineup=cues.filter(c=>/隊列を/.test(c.text)||c.text.startsWith('続く隊列')),
    names=lineup.flatMap(c=>[...c.text.matchAll(/\d+番 (チョコボ[A-L])/g)].map(m=>m[1]));
  assert.equal(names.length,12);assert.equal(new Set(names).size,12);
  assert.ok(lineup.every(c=>c.sec<straight.sec));
});

test('a runner advancing from the rear in the home straight receives a call grounded in recent positions',()=>{
  const record=recording(4),runner=record.replay.runners[3];
  runner.samples=[[0,0,0,0],[80,1200,15,1],[84,1440,30,2],[90,1620,30,2],[100,1800,18,2]];
  const cues=calls(record),rise=cues.find(c=>c.text.includes(`${runner.name}が伸びてきました`));
  assert.ok(rise,'the outsider making ground is covered');
  const now=Replay.standings(record.replay,rise.sec),before=Replay.standings(record.replay,rise.sec-5),
    rank=now.findIndex(r=>r.id===runner.id),oldRank=before.findIndex(r=>r.id===runner.id);
  assert.ok(oldRank>rank||before[0].distance-before[oldRank].distance>now[0].distance-now[rank].distance);
  assert.ok(rise.text.includes(`${rank+1}番手`));
  assert.ok(cues.some(c=>c.text.includes('ゴールは目前')));
});

test('lead changes during a call interval are still announced, and changing lineups do not omit or duplicate entrants',()=>{
  const record=recording(),r=record.replay.runners[4];
  r.samples=[[0,0,0,0],[18,300,17,1],[23,430,26,1],[28,540,22,1],[100,1800,18,1]];
  const cues=calls(record),lead=cues.find(c=>c.text.includes(`${r.name}が先頭に立ちました`));
  assert.ok(lead);assert.equal(Replay.standings(record.replay,lead.sec)[0].id,r.id);
  const lineup=cues.filter(c=>/隊列を/.test(c.text)||c.text.startsWith('続く隊列')),
    names=lineup.flatMap(c=>[...c.text.matchAll(/\d+番 (チョコボ[A-L])/g)].map(m=>m[1]));
  assert.equal(names.length,12);assert.equal(new Set(names).size,12);
  for(const cue of lineup){
    const order=Replay.standings(record.replay,cue.sec),ranks=[];
    for(const match of cue.text.matchAll(/(先頭|\d+番手)は(\d+)番 (チョコボ[A-L])/g)){
      const rank=match[1]==='先頭'?0:Number.parseInt(match[1])-1;
      assert.equal(order[rank].name,match[3]);ranks.push(rank);
    }
    assert.deepEqual(ranks,ranks.toSorted((a,b)=>a-b));
  }
});

test('home-straight calls use the supplied course and finish calls distinguish close duels from a clear lead',()=>{
  const close=recording(2);close.replay.runners[1].time=100.1;close.replay.runners[1].samples[1][0]=100.1;
  const long={lap:1800,straight:600},short={lap:1800,straight:200},
    longCall=calls(close,long).find(c=>c.text.includes('最後の直線に')),shortCall=calls(close,short).find(c=>c.text.includes('最後の直線に'));
  assert.ok(longCall.sec<shortCall.sec);
  for(const [track,cue] of [[long,longCall],[short,shortCall]]){
    const remaining=close.distance-Replay.standings(close.replay,cue.sec)[0].distance;
    assert.ok(remaining<=Replay.course(close,track).finalStraight);
  }
  assert.ok(calls(close).some(c=>/ゴールは目前.*ほとんど並んで先頭争い/.test(c.text)));
  const clear=recording(2);clear.replay.runners[1].time=150;clear.replay.runners[1].samples[1][0]=150;
  assert.ok(calls(clear).some(c=>/ゴールは目前.*リード/.test(c.text)));
  assert.ok(!calls(clear).some(c=>/ほとんど並んで/.test(c.text)));
  const finish=calls(clear).find(c=>c.text.includes('ゴールイン'));
  assert.equal(finish.sec,100);assert.match(finish.text,/チョコボA/);
  assert.ok(!calls(clear).some(c=>c.sec>100),'winning battle ends at the first finish');
});

test('old, partial, solo and unfinished replays work without inventing favorites or a winner',()=>{
  for(const count of [1,2,12]){
    const record=recording(count);delete record.replay.runners[0].paddock;
    const cues=calls(record);
    assert.ok(!cues.some(c=>/本命視|対抗に|一番人気/.test(c.text)));
    assert.ok(cues.every((c,i)=>Number.isFinite(c.at)&&(!i||c.at>cues[i-1].at)));
    record.finished=false;record.replay.runners.forEach(r=>{r.finished=false;r.samples[1][1]=700;});
    assert.ok(!calls(record).some(c=>/ゴールイン|ゴールは目前/.test(c.text)));
  }
});
