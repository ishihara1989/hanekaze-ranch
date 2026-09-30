'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../public/js/ranch-engine.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const read=s=>{while(s.reports.length)R.acknowledge(s);};
const advance=(s,n)=>{for(let i=0;i<n;i++){read(s);R.advance(s);}};
const publicSires=s=>R.sires(s).filter(b=>b.owner==='public');

test('opening filly is ready for automatic racing and facilities require earned capital',()=>{
  const s=R.initial(),b=R.own(s)[0];
  assert.equal(b.sex,'F');assert.equal(R.age(s,b),2);assert.equal(b.role,'racing');
  assert.equal(b.registered,true);assert.equal(b.trainer,'moogle');assert.equal(b.policy,'steady');
  assert.ok(b.potential.power>=110);assert.equal(R.nextRace(s,b).week,s.week);
  for(const key of Object.keys(R.FACILITIES))assert.ok(R.facilityCost(s,key)>s.money,key);
  assert.match(R.facilityReason(s,'lab'),/レース初勝利/);
  s.money=R.facilityCost(s,'lab');s.milestones.win=9;
  R.build(s,'lab');assert.equal(R.labLevel(s),1);assert.equal(s.money,0);
});

test('fifty public sires have simulated wins, ten per cohort and every major racing route',()=>{
  const s=R.initial(),sires=publicSires(s);
  assert.equal(sires.length,50);
  for(const year of new Set(sires.map(b=>b.retiredYear)))assert.equal(sires.filter(b=>b.retiredYear===year).length,10);
  for(const b of sires){
    const wins=b.records.filter(r=>r.rank===1&&r.level==='GI');
    assert.equal(wins.length,b.g1);assert.ok(wins.length);
    for(const r of wins){assert.equal(r.field[0].id,b.id);assert.equal(r.time,r.field[0].time);assert.ok(r.finished);}
  }
  for(const route of ['sprint','mile','middle','long','dirt'])assert.ok(R.searchSires(s,{route}).length,route);
  const farmWins=sires.filter(b=>/アルテマ|メテオ/.test(b.farm)).length;
  assert.ok(farmWins>sires.length/2);
  assert.ok(R.validState(copy(s)));
});

test('purses, mare values and sire fees create a large separation from open racing',()=>{
  const s=R.initial(),events=Array.from({length:48},(_,i)=>R.calendar(i+1)).flat();
  assert.ok(events.filter(e=>e.level==='GI').every(e=>e.purse[0]>=100000000));
  assert.ok(events.filter(e=>e.level==='GIII').every(e=>e.purse[0]>=R.facilityCost(s,'lab')));
  assert.ok(events.filter(e=>!/^G/.test(e.level)).every(e=>e.purse[0]<=2600));
  const sires=publicSires(s),specialists=sires.filter(b=>b.records.filter(r=>r.rank===1&&r.level==='GI').every(r=>r.surface==='dirt'||r.distance<=1400));
  assert.ok(specialists.length);assert.ok(specialists.every(b=>R.studFee(b)>=300000&&R.studFee(b)<=1000000));
  assert.ok(sires.some(b=>R.studFee(b)>=30000000));
  const mares=s.sale.map(id=>R.bird(s,id));
  assert.ok(mares.some(b=>b.g1&&b.price>=100000000));
  assert.ok(mares.some(b=>!b.g1&&b.graded&&b.price>=10000000&&b.price<100000000));
  assert.ok(mares.some(b=>b.price<s.money));
});

