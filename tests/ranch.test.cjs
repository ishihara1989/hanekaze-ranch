'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../public/js/ranch-engine.js');
const W=require('../public/js/world.js');
const copy=s=>JSON.parse(JSON.stringify(s));
const read=s=>{while(s.reports.length)R.acknowledge(s);};
function founded(seed=20260930,mare=0,sire=0){const s=R.initial(seed);R.buy(s,s.sale[mare]);read(s);R.breed(s,R.own(s)[0].id,R.sires(s)[sire].id);read(s);return s;}
function progress(s,weeks){for(let i=0;i<weeks;i++){read(s);R.advance(s);}}
function racer(){const s=founded();progress(s,88);read(s);return {s,b:R.own(s).find(b=>b.role==='racing')};}

test('new ranch starts in March, empty, funded and guided; legacy saves are not accepted',()=>{
  const s=R.initial();assert.equal(s.week,9);assert.equal(s.money,20000);assert.equal(R.own(s).length,0);assert.equal(s.stage,'buy');assert.ok(R.validState(s));
  assert.equal(R.validState({version:3}),false);assert.throws(()=>R.advance(s),/迎え/);
  assert.equal(R.sires(s).filter(b=>b.kind==='root').length,32);assert.ok(R.sires(s).filter(b=>b.kind==='root').every(b=>R.age(s,b)===null));
});
test('purchase and breeding charge exactly once, reserve a foal stall, and produce inherited genes',()=>{
  const s=R.initial(),mother=R.bird(s,s.sale[0]),father=R.sires(s)[0];R.buy(s,mother.id);assert.equal(s.money,17200);assert.equal(s.stage,'breed');
  assert.throws(()=>R.buy(s,mother.id));read(s);R.breed(s,mother.id,father.id);assert.equal(s.money,16600);assert.equal(R.racingCount(s),1);assert.throws(()=>R.breed(s,mother.id,father.id));
  const genes=copy(mother.genome);progress(s,4);const child=R.own(s).find(b=>b.role==='young');assert.ok(child);assert.equal(s.week,13);assert.equal(R.age(s,child),0);assert.equal(R.racingCount(s),1);assert.equal(mother.pregnancy,null);
  for(const key in child.genome.quality)for(let i=0;i<32;i++){assert.ok(father.genome.quality[key][i].includes(child.genome.quality[key][i][0]));assert.ok(genes.quality[key][i].includes(child.genome.quality[key][i][1]));}
  assert.ok(s.reports.some(r=>r.type==='birth'));assert.ok(R.validState(s));
});
test('sale is seasonal and annual refresh leaves lineage records intact',()=>{
  const s=founded();progress(s,4);read(s);assert.equal(R.saleOpen(s),false);assert.throws(()=>R.buy(s,s.sale[1]),/2月/);
  const rootIds=R.sires(s).filter(b=>b.kind==='root').map(b=>b.id),publicId=R.sires(s).find(b=>b.owner==='public').id;
  progress(s,240);read(s);assert.ok(rootIds.every(id=>R.sires(s).some(b=>b.id===id)));assert.equal(R.bird(s,publicId).role,'archived');assert.ok(R.validState(s));
});
test('January registration uses calendar age, preserves choices, and week-only play reaches a race',()=>{
  const s=founded();progress(s,39);read(s);assert.equal(s.week,48);R.advance(s);assert.equal(s.week,49);assert.equal(R.age(s,R.own(s).find(b=>b.role==='young')),1);assert.ok(!s.reports.some(r=>r.type==='registration'));
  progress(s,48);assert.equal(s.week,97);assert.ok(s.reports.some(r=>r.type==='registration'));
  while(s.reports[0].type!=='registration')R.acknowledge(s);
  const id=s.reports[0].birdIds[0];R.acknowledge(s,{names:{[id]:'ハルノユメ'},policies:{[id]:'challenge'}});read(s);
  const b=R.bird(s,id);assert.equal(b.role,'racing');assert.equal(b.name,'ハルノユメ');assert.equal(b.policy,'challenge');
  progress(s,12);assert.ok(b.races>0);assert.ok(s.money>0);assert.equal(s.debt,0);assert.ok(R.validState(s));
});
test('breeding inherits genes, never parent training or learned personality',()=>{
  const a=founded(),b=copy(a);const ma=R.own(a)[0],mb=R.own(b)[0];
  Object.keys(mb.training).forEach(k=>mb.training[k]=1);Object.keys(mb.personality).forEach(k=>mb.personality[k]=150);
  progress(a,4);progress(b,4);const ca=R.own(a).find(x=>x.role==='young'),cb=R.own(b).find(x=>x.role==='young');
  assert.deepEqual(ca.genome,cb.genome);assert.deepEqual(ca.potential,cb.potential);assert.deepEqual(ca.inborn,cb.inborn);
});
test('reload keeps random stream, reports, finances and races deterministic without double payment',()=>{
  const {s,b}=racer();const loaded=copy(s);R.advance(s);R.advance(loaded);assert.deepEqual(s,loaded);assert.ok(R.validState(s));
  const result=b.records[0],paid=s.money;assert.ok(result);assert.throws(()=>R.race(s,b,W.calendar(result.week)[0]));assert.equal(s.money,paid);
});
test('all starter combinations can debut without extra purchases, loans or manual training',()=>{
  for(let mare=0;mare<3;mare++){
    let winningPairings=0;
    for(let sire=0;sire<R.ROOTS.length;sire++) {
      const s=founded(20260930,mare,sire);progress(s,150);read(s);const b=R.own(s).find(b=>b.role==='racing');
      assert.ok(b.races>0,`${mare}/${sire}`);assert.ok(b.records.every(r=>r.finished));assert.ok(s.money>0);assert.equal(s.debt,0);assert.ok(R.validState(s));
      if(b.wins>0)winningPairings++;
    }
    // Management/personality donors are breeding options, not guaranteed early winners.
    // Every starter mare must still have an accessible route to a first win.
    assert.ok(winningPairings>0,`first-win pairings for mare ${mare}`);
  }
});
test('winning unlocks one-time conversations, fan bonuses and research; race settlement is guarded',()=>{
  const {s,b}=racer();s.week=117;b.birthYear=0;b.wins=2;b.races=3;b.policy='challenge';b.registered=true;
  for(const key in b.potential){b.potential[key]=150;b.training[key]=1;}for(const key in b.personality)b.personality[key]=150;
  b.growth='early';const e=W.calendar(s.week).find(e=>e.name==='チョコボダービー');
  const result=R.race(s,b,e);assert.equal(result.rank,1);assert.ok(s.milestones.win);assert.ok(s.milestones.g1);assert.ok(s.milestones.derby);assert.ok(b.fans>=1200);
  const after=s.money;assert.throws(()=>R.race(s,b,e));assert.equal(s.money,after);
  assert.equal(R.facilityReason(s,'lab'),'');R.build(s,'lab');assert.equal(R.labLevel(s),1);
  R.build(s,'lab');assert.equal(R.labLevel(s),2);assert.equal(s.reports.filter(r=>r.title.includes('ダービー')).length,1);assert.ok(R.validState(s));
});
test('facility caps, cash guards and separate bird capacities are enforced',()=>{
  const s=founded();assert.match(R.facilityReason(s,'lab'),/GⅠ/);assert.throws(()=>R.build(s,'lab'));
  s.money=100000;for(let i=0;i<3;i++)R.build(s,'stalls');assert.deepEqual(R.capacity(s),{racing:32,mare:16,stud:16});assert.throws(()=>R.build(s,'stalls'),/最大/);
  s.money=0;assert.throws(()=>R.build(s,'pool'),/ギル/);assert.equal(s.facilities.pool,0);
});
test('pasture affects learning; training stays below inherited potential and recovery works',()=>{
  const a=founded();progress(a,4);read(a);const b=R.own(a).find(b=>b.role==='young'),baseline=copy(a),plain=R.bird(baseline,b.id);
  assert.throws(()=>R.setPasture(a,b.id,'forest'),/整備/);R.build(a,'forest');R.setPasture(a,b.id,'forest');progress(a,12);progress(baseline,12);
  assert.ok(b.personality.drive>plain.personality.drive);assert.ok(plain.personality.control>b.personality.control);
  const {s,b:runner}=racer();runner.condition=30;runner.strain=80;runner.health=4;s.facilities.clinic=2;s.facilities.spa=2;const races=runner.races;
  progress(s,1);assert.equal(runner.races,races);assert.equal(runner.health,1);assert.ok(runner.condition>30);assert.ok(runner.strain<80);
  for(const [key,value]of Object.entries(R.currentAbilities(s,runner)))assert.ok(value>=50&&value<=runner.potential[key]);
});
test('own stud breeding is free; founder offers require three individual GI-winning offspring and seven wins',()=>{
  const {s,b}=racer();b.sex='M';b.g1=2;read(s);R.retire(s,b.id);read(s);assert.equal(R.breedFee(b),0);assert.equal(R.founderEligible(s,b),false);
  const base=copy(b);for(let i=0;i<3;i++){const child={...copy(base),id:`bird-${s.serial++}`,parents:[b.id,R.own(s).find(x=>x.role==='mare').id],role:'retired',g1:i===0?5:1};s.birds.push(child);}
  assert.equal(R.founderEligible(s,b),true);assert.throws(()=>R.promote(s,b.id),/オファー/);
  s.week=144;R.advance(s);assert.ok(s.founderOffers.includes(b.id));R.promote(s,b.id);assert.equal(b.kind,'founder');assert.equal(R.age(s,b),null);
  const replacement=copy(b);replacement.id=`bird-${s.serial++}`;replacement.kind='home';replacement.parents=[b.id,base.parents[1]];s.birds.push(replacement);
  for(const x of s.birds.filter(x=>x.parents[0]===b.id&&x.id!==replacement.id))x.parents[0]=replacement.id;
  s.founderOffers.push(replacement.id);R.promote(s,replacement.id);assert.equal(b.role,'archived');assert.equal(s.birds.filter(x=>x.kind==='founder'&&x.lineage===b.lineage).length,1);
});
test('monthly goods decay over five years and hall of fame sales never reach zero',()=>{
  const {s,b}=racer();read(s);b.g1=3;b.fans=2000;b.retiredYear=1;b.hall=false;b.role='retired';s.facilities.shop=1;s.week=292;
  R.advance(s);assert.equal(s.ledger.filter(x=>x.week===292&&x.note.includes('グッズ')).length,0);read(s);s.week=296;b.hall=true;R.advance(s);assert.ok(s.ledger.some(x=>x.week===296&&x.note.includes('グッズ')&&x.amount>0));
});
test('reports block accidental progression; corrupt or malicious backup fields fail closed',()=>{
  const s=R.initial();R.buy(s,s.sale[0]);assert.throws(()=>R.advance(s),/報告/);assert.ok(R.validState(s));
  for(const edit of [x=>x.money=NaN,x=>x.birds[0].potential.cardio=151,x=>x.reports[0].expression='" onerror="alert(1)',x=>x.reports[0].results='bad',x=>x.birds[0].id='" onclick="x',x=>x.facilities.stalls=5,x=>x.birds[0].genome.quality=null]) {
    const malformed=copy(s);edit(malformed);assert.equal(R.validState(malformed),false);
  }
});
