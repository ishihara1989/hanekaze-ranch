'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const Replay=require('../public/js/race-replay.js');

test('gender pools contain hundreds of distinct kana stems and favor short meaningful words',()=>{
  for(const pool of Object.values(R.Names)){
    assert.ok(pool.length>=300);assert.equal(new Set(pool).size,pool.length);
    assert.ok(pool.every(word=>/^[ァ-ヺー]+$/.test(word)));
    assert.ok(pool.filter(word=>word.length<=5).length/pool.length>.9);
  }
  for(const word of ['ターボ','ジェット','ドラゴン','ライオン'])assert.ok(R.Names.M.includes(word)&&!R.Names.F.includes(word));
  for(const word of ['ローズ','サクラ','ルビー','パール'])assert.ok(R.Names.F.includes(word)&&!R.Names.M.includes(word));
});

test('configured ranch and affix placement survive saving while legacy saves retain their defaults',()=>{
  for(const position of ['prefix','suffix']){
    const settings={ranchName:'星空牧場',affix:'ホシ',position},s=R.initial(settings),b=R.createBird(s,{sex:'F'});
    assert.deepEqual(s.naming,settings);assert.equal(R.farmName(b,s),'星空牧場');
    assert.ok(position==='suffix'?b.name.endsWith('ホシ'):b.name.startsWith('ホシ'));
    const stem=position==='suffix'?b.name.slice(0,-2):b.name.slice(2);assert.ok(R.Names.F.includes(stem));
    const loaded=R.upgradeState(R.deserializeState(R.serializeState(s)));assert.deepEqual(loaded.naming,settings);assert.ok(R.validState(loaded));
  }
  const legacy=R.initial();delete legacy.naming;const rng=legacy.rng;
  assert.ok(R.validState(legacy));R.upgradeState(legacy);assert.deepEqual(legacy.naming,R.DEFAULT_NAMING);assert.equal(legacy.rng,rng);
  for(const settings of [{ranchName:''},{ranchName:'ア'.repeat(25)},{affix:'あお'},{affix:'アイウエオカキク'},{position:'middle'}])assert.throws(()=>R.initial(settings));
  for(const settings of [{ranchName:''},{affix:'アオ2'},{position:'middle'}]){const s=R.initial();Object.assign(s.naming,settings);assert.equal(R.validState(s),false);}
  for(const sex of ['M','F']){
    const s=R.initial({affix:'アドマイヤ',position:'suffix'}),b=R.createBird(s,{sex});assert.ok(b.name.endsWith('アドマイヤ'));assert.ok(R.validBirdName(b.name));
    const long=R.initial({affix:'アイウエオカキ'}),c=R.createBird(long,{sex});assert.ok(R.validBirdName(c.name));assert.ok(R.Names[sex].includes(c.name.slice(7)));
  }
});

test('every eligible stock name is used before kana fallback, preserving the whole affix and RNG',()=>{
  for(const sex of ['M','F'])for(const position of ['prefix','suffix']){
    const affix='ファイア',combine=w=>position==='prefix'?affix+w:w+affix;
    const s={week:9,serial:1,rng:123,birds:[],naming:{...R.DEFAULT_NAMING,affix,position}};
    const eligible=new Set(R.Names[sex].map(combine).filter(R.validBirdName));
    for(let i=0;i<eligible.size;i++){
      const name=R.generatedName(s,undefined,'',sex);assert.ok(eligible.has(name));
      assert.ok(!s.birds.some(b=>b.name===name));s.birds.push({id:`test-${i}`,name,role:'racing'});s.serial++;
    }
    const fallback=R.generatedName(s,undefined,'',sex);assert.ok(!eligible.has(fallback));assert.ok(R.validBirdName(fallback));
    assert.ok(position==='prefix'?fallback.startsWith(affix):fallback.endsWith(affix));assert.equal(s.rng,123);
  }
});

test('protection covers racing birds, pedigree sires, recent G1 winners, founders and hall members but expires for ordinary retirees',()=>{
  const year=31,s={week:(year-1)*R.YEAR+1,serial:0,birds:[]};
  const add=(id,extra={})=>{const b={id,name:`テスト${R.Names.M[s.birds.length]}`,sex:'M',role:'archived',kind:'general',parents:[],records:[],...extra};s.birds.push(b);return b;};
  const racing=add('racing',{role:'racing'}),sire=add('sire'),child=add('child',{sex:'F',parents:[sire.id,null]});
  const recent=add('recent',{sex:'F',records:[{year:12,level:'GI',rank:1}]}),old=add('old',{sex:'F',records:[{year:11,level:'GI',rank:1}]}),hall=add('hall',{hall:true}),founder=add('founder',{kind:'founder'}),root=add('root',{kind:'root'}),ordinary=add('ordinary');
  const loser=add('loser',{records:[{year:31,level:'GI',rank:2}]}),unfinished=add('unfinished',{records:[{year:31,level:'GI',rank:1,finished:false}]});
  const mare=add('mare',{sex:'F',role:'mare'});
  const names=R.unavailableNames(s);
  for(const b of [racing,sire,recent,hall,founder,root])assert.ok(names.has(b.name));
  for(const b of [child,old,ordinary,loser,unfinished,mare])assert.ok(!names.has(b.name));
  for(const root of R.ROOTS)assert.ok(names.has(root.name));
  // Reusing an unprotected retired name works, but a stock word blocked by a live name is skipped.
  const generated={week:9,serial:0,birds:[{id:'old',name:'ハネカゼターボ',role:'archived',sex:'F',records:[]}]};
  assert.equal(R.generatedName(generated),'ハネカゼターボ');generated.birds[0].role='racing';assert.notEqual(R.generatedName(generated),'ハネカゼターボ');
});

