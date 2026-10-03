'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const W=require('../public/js/world.js');
const R=require('../public/js/ranch-engine.js');
const annual=()=>Array.from({length:48},(_,i)=>R.calendar(i+1)).flat().filter(e=>/^G/.test(e.level));

test('annual stakes match the 2026 central and regional scale with short and dirt routes',()=>{
  const events=annual(),counts={};
  for(const e of events)counts[e.level]=(counts[e.level]||0)+1;
  assert.equal(events.length,179);assert.deepEqual(counts,{GIII:91,GII:51,GI:37});
  assert.equal(events.filter(e=>e.circuit==='central').length,106);
  assert.equal(events.filter(e=>e.circuit==='regional').length,46);
  assert.equal(new Set(events.filter(e=>e.referenceName).map(e=>e.referenceName)).size,152);
  assert.equal(events.filter(e=>e.surface==='dirt').length,63);
  assert.equal(events.filter(e=>e.distance<=1400).length,40);
  for(const surface of ['turf','dirt']){
    const weeks=[...new Set(events.filter(e=>e.surface===surface&&e.distance<=1600&&e.maxAge===9&&!e.sex).map(e=>e.week))].sort((a,b)=>a-b);
    assert.ok(weeks.length>=12,surface);
    assert.ok(weeks.every((w,i)=>(weeks[(i+1)%weeks.length]+(i===weeks.length-1?48:0))-w<=8),surface);
  }
  for(let week=1;week<=48;week++){
    const races=R.calendar(week);assert.ok(races.some(e=>/^G/.test(e.level)));
    assert.equal(new Set(races.map(e=>e.id)).size,races.length);
    for(const e of races){assert.equal(e.track.surface,e.surface);assert.ok(e.minAge<=e.maxAge);}
  }
});

test('legacy stakes IDs and saved reservations remain linked across years',()=>{
  const names=['ダイヤモンドダスト杯','タイタンステークス','カーバンクル記念','リヴァイアサン記念','クリスタル賞','神竜賞','オーディーン賞（春）','CRAマイルカップ','セイレーンカップ','チョコボオークス','チョコボダービー','イフリート記念','フェニックス記念','コスタ・デル・ソル杯','王宮大賞典','ラムウステークス','ミスリル賞','オメガ賞','オーディーン賞（秋）','シヴァ女王杯','アレクサンダーカップ','CRAワールドカップ','ナイツ・オブ・ラウンド記念','オニオンガールステークス','オニオンボーイステークス','バハムート記念','光の戦士ステークス'];
  for(const name of names){
    const old=W.STAKES.find(row=>row[1]===name);
    for(const year of [0,1,10]){
      const id=`${old[0]+year*48}:${name==='光の戦士ステークス'?'stakes2':'stakes'}`;
      assert.equal(W.eventById(id).name,name);assert.equal(R.calendar(old[0]+year*48).find(e=>e.id===id).name,name);
    }
  }
  const s=R.initial(),b=R.own(s)[0];s.week=17;s.stage='running';s.money=1000000;
  Object.assign(b,{wins:2,races:2,birthYear:-2,lastRace:-100});
  const derby=R.calendar(21).find(e=>e.name==='チョコボダービー');
  R.setSchedule(s,b.id,21,{mode:'race',eventId:derby.id});
  const loaded=R.upgradeState(R.deserializeState(R.serializeState(s)));
  assert.equal(R.nextRace(loaded,R.bird(loaded,b.id)).name,'チョコボダービー');
  assert.ok(R.validState(loaded));
});

test('NPC rosters fill every expanded grade and obey age, sex and persistent divisions',()=>{
  const s=R.initial();
  for(const e of annual()){
    s.week=e.week;const runners=R.worldRoster(s,e);
    assert.ok(runners.length>=2,e.name);
    assert.ok(runners.every(b=>R.age(s,b)>=e.minAge&&R.age(s,b)<=e.maxAge&&(!e.sex||b.sex===e.sex)),e.name);
    assert.deepEqual(R.worldRoster(s,e).map(b=>b.id),runners.map(b=>b.id));
  }
  assert.ok(R.validState(s));
});

test('short turf and dirt graded races can be chosen automatically and settled from existing saves',()=>{
  const s=R.initial(),b=R.own(s)[0];s.stage='running';s.week=38;s.money=1000000;
  Object.assign(b,{wins:2,races:2,birthYear:-2,lastRace:-100,policy:'challenge',condition:100,strain:0,health:0});
  b.genome.distance=[-.8,-.8];
  for(const [surface,week] of [['turf',32],['dirt',38]]){
    s.week=week;b.genome.traits.aptitude[surface]=[1,1];b.genome.traits.aptitude[surface==='turf'?'dirt':'turf']=[0,0];
    const e=R.nextRace(s,b);assert.ok(/^G/.test(e.level),e.name);assert.equal(e.surface,surface);assert.ok(e.distance<=1600);
  }
  const e=R.calendar(38).find(e=>e.referenceName==='東京盃');
  R.setSchedule(s,b.id,38,{mode:'race',eventId:e.id});R.advance(s);
  const record=b.records.find(r=>r.name===e.name);assert.ok(record);assert.equal(record.field.length,12);
  const loaded=R.deserializeState(R.serializeState(s));assert.ok(R.validState(loaded));
  assert.deepEqual(R.bird(loaded,b.id).records,b.records);
});
