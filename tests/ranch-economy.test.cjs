'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const copy=x=>JSON.parse(JSON.stringify(x));
const read=s=>{while(s.reports.length)R.acknowledge(s);};
const advance=(s,n)=>{for(let i=0;i<n;i++){read(s);R.advance(s);}};
const publicSires=s=>R.sires(s).filter(b=>b.owner==='public');

test('selling mares uses sale valuation throughout the year and frees a stall while keeping ancestry and records',()=>{
  for(const category of ['ordinary','graded','g1']) {
    const s=R.initial(),b=category==='ordinary'?R.bird(s,s.sale[0]):R.bird(s,s.sale.find(id=>{const b=R.bird(s,id);return category==='g1'?b.g1:!b.g1&&b.graded;}));
    s.money=1000000000;R.buy(s,b.id);read(s);s.stage='running';s.week=17;
    const child=R.createBird(s,{sex:'M'},[R.sires(s)[0],b]);
    const before=copy(b),money=s.money,count=R.own(s).filter(b=>b.role==='mare').length,ledger=s.ledger.length;
    assert.equal(R.sellMare(s,b.id),R.marePrice(before));
    assert.equal(s.money,money+R.marePrice(before));assert.equal(s.ledger.length,ledger+1);
    assert.equal(R.own(s).filter(b=>b.role==='mare').length,count-1);
    assert.equal(R.bird(s,child.parents[1]),b);assert.deepEqual(b.records,before.records);assert.deepEqual(b.genome,before.genome);
    const after=copy(s);assert.throws(()=>R.sellMare(s,b.id),/所有する繁殖牝羽/);assert.deepEqual(s,after);
    const loaded=R.upgradeState(R.deserializeState(R.serializeState(s)));assert.ok(R.validState(loaded));assert.ok(!R.own(loaded).some(x=>x.id===b.id));
  }
});

test('mare sales reject invalid owners, roles and pregnancies without changing state and the first mare can be replaced',()=>{
  const s=R.initial(),b=R.buy(s,s.sale[0]);read(s);
  for(const id of [s.sale[1],R.own(s).find(b=>b.role==='racing').id,R.sires(s)[0].id,'missing']) {
    const before=copy(s);assert.throws(()=>R.sellMare(s,id));assert.deepEqual(s,before);
  }
  R.breed(s,b.id,R.sires(s)[0].id);const before=copy(s);
  assert.match(R.sellMareReason(s,b),/出産後/);assert.throws(()=>R.sellMare(s,b.id),/出産後/);assert.deepEqual(s,before);
  advance(s,4);read(s);assert.equal(b.pregnancy,null);R.sellMare(s,b.id);assert.ok(R.validState(s));
  const opening=R.initial(),first=R.buy(opening,opening.sale[0]);R.sellMare(opening,first.id);
  assert.equal(opening.stage,'buy');R.buy(opening,opening.sale[1]);assert.equal(opening.stage,'breed');
});

test('releasing a home stud frees its stall for a replacement and leaves an existing pregnancy and pedigree intact',()=>{
  const s=R.initial(),dam=R.buy(s,s.sale[0]);read(s);
  const sire=R.createBird(s,{sex:'M',role:'stud',kind:'home',birthYear:-3,retiredYear:1},[R.sires(s)[0],R.bird(s,s.sale[1])]);
  const records=copy(sire.records),money=s.money;
  R.breed(s,dam.id,sire.id);read(s);const pregnancy=copy(dam.pregnancy);
  for(let i=0;i<3;i++)R.createBird(s,{sex:'M',role:'stud',kind:'home'});
  const replacement=R.own(s).find(b=>b.role==='racing');replacement.sex='M';
  assert.throws(()=>R.retire(s,replacement.id),/羽房を拡張/);
  s.founderOffers.push(sire.id);s.reports.push({type:'founder',birdId:sire.id});
  R.releaseStud(s,sire.id);
  assert.equal(s.money,money);assert.equal(sire.released,true);assert.ok(!R.own(s).includes(sire));assert.ok(!R.sires(s).includes(sire));
  assert.deepEqual(dam.pregnancy,pregnancy);assert.deepEqual(sire.records,records);assert.ok(!s.founderOffers.includes(sire.id));assert.equal(s.reports.length,0);
  const before=JSON.stringify(s);assert.throws(()=>R.releaseStud(s,sire.id));assert.equal(JSON.stringify(s),before);
  assert.match(R.breedingReason(s,dam,sire),/種牡羽を選んで/);
  R.retire(s,replacement.id);read(s);assert.equal(R.own(s).filter(b=>b.role==='stud').length,R.capacity(s).stud);
  advance(s,4);read(s);const child=R.own(s).find(b=>b.parents[0]===sire.id);assert.ok(child);assert.equal(R.bird(s,child.parents[0]),sire);
  const loaded=R.upgradeState(R.deserializeState(R.serializeState(s)));assert.ok(R.validState(loaded));assert.equal(R.bird(loaded,sire.id).released,true);assert.ok(!R.sires(loaded).some(b=>b.id===sire.id));
});