test('registration rejects protected or simultaneous duplicate names without any partial mutations',()=>{
  const s=R.initial(),a=R.createBird(s,{sex:'M'}),b=R.createBird(s,{sex:'F'});
  s.reports=[{id:`report-${s.serial++}`,type:'registration',birdIds:[a.id,b.id]}];
  const before=JSON.stringify(s);
  for(const name of [R.ROOTS[0].name,R.own(s)[0].name]){
    assert.throws(()=>R.acknowledge(s,{names:{[a.id]:'ターボ',[b.id]:name}}),/使われている/);assert.equal(JSON.stringify(s),before);
  }
  assert.throws(()=>R.acknowledge(s,{names:{[a.id]:'ローズ',[b.id]:'ローズ'}}),/使われている/);assert.equal(JSON.stringify(s),before);
  // A batch may swap its own temporary candidates because validation reserves the final names together.
  const names={[a.id]:b.name,[b.id]:a.name};R.acknowledge(s,{names});
  assert.equal(a.name,names[a.id]);assert.equal(b.name,names[b.id]);assert.ok(a.registered&&b.registered);
  assert.throws(()=>R.rename(s,a.id,'ターボ'),/登録済み/);
});

test('NPC racers and foundation birds use the matching gender stock until exhaustion',()=>{
  const s=R.initial();
  for(const sex of ['M','F']){
    const event={...R.calendar(9).find(e=>/^G/.test(e.level)),sex:sex==='F'?'F':undefined,id:`name-test-${sex}`,minAge:3,maxAge:3,distance:1800,surface:'turf',level:'GI'};
    for(const b of R.worldRoster(s,event).filter(b=>!b.filler)){
      const affix=R.MAJOR_FARMS.find(f=>f.name===b.farm).prefix;assert.ok(b.name.startsWith(affix));assert.ok(R.Names[sex].includes(b.name.slice(affix.length)));
      for(const id of b.parents){const p=R.bird(s,id);if(p.npcFoundation)assert.ok(R.Names[p.sex].includes(p.name.slice(affix.length)));}
    }
  }
});

test('all generated source, market, foundation, opponent and newborn names use two to nine katakana',()=>{
  const s=R.initial();assert.ok(s.birds.every(b=>R.validBirdName(b.name)));
  assert.ok(R.ROOTS.every(b=>R.validBirdName(b.name)));
  const child=R.createBird(s);assert.ok(R.validBirdName(child.name));
  s.week=49;const event=R.calendar(s.week).find(e=>e.level==='GI')||R.calendar(s.week)[0];
  assert.ok(R.worldRoster(s,event).every(b=>R.validBirdName(b.name)));
  for(let i=0;i<160;i++){
    const name=R.generatedName(s,'ファイア');assert.ok(R.validBirdName(name));
    assert.ok(!R.unavailableNames(s).has(name));s.birds.push({name,role:'racing'});s.serial++;
  }
});

test('rename and registration reject kanji, numbers, hiragana and invalid lengths atomically',()=>{
  const s=R.initial(),b=R.createBird(s),original=b.name;
  for(const name of ['ア','アイウエオカキクケコ','漢字','チョコボ2','チョコボ２','あおば','ア・オ','Aオ','ｱｵ']){
    assert.throws(()=>R.rename(s,b.id,name),/2〜9文字のカタカナ/);assert.equal(b.name,original);
  }
  for(const name of ['アオ','ヴァルキリー','アイウエオカキクケ']){R.rename(s,b.id,name);assert.equal(b.name,name);}
  const registered=R.own(s)[0];assert.throws(()=>R.rename(s,registered.id,'アオゾラ'),/登録済み/);
  const a=R.createBird(s),c=R.createBird(s);
  s.reports=[{id:`report-${s.serial++}`,type:'registration',birdIds:[a.id,c.id]}];
  const before=JSON.stringify(s);
  assert.throws(()=>R.acknowledge(s,{names:{[a.id]:'アオバ',[c.id]:'漢字'}}),/カタカナ/);
  assert.equal(JSON.stringify(s),before);
  R.acknowledge(s);assert.ok(a.registered&&c.registered);
});

test('legacy names migrate consistently across race fields and replay without altering identities or RNG',()=>{
  const s=R.initial(),mother=R.buy(s,s.sale[0]);R.breed(s,mother.id,R.sires(s)[0].id);
  while(s.reports.length)R.acknowledge(s);R.advance(s);
  const b=R.own(s).find(b=>b.records.length),r=b.records.at(-1),oldName='外枠新星 2026';
  b.name=oldName;
  for(const field of [r.field,r.replay.runners])field.find(x=>x.id===b.id).name=oldName;
  const before={rng:s.rng,id:b.id,parents:[...b.parents],time:r.time};
  assert.ok(R.validState(s));R.upgradeState(s);
  assert.ok(R.validBirdName(b.name));assert.equal(r.field.find(x=>x.id===b.id).name,b.name);
  assert.equal(r.replay.runners.find(x=>x.id===b.id).name,b.name);assert.ok(Replay.valid(r.replay,r));
  assert.deepEqual({rng:s.rng,id:b.id,parents:b.parents,time:r.time},before);
  const once=JSON.stringify(s);R.upgradeState(s);assert.equal(JSON.stringify(s),once);
});