test('other farms run G1s without player runners, report winners and contest annual awards',()=>{
  const s=R.initial();s.stage='running';R.own(s)[0].role='retired';
  advance(s,40);
  const weekly=s.journal.filter(r=>r.type==='weekly');
  const expected=Array.from({length:40},(_,i)=>R.calendar(i+9)).flat().filter(e=>e.level==='GI');
  assert.equal(weekly.flatMap(r=>r.notes).filter(n=>n.startsWith('GⅠ ')).length,expected.length);
  for(const e of expected){
    const winners=s.birds.filter(b=>b.records.some(r=>r.week===e.week&&r.name===e.name&&r.rank===1));
    assert.equal(winners.length,1,e.name);
    assert.ok(weekly.find(r=>r.week===e.week).notes.some(n=>n.includes(winners[0].name)&&n.includes(winners[0].farm)));
  }
  assert.equal(s.awards.length,10);assert.ok(s.awards.every(a=>a.farm!=='羽風牧場'&&a.points>0));
  assert.ok(s.awards.some(a=>a.title==='最優秀ダート'));
  assert.ok(R.validState(s));
});

test('annual public roster replaces exactly ten; expired sires retain their pedigree records',()=>{
  const s=R.initial();s.stage='running';R.own(s)[0].role='retired';
  let previous=publicSires(s).map(b=>b.id);
  for(let year=1;year<=6;year++){
    advance(s,year===1?40:48);
    const current=publicSires(s).map(b=>b.id);
    assert.equal(current.length,50);assert.equal(current.filter(id=>!previous.includes(id)).length,10);
    for(const id of previous.filter(id=>!current.includes(id))){assert.equal(R.bird(s,id).role,'archived');assert.ok(R.bird(s,id).records.length);}
    previous=current;
  }
  assert.ok(R.validState(s));assert.ok(JSON.stringify(s).length<3000000);
});

test('two player runners share the same G1 field and produce only one winner',()=>{
  const s=R.initial(),b=R.own(s)[0];s.stage='running';s.week=21;s.money=1000000;
  Object.assign(b,{birthYear:-2,sex:'M',wins:2,races:2,policy:'challenge',lastRace:-100});
  b.genome.distance=[.5,.5];
  const second=copy(b);second.id=`bird-${s.serial++}`;second.name='ハネカゼノツバサ';s.birds.push(second);
  assert.equal(R.nextRace(s,b).name,'チョコボダービー');
  const restored=copy(s);R.advance(s);R.advance(restored);assert.deepEqual(s,restored);
  assert.equal(b.records.length,1);assert.equal(second.records.length,1);
  assert.deepEqual(b.records[0].field,second.records[0].field);assert.notEqual(b.records[0].rank,second.records[0].rank);
  const winners=s.birds.filter(x=>x.records.some(r=>r.week===21&&r.rank===1));assert.equal(winners.length,1);
  assert.ok(s.reports.find(r=>r.type==='weekly').notes.some(n=>n.includes(winners[0].name)));
  assert.ok(R.validState(s));
});

test('search combines ranch or winning race names with route and prioritized traits',()=>{
  const s=R.initial();
  const filtered=R.searchSires(s,{query:'メテオ',route:'dirt',sort:'power'});
  assert.ok(filtered.length);assert.ok(filtered.every(b=>b.farm==='メテオ牧場'));
  assert.ok(filtered.every((b,i)=>!i||filtered[i-1].potential.power>=b.potential.power));
  assert.ok(R.searchSires(s,{query:'ダービー'}).every(b=>b.records.some(r=>r.name==='チョコボダービー'&&r.rank===1)));
  assert.equal(R.searchSires(s,{query:'存在しない名前'}).length,0);
});

test('rating boundaries are shared by ability and aptitude displays',()=>{
  assert.deepEqual([50,59,60,79,80,99,100,119,120,150].map(R.rating),['X','X','△','△','◯','◯','◎','◎','☆','☆']);
  const p=R.profile(R.own(R.initial())[0]);assert.equal(p.distance,'短距離寄り');assert.equal(p.style,'差し寄り');
  assert.equal(p.strengths.split('・').length,2);assert.equal(p.weaknesses.split('・').length,2);
});