test('only owned home studs can be released; sources, founders, public studs and racers stay intact',()=>{
  const s=R.initial(),founder=R.createBird(s,{sex:'M',role:'stud',kind:'founder'});
  for(const id of [R.own(s).find(b=>b.role==='racing').id,R.sires(s).find(b=>b.kind==='root').id,publicSires(s)[0].id,founder.id,s.sale[0],'missing']) {
    const before=copy(s);assert.throws(()=>R.releaseStud(s,id),/自家製種牡羽/);assert.deepEqual(s,before);
  }
});

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
  assert.ok(events.filter(e=>e.level==='open').every(e=>e.purse[0]>=100000&&e.purse[0]<1000000));
  assert.ok(events.filter(e=>['new','maiden','c1','c2','c3'].includes(e.level)).every(e=>e.purse[0]>=10000&&e.purse[0]<100000));
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

test('two player runners share the same G1 field and produce only one winner',()=>{
  const s=R.initial(),b=R.own(s)[0];s.stage='running';s.week=21;s.money=1000000;
  Object.assign(b,{birthYear:-2,sex:'M',wins:2,races:2,policy:'challenge',lastRace:-100});
  b.genome.distance=[.5,.5];
  b.genome.traits.aptitude.turf=[1,1];b.genome.traits.aptitude.dirt=[0,0];
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
  const farm=R.searchSires(s,{route:'dirt'})[0].farm;
  const filtered=R.searchSires(s,{query:farm,route:'dirt',sort:'power'});
  assert.ok(filtered.length);assert.ok(filtered.every(b=>b.farm===farm));
  assert.ok(filtered.every((b,i)=>!i||filtered[i-1].potential.power>=b.potential.power));
  assert.ok(R.searchSires(s,{query:'ダービー'}).every(b=>b.records.some(r=>r.name.includes('ダービー')&&r.rank===1)));
  assert.equal(R.searchSires(s,{query:'存在しない名前'}).length,0);
});

test('offspring order combines search filters and ranks the selected pairing without consuming randomness',()=>{
  const s=R.initial(),dam=R.bird(s,s.sale[0]),before=JSON.stringify(s);
  const average=b=>Object.values(R.breedingExpectation(s,b,dam)).reduce((n,v)=>n+v,0)/8;
  const sorted=R.searchSires(s,{sort:'offspring',dam});
  assert.ok(sorted.every((b,i)=>!i||average(sorted[i-1])>=average(b)));
  const target=sorted.find(b=>b.records.some(r=>r.level==='GI'&&r.rank===1&&r.surface==='dirt'));
  const rating=R.geneticTraitRating(target,'power');
  const filtered=R.searchSires(s,{sort:'offspring',dam,route:'dirt',query:target.farm,geneticFilters:[{trait:'power',rating}]});
  assert.ok(filtered.includes(target));
  assert.deepEqual(filtered,sorted.filter(b=>b.farm===target.farm&&R.geneticTraitRating(b,'power')===rating&&b.records.some(r=>r.level==='GI'&&r.rank===1&&r.surface==='dirt')));
  assert.deepEqual(R.searchSires(s,{sort:'offspring'}),R.searchSires(s,{sort:'fee'}));
  assert.equal(JSON.stringify(s),before);
});

