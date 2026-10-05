'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const W=require('../public/js/world.js');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
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
      const key=name==='オーディーン賞（秋）'?'stakes-odin-autumn':name==='光の戦士ステークス'?'stakes2':'stakes';
      const id=`${old[0]+year*48}:${key}`;
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

test('autumn triple crown allows all three bookings at four-week intervals across years',()=>{
  for(const year of [0,1,10]){
    const s=R.initial(),b=R.own(s)[0],offset=year*48;
    Object.assign(s,{week:40+offset,stage:'running'});
    Object.assign(b,{birthYear:year-3,wins:4,races:4,lastRace:36+offset});
    const events=R.TITLES.autumn.map(name=>annual().find(e=>e.name===name));
    assert.deepEqual(events.map(e=>e.week),[40,44,48]);
    assert.deepEqual(R.date(events[0].week),{year:1,week:40,month:10,monthWeek:4});
    for(const e of events){
      const week=e.week+offset,event=R.calendar(week).find(r=>r.name===e.name);
      s.week=week;
      assert.ok(R.raceOptions(s,b,week).some(r=>r.id===event.id),e.name);
      R.setSchedule(s,b.id,week,{mode:'race',eventId:event.id});
      assert.equal(R.nextRace(s,b).id,event.id);
      if(e.week<48){
        const next=events[events.indexOf(e)+1],nextWeek=next.week+offset;
        R.setSchedule(s,b.id,nextWeek,{mode:'race',eventId:R.calendar(nextWeek).find(r=>r.name===next.name).id});
      }
      b.lastRace=week;
      delete b.schedule[week];
    }
    assert.ok(!R.calendar(41+offset).some(e=>e.name===R.TITLES.autumn[0]));
  }
});

test('moving autumn Odin preserves the IDs of other October and November stakes',()=>{
  const expected=[
    [40,'stakes','オメガ賞'],[40,'stakes2','アルテミスセイレーン賞'],
    [40,'stakes3','オニオンファンタジー賞'],[40,'stakes4','若羽エーデルワイス賞'],
    [41,'stakes2','若羽王冠スプリント'],[41,'stakes3','王宮みやこステークス'],
    [41,'stakes4','CRAダート若羽優駿'],[41,'stakes5','CRAダートレディスクラシック'],
    [41,'stakes6','CRAダートスプリント'],[41,'stakes7','CRAダートクラシック'],
  ];
  for(const year of [0,1,10]){
    for(const [week,key,name] of expected)assert.equal(W.eventById(`${week+year*48}:${key}`).name,name);
    assert.equal(W.eventById(`${41+year*48}:stakes`),undefined);
  }
});

test('legacy autumn Odin bookings load and migrate without changing other saved progress',()=>{
  for(const year of [0,1,10]){
    const s=R.initial(),offset=year*48;
    s.week=38+offset;R.upgradeState(s);
    const b=R.own(s)[0];b.lastRace=36+offset;
    b.schedule={[41+offset]:{mode:'race',eventId:`${41+offset}:stakes`},[42+offset]:{mode:'rest'}};
    const expected=structuredClone(s);
    expected.birds.find(r=>r.id===b.id).schedule={
      [40+offset]:{mode:'race',eventId:`${40+offset}:stakes-odin-autumn`},[42+offset]:{mode:'rest'},
    };
    const restored=R.deserializeState(R.serializeState(s));
    assert.ok(R.validState(restored),'old reservation remains readable before upgrade');
    R.upgradeState(restored);
    assert.ok(R.validState(restored));assert.deepEqual(restored,expected);
    R.upgradeState(restored);assert.deepEqual(restored,expected);
  }
});

test('unavailable legacy autumn bookings cancel only that reservation and invalid IDs stay rejected',()=>{
  for(const conflict of ['elapsed','rest','lastRace','nearbyRace']){
    const s=R.initial();s.week=conflict==='elapsed'?41:38;R.upgradeState(s);
    const b=R.own(s)[0];b.schedule={41:{mode:'race',eventId:'41:stakes'}};
    if(conflict==='rest')b.schedule[40]={mode:'rest'};
    if(conflict==='lastRace')b.lastRace=37;
    if(conflict==='nearbyRace')b.schedule[43]={mode:'race',eventId:R.calendar(43)[0].id};
    const expected=structuredClone(s);delete expected.birds.find(r=>r.id===b.id).schedule[41];
    assert.ok(R.validState(s));R.upgradeState(s);
    assert.ok(R.validState(s));assert.deepEqual(s,expected);
  }
  for(const id of ['41:missing','40:stakes-missing','89:stakes']){
    const s=R.initial();s.week=38;R.own(s)[0].schedule={41:{mode:'race',eventId:id}};
    assert.equal(R.validState(s),false);
  }
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
  Object.assign(b,{wins:3,races:3,birthYear:-2,lastRace:-100,policy:'challenge',condition:100,strain:0,health:0});
  b.genome.distance=[-.8,-.8];
  Object.assign(b.potential,{speed:150,cardio:65,power:150,reserve:150,legs:65,economy:65,start:150,resilience:65});
  for(const key in b.training)b.training[key]=1;
  for(const key in b.personality)b.personality[key]=100;
  for(const key in b.genome.traits.aptitude)b.genome.traits.aptitude[key]=[.5,.5];
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