test('pedigree honours adjust female lower and male upper bounds, with decay and duplicate protection',()=>{
  const s=R.initial(),sire=publicSires(s).find(b=>b.worldGroup==='long'),dam=R.bird(s,s.sale[0]);
  const bare=R.pedigreeBonus(s,sire,dam);assert.ok(bare.legs.upper>0);assert.equal(bare.legs.lower,0);
  dam.records=copy(sire.records);const paired=R.pedigreeBonus(s,sire,dam);
  assert.equal(paired.legs.lower,paired.legs.upper);assert.equal(paired.speed.lower,0);
  const ancestor=copy(dam);ancestor.id=`bird-${s.serial++}`;s.birds.push(ancestor);
  dam.records=[];dam.parents=[ancestor.id];sire.parents=[ancestor.id];
  const before=JSON.stringify(s),inbred=R.pedigreeBonus(s,sire,dam);
  assert.equal(JSON.stringify(s),before);assert.equal(inbred.legs.lower,paired.legs.lower*.5);
  ancestor.records=Array.from({length:100},()=>copy(sire.records.find(r=>r.rank===1)));
  assert.equal(R.pedigreeBonus(s,sire,dam).legs.lower,12);
});

test('birth sampling applies independent bounds reproducibly without changing the genetic center',()=>{
  const keys=R.Mapping.ABILITIES.map(a=>a.key),bounds=(lower,upper)=>Object.fromEntries(keys.map(k=>[k,{lower,upper}]));
  for(let seed=1;seed<=80;seed++){
    const sample=birthBounds=>R.Mapping.generate({quality:100,birthBounds,random:R.Mapping.seededRandom(seed)});
    const base=sample(bounds(0,0)),female=sample(bounds(8,0)),male=sample(bounds(0,8));
    for(const key of keys){assert.ok(base[key]>=80&&base[key]<=120);assert.ok(female[key]>=88&&female[key]<=120);assert.ok(male[key]>=80&&male[key]<=128);assert.ok(female[key]>=base[key]);assert.ok(male[key]>=base[key]);}
    assert.deepEqual(female,sample(bounds(8,0)));
  }
});

test('legacy upgrade preserves player data and RNG and adds the simulated market once',()=>{
  const s=R.initial();s.birds=s.birds.filter(b=>!b.farm);s.sale=s.sale.filter(id=>R.bird(s,id));delete s.worldVersion;
  const owned=copy(R.own(s)),rng=s.rng,money=s.money;
  assert.ok(R.validState(s));R.upgradeState(s);
  assert.deepEqual(R.own(s),owned);assert.equal(s.rng,rng);assert.equal(s.money,money);assert.equal(publicSires(s).length,50);
  const once=copy(s);R.upgradeState(s);assert.deepEqual(s,once);assert.ok(R.validState(s));
});

test('actual births apply career bonuses while preserving inherited alleles and reload determinism',()=>{
  const s=R.initial(),sire=publicSires(s).find(b=>b.worldGroup==='long'),dam=R.bird(s,s.sale[0]);
  s.money=100000000;R.buy(s,dam.id);read(s);R.breed(s,dam.id,sire.id);read(s);
  const without=copy(s);R.bird(without,sire.id).records=[];
  advance(s,4);advance(without,4);
  const child=R.own(s).find(b=>b.role==='young'),plain=R.own(without).find(b=>b.role==='young');
  assert.ok(child&&plain);assert.deepEqual(child.genome,plain.genome);
  assert.ok(child.potential.legs>plain.potential.legs);assert.equal(child.potential.speed,plain.potential.speed);
  assert.ok(R.validState(s));
});

test('a player sweep can renew real past champions rather than inventing winning records',()=>{
  const s=R.initial();s.stage='running';s.week=48;R.own(s)[0].role='retired';
  const entrants=publicSires(s),original=new Map(entrants.map(b=>[b.id,copy(b.records)]));
  R.advance(s);
  assert.equal(publicSires(s).length,50);
  const renewed=publicSires(s).filter(b=>b.retiredYear===2&&original.has(b.id));
  assert.ok(renewed.length>0);
  renewed.forEach(b=>assert.deepEqual(b.records,original.get(b.id)));
  assert.ok(R.validState(s));
});