test('sire genetic search uses inherited aggregate ratings and combines all conditions with text and route',()=>{
  const s=R.initial(),original=JSON.stringify(s);
  const candidate=publicSires(s).find(b=>b.records.some(r=>r.level==='GI'&&r.rank===1&&r.surface==='dirt'));
  const filters=['power','recovery',Object.keys(R.PERSONALITY)[0]].map(trait=>({trait,rating:R.geneticRating(R.geneticScores(candidate)[trait])}));
  const result=R.searchSires(s,{query:candidate.name,route:'dirt',geneticFilters:filters});
  assert.deepEqual(result.map(b=>b.id),[candidate.id]);
  assert.equal(R.searchSires(s,{query:candidate.name,route:'dirt',geneticFilters:[...filters,{trait:'power',rating:filters[0].rating==='☆'?'X':'☆'}]}).length,0);
  assert.equal(R.searchSires(s,{geneticFilters:[{trait:'unknown',rating:'☆'}]}).length,0);
  assert.equal(R.searchSires(s,{geneticFilters:[{trait:'power',rating:'invalid'}]}).length,0);
  assert.deepEqual(R.searchSires(s,{geneticFilters:[{trait:'',rating:'☆'}]}),R.searchSires(s));
  candidate.potential.power=R.geneticScores(candidate).power>=110?50:150;
  assert.deepEqual(R.searchSires(s,{query:candidate.name,geneticFilters:[filters[0]]}).map(b=>b.id),[candidate.id],'search ignores current/potential ability values');
  candidate.potential.power=JSON.parse(original).birds.find(b=>b.id===candidate.id).potential.power;
  assert.equal(JSON.stringify(s),original,'search changes neither game data nor random state');
});

test('genetic search respects all five grades, expressed defects and the distinct course scale',()=>{
  const s=R.initial(),b=publicSires(s)[0];
  b.genome.distance=[0,0];b.genome.release=[0,0];b.genome.defects={};
  for(const [alleles,rating] of [[0,'X'],[6,'△'],[12,'◯'],[18,'◎'],[24,'☆']]){
    b.genome.quality.power=Array.from({length:32},(_,i)=>[Number(i<alleles),Number(i<alleles)]);
    assert.equal(R.geneticTraitRating(b,'power'),rating);
    assert.ok(R.searchSires(s,{geneticFilters:[{trait:'power',rating}]}).includes(b));
  }
  const defect=Object.keys(R.DEFECTS).find(id=>R.DEFECTS[id].trait==='power');
  b.genome.defects[defect]=Array.from({length:R.Breeding.DEFECT_LOCI},()=>[1,1]);
  assert.notEqual(R.geneticTraitRating(b,'power'),'☆');
  assert.ok(!R.searchSires(s,{geneticFilters:[{trait:'power',rating:'☆'}]}).includes(b));
  b.genome.traits.aptitude.turf=[.6,.6];b.genome.traits.aptitude.rightTurn=[.6,.6];b.genome.traits.development.earlyGrowth=[.6,.6];
  assert.equal(R.geneticTraitRating(b,'turf'),'☆');assert.equal(R.geneticTraitRating(b,'rightTurn'),'◯');assert.equal(R.geneticTraitRating(b,'earlyGrowth'),'☆');
  assert.ok(R.searchSires(s,{geneticFilters:[{trait:'turf',rating:'☆'},{trait:'rightTurn',rating:'◯'},{trait:'earlyGrowth',rating:'☆'}]}).includes(b));
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
  // Make non-public past winners unavailable, so the season must renew public champions.
  for(const b of s.birds)if(b.owner!=='player'&&b.owner!=='public'&&b.sex==='M'&&b.g1)b.retiredYear=1;
  R.advance(s);
  assert.equal(publicSires(s).length,50);
  const renewed=publicSires(s).filter(b=>b.retiredYear===2&&original.has(b.id));
  assert.ok(renewed.length>0);
  renewed.forEach(b=>assert.deepEqual(b.records,original.get(b.id)));
  assert.ok(R.validState(s));
});
