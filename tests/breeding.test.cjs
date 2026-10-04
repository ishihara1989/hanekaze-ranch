'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const B=R.Breeding,copy=x=>JSON.parse(JSON.stringify(x));
const scratch=(rng=1)=>({week:9,rng,serial:1,birds:[]});
function fruitPair(seed=1) {
  const s=R.initial(seed),dam=R.bird(s,s.sale[0]),sire=R.sires(s)[0];
  s.money=100000;R.buy(s,dam.id);while(s.reports.length)R.acknowledge(s);
  return {s,dam,sire};
}

test('sex-selection fruit requires research and the full fee before any state changes',()=>{
  const {s,dam,sire}=fruitPair();
  for(const fruit of ['karabu','zeio','unknown','toString']) {
    const before=copy(s);
    assert.throws(()=>R.breed(s,dam.id,sire.id,fruit),/研究所Lv1|産み分けの実/);
    assert.deepEqual(s,before);
  }
  s.facilities.lab=1;s.money=R.breedFee(sire)+999;
  const before=copy(s);
  assert.match(R.breedingReason(s,dam,sire,'zeio'),/ギルが足りません/);
  assert.throws(()=>R.breed(s,dam.id,sire.id,'zeio'),/ギルが足りません/);
  assert.deepEqual(s,before);
  s.money++;R.breed(s,dam.id,sire.id,'zeio');assert.equal(s.money,0);
});

test('both fruits cost 1000 gil and guarantee sex across saved pregnancies and different hatch RNGs',()=>{
  for(const [fruit,sex] of [['karabu','M'],['zeio','F']]) {
    const {s,dam,sire}=fruitPair(41);s.facilities.lab=1;
    const money=s.money,rng=s.rng;
    R.breed(s,dam.id,sire.id,fruit);
    assert.equal(s.money,money-R.breedFee(sire)-1000);assert.equal(s.rng,rng);
    assert.equal(dam.pregnancy.fruit,fruit);assert.ok(R.validState(s));
    assert.equal(s.ledger.at(-1).amount,-1000);assert.match(s.ledger.at(-1).note,new RegExp(R.BREEDING_FRUITS[fruit].name));
    const saved=R.serializeState(s);
    for(const seed of [1,17,987654]) {
      const restored=R.deserializeState(saved);restored.rng=seed;
      for(let i=0;i<R.GESTATION;i++){while(restored.reports.length)R.acknowledge(restored);R.advance(restored);}
      const child=restored.birds.find(b=>b.parents[1]===dam.id&&b.bornWeek===restored.week);
      assert.ok(child);assert.equal(child.sex,sex);assert.ok(R.validState(restored));
    }
    const bad=copy(s);R.bird(bad,dam.id).pregnancy.fruit='unknown';assert.equal(R.validState(bad),false);
  }
});

test('no fruit preserves the original payment, pregnancy and random birth results',()=>{
  const {s,dam,sire}=fruitPair(31),other=copy(s);
  R.breed(s,dam.id,sire.id);R.breed(other,dam.id,sire.id,'none');
  assert.deepEqual(dam.pregnancy,{sireId:sire.id,due:s.week+R.GESTATION});
  assert.deepEqual(s,other);
  for(const state of [s,other])for(let i=0;i<R.GESTATION;i++){while(state.reports.length)R.acknowledge(state);R.advance(state);}
  assert.deepEqual(s,other);
});
function tree(){
  const birds=new Map();
  const add=(id,...parents)=>{const b={id,name:id,parents};birds.set(id,b);return b;};
  return {add,lookup:id=>birds.get(id)};
}

test('blood is the sum of positions; induced parent crosses are suppressed, independent copies restored',()=>{
  const {add,lookup}=tree();add('older');add('cross','older');
  const father=add('father','cross'),mother=add('mother','cross');
  let crosses=B.crosses([father,mother],lookup);
  assert.deepEqual(crosses.map(c=>[c.id,c.positions,c.blood,c.benefitRate,c.defectRate]),[['cross',[2,2],.5,1,.25]]);
  mother.parents.push('older');crosses=B.crosses([father,mother],lookup);
  assert.deepEqual(crosses.find(c=>c.id==='older').positions,[2,3,3]);
  assert.equal(crosses.find(c=>c.id==='older').blood,.5);
  assert.deepEqual(B.crosses([lookup('cross'),father],lookup).map(c=>[c.id,c.blood,c.benefitRate,c.defectRate]),[['cross',.75,1,.375]]);
  add('sibling','older');father.parents=['cross','sibling'];mother.parents=['cross','sibling'];
  assert.deepEqual(B.crosses([father,mother],lookup).map(c=>c.id).sort(),['cross','sibling']);
});

test('4 x 4 x 5, same-side repeats and the five-generation boundary are counted without path collapse',()=>{
  const {add,lookup}=tree();add('older');add('cross','older');
  add('a','cross');add('b','cross');add('extra','older');add('extra2','extra');add('extra3','extra2');
  const father=add('father','a'),mother=add('mother','b','extra3');
  const crosses=B.crosses([father,mother],lookup),older=crosses.find(c=>c.id==='older');
  assert.deepEqual(older.positions,[4,4,5]);assert.equal(older.blood,.15625);
  assert.equal(older.benefitRate,.3125);assert.equal(older.defectRate,.078125);
  assert.equal(B.crosses([father,mother],lookup,4).some(c=>c.id==='older'),false);
  const oneSide=add('oneSide','a','b');assert.deepEqual(B.crosses([oneSide,null],lookup).map(c=>c.id),['cross']);
  assert.equal(B.crosses([father,add('unrelated')],lookup).length,0);
});

test('all source defects are recessive, graded by locus, and disjoint across sources',()=>{
  const s=R.initial(),roots=s.birds.filter(b=>b.kind==='root');
  const carriers=new Map();
  for(const b of roots){
    const summary=B.defectSummary(b.genome,R.DEFECTS);
    assert.equal(summary.filter(d=>d.active===4).length,1);assert.equal(summary.filter(d=>d.carried===4).length,1);
    for(const id of Object.keys(b.genome.defects)){assert.ok(!carriers.has(id));carriers.set(id,b.id);}
  }
  const rng=R.Mapping.seededRandom(13);
  for(let i=0;i<32;i++)for(let j=i+1;j<32;j++){
    const g={defects:B.inheritDefects([roots[i],roots[j]],rng)};
    assert.ok(Object.values(B.penalties(g,R.DEFECTS)).every(n=>n===0));
  }
  for(const trait of ['frailty','temper']){
    const [id]=Object.entries(R.DEFECTS).find(([,d])=>d.trait===trait&&!d.carrier);
    const g={defects:{[id]:Array.from({length:4},()=>[0,1])}};
    assert.ok(Object.values(B.penalties(g,R.DEFECTS)).every(n=>n===0));
    for(let n=1;n<=4;n++){
      g.defects[id][n-1]=[1,1];assert.ok(Object.values(B.penalties(g,R.DEFECTS)).every(v=>v===n*B.DEFECT_STEP));
    }
  }
});

test('Aa x Aa segregates 1:2:1; carriers do not lower potential, health or temperament',()=>{
  const base=copy(R.initial().birds.find(b=>b.kind==='root'&&b.lineage==='root-6').genome);
  base.defects={};
  const id='root-6-weak',carrier={genome:{defects:{[id]:Array.from({length:4},()=>[0,1])}}};
  const counts=[0,0,0],rng=R.Mapping.seededRandom(67);
  for(let i=0;i<20000;i++){
    const loci=B.inheritDefects([carrier,carrier],rng)[id]||Array.from({length:4},()=>[0,0]);counts[loci[0][0]+loci[0][1]]++;
  }
  [.25,.5,.25].forEach((rate,i)=>assert.ok(Math.abs(counts[i]/20000-rate)<.015));
  const plain=R.createBird(scratch(77),{genome:copy(base)});
  const carried=R.createBird(scratch(77),{genome:{...copy(base),defects:copy(carrier.genome.defects)}});
  assert.deepEqual(carried.potential,plain.potential);assert.deepEqual(carried.management,plain.management);assert.deepEqual(carried.inborn,plain.inborn);
  const affected=R.createBird(scratch(77),{genome:{...copy(base),defects:{[id]:Array.from({length:4},()=>[1,1])}}});
  assert.equal(affected.management.robustness,plain.management.robustness-8);assert.equal(affected.management.recovery,plain.management.recovery-8);
  assert.deepEqual(R.constitution(carried),R.constitution(plain));
  assert.equal(R.constitution(affected).illnessChance,.004);assert.equal(R.constitution(affected).recoveryWeeks,4);
  const temperId=Object.keys(R.DEFECTS).find(k=>R.DEFECTS[k].trait==='temper');
  const difficult=R.createBird(scratch(77),{genome:{...copy(base),defects:{[temperId]:Array.from({length:4},()=>[1,1])}}});
  assert.equal(difficult.inborn.control,plain.inborn.control-8);assert.equal(difficult.personality.crowd,plain.personality.crowd-8);
});

test('mutation probabilities add per locus and cap at 100%, with a separate defect lottery',()=>{
  const s=R.initial(),a=s.birds.find(b=>b.lineage==='root-0'),b={...copy(a),id:'copy'};
  const id='root-0-weak',locus=a.genome.quality.speed.findIndex(p=>p[0]===1);
  const lookup=x=>x===a.id?a:b;
  const plan=B.mutationPlan([{id:a.id,blood:.3},{id:b.id,blood:.3}],lookup,()=>['speed']);
  assert.equal(plan.find(p=>p.group==='quality'&&p.key==='speed'&&p.locus===locus).rate,1);
  assert.equal(plan.find(p=>p.group==='defects'&&p.key===id).rate,.3);
  const huge=B.mutationPlan([{id:a.id,blood:3}],lookup,()=>['speed']);assert.ok(huge.every(p=>p.rate<=1));
  const rng=R.Mapping.seededRandom(53),trials=20000;let benefit=0,defect=0;
  const partial=plan.filter(p=>p.group==='quality'&&p.key==='speed'&&p.locus===locus||p.group==='defects'&&p.key===id&&p.locus===0);
  partial[0].rate=.6;
  for(let i=0;i<trials;i++){
    const g={quality:{speed:Array.from({length:32},()=>[0,1])},defects:{}};B.mutate(g,partial,rng);
    if(g.quality.speed[locus][0]===1)benefit++;if(g.defects[id])defect++;
  }
  assert.ok(Math.abs(benefit/trials-.6)<.015);assert.ok(Math.abs(defect/trials-.3)<.015);
});

test('allowed 2 x 3 source crosses give positive average gains with recessive costs',t=>{
  const roots=R.initial().birds.filter(b=>b.kind==='root');
  let gain=0,defectCost=0,affected=0,trials=0;
  for(const root of roots){
    const s=scratch(234);s.birds=[copy(root)];s.serial=5000;
    const plain=R.createBird(s,{sex:'F'});plain.id='unrelated';
    const father=R.createBird(s,{sex:'M'},[root,plain]),grandmother=R.createBird(s,{sex:'F'},[root,plain]);
    if(!father||!grandmother)continue;
    const outsider=R.createBird(s,{sex:'M'}),mother=R.createBird(s,{sex:'F'},[outsider,grandmother]);
    if(!mother)continue;
    // The unrelated foundation is not itself a shared ancestor in this comparison.
    father.parents[1]=null;grandmother.parents[1]=null;mother.parents[0]=null;
    assert.deepEqual(R.breedingCrosses(s,father,mother).map(c=>c.positions),[[2,3]]);assert.equal(R.crossRisk(s,father,mother),null);
    const plan=R.crossPlan(s,father,mother),rng=R.Mapping.seededRandom(25);
    for(let i=0;i<80;i++){
      const g=copy(father.genome);g.quality=Object.fromEntries(Object.keys(g.quality).map(k=>[k,g.quality[k].map((_,l)=>[father.genome.quality[k][l][rng()<.5?0:1],mother.genome.quality[k][l][rng()<.5?0:1]])]));
      g.character=Object.fromEntries(Object.keys(g.character).map(k=>[k,[father.genome.character[k][rng()<.5?0:1],mother.genome.character[k][rng()<.5?0:1]]]));
      g.defects=B.inheritDefects([father,mother],rng);const before=copy(g);
      B.mutate(g,plan,rng);
      gain+=Object.values(R.quality(g)).reduce((a,b)=>a+b,0)-Object.values(R.quality(before)).reduce((a,b)=>a+b,0);
      gain+=Object.keys(g.character).reduce((n,k)=>n+R.Genetics.mean(g.character[k])-R.Genetics.mean(before.character[k]),0);
      const cost=Object.values(B.penalties(g,R.DEFECTS)).reduce((a,b)=>a+b,0);defectCost+=cost;if(cost)affected++;trials++;
    }
  }
  t.diagnostic(`trials=${trials}, mean beneficial gain=${(gain/trials).toFixed(3)}, mean recessive cost=${(defectCost/trials).toFixed(3)}`);
  assert.ok(affected>0);assert.ok(defectCost>0);assert.ok(gain>defectCost,`mean gain ${gain/trials}, defects ${defectCost/trials}`);
});

test('sale mares inherit a real source father; all racing and market NPCs inherit actual parents',()=>{
  const s=R.initial();
  for(const b of s.sale.slice(0,3).map(id=>R.bird(s,id))){
    assert.equal(b.parents.length,2);assert.equal(b.parents[1],null);const father=R.bird(s,b.parents[0]);assert.equal(father.kind,'root');
    for(const [key,loci] of Object.entries(b.genome.quality))loci.forEach((p,i)=>assert.ok(father.genome.quality[key][i].includes(p[0])));
    for(const [key,pair] of Object.entries(b.genome.character))assert.ok(father.genome.character[key].includes(pair[0]));
    assert.ok(B.defectSummary(b.genome,R.DEFECTS).every(d=>d.active===0));
  }
  const npcs=s.birds.filter(b=>b.farm&&!b.npcFoundation);assert.ok(npcs.length>100);
  for(const b of npcs){
    assert.equal(b.parents.length,2);
    b.parents.forEach((id,i)=>{const parent=R.bird(s,id);assert.ok(parent);assert.equal(parent.sex,i?'F':'M');assert.ok(parent.birthYear<=b.birthYear-3);});
    assert.equal(R.crossRisk(s,...b.parents.map(id=>R.bird(s,id))),null);
    assert.ok(R.pedigree(s,b).some(row=>row.depth>=1));
  }
  assert.ok(npcs.some(b=>b.parents.some(id=>R.bird(s,id).parents.length)));
  const before=copy(s);
  const ordinary=R.worldRoster(s,R.calendar(s.week).find(e=>e.level==='new'));
  assert.deepEqual(s,before);
  assert.ok(ordinary.filter(b=>!b.filler).every(b=>!s.birds.includes(b)&&b.temporary&&b.parents.length===0));
  assert.ok(ordinary.filter(b=>b.filler).every(b=>!s.birds.includes(b)&&b.genome===undefined));
  const saved=R.serializeState(s);assert.deepEqual(R.deserializeState(saved),s);assert.ok(R.validState(R.deserializeState(saved)));
  const bytes=Buffer.byteLength(saved,'utf8');
  assert.ok(bytes<8*1024*1024,`initial save bytes: ${bytes}`);
});

test('crossed births replay exactly, and invalid recessive genes, packed saves and cyclic pedigrees are rejected',()=>{
  const s=R.initial(),dam=R.bird(s,s.sale[0]),source=R.bird(s,dam.parents[0]);
  const sire=R.createBird(s,{sex:'M',role:'stud',owner:'public',retiredYear:1},[source,R.bird(s,s.sale[1])]);
  const intermediary=R.createBird(s,{sex:'M',owner:'archive',role:'archived'},[source,R.bird(s,s.sale[2])]);
  dam.parents=[intermediary.id,null];sire.fee=600;s.money=1000000;
  R.buy(s,dam.id);while(s.reports.length)R.acknowledge(s);R.breed(s,dam.id,sire.id);
  const restored=R.deserializeState(R.serializeState(s));
  for(const state of [s,restored])for(let i=0;i<4;i++){while(state.reports.length)R.acknowledge(state);R.advance(state);}
  assert.deepEqual(s,restored);assert.ok(R.validState(s));
  const bad=copy(s);bad.birds[0].genome.defects['unknown']=[[0,1]];assert.equal(R.validState(bad),false);
  const cycle=copy(s);cycle.birds[0].parents=[cycle.birds[0].id];assert.equal(R.validState(cycle),false);
  const packed=JSON.parse(R.serializeState(s));packed.birds[0].genome.quality.speed='x'.repeat(32);assert.throws(()=>R.deserializeState(JSON.stringify(packed)));
});

test('2 x 3 is allowed; 2 x 2, parent crosses and multi-cross blood above 37.5% reject before payment',()=>{
  const s=R.initial(),dam=R.bird(s,s.sale[0]),source=R.bird(s,dam.parents[0]);R.buy(s,dam.id);s.money=1000000;
  const make=(name,parents,sex,role,owner)=>{const b={...copy(source),id:`bird-${s.serial++}`,name,parents,sex,role,owner,kind:'home',retiredYear:1};s.birds.push(b);return b;};
  const sire=make('父候補',[source.id,null],'M','stud','player');
  const before=copy({money:s.money,rng:s.rng,bredYear:dam.bredYear,pregnancy:dam.pregnancy,ledger:s.ledger});
  assert.match(R.breedingReason(s,dam,sire),/2×2.*危険/);assert.throws(()=>R.breed(s,dam.id,sire.id),/2×3（37.5%）まで/);
  assert.deepEqual({money:s.money,rng:s.rng,bredYear:dam.bredYear,pregnancy:dam.pregnancy,ledger:s.ledger},before);
  assert.match(R.breedingReason(s,dam,source),/1×2.*危険/);
  const grand=make('母方祖父',[source.id,null],'M','archived','archive');dam.parents=[grand.id,null];
  assert.equal(R.breedingReason(s,dam,sire),'');assert.equal(R.breedingCrosses(s,sire,dam)[0].blood,.375);
  const extra=make('別経路',[source.id,null],'F','archived','archive');grand.parents[1]=extra.id;
  assert.equal(R.breedingCrosses(s,sire,dam)[0].blood,.4375);assert.match(R.breedingReason(s,dam,sire),/危険/);
  grand.parents[1]=null;R.breed(s,dam.id,sire.id);assert.equal(dam.pregnancy.sireId,sire.id);
});

test('pre-breeding saves receive neutral genes and marked pedigrees once, retaining scores, pregnancy and RNG',()=>{
  const s=R.initial(),dam=R.bird(s,s.sale[0]);R.buy(s,dam.id);
  const father=R.bird(s,dam.parents[0]);dam.parents=[];dam.lineage='old-unrecorded-lineage';
  dam.pregnancy={sireId:father.id,due:s.week+4};dam.bredYear=1;
  delete s.breedingVersion;s.rootCatalogVersion=2;
  for(const b of s.birds){delete b.genome.defects;delete b.genome.character;if(b.farm)b.parents=[];}
  const before=copy(s);assert.ok(R.validState(s));R.upgradeState(s);
  assert.equal(s.rng,before.rng);assert.equal(s.money,before.money);assert.equal(s.week,before.week);
  assert.deepEqual(dam.pregnancy,R.bird(before,dam.id).pregnancy);assert.ok(dam.pedigreeReconstructed);
  for(const b of R.own(s)){
    const old=R.bird(before,b.id);for(const key of ['potential','management','inborn','personality','training'])assert.deepEqual(b[key],old[key]);
    assert.deepEqual(b.genome.quality,old.genome.quality);assert.deepEqual(b.genome.defects,{});
  }
  assert.ok(s.birds.filter(b=>b.farm&&!b.npcFoundation).every(b=>b.parents.length===2&&b.pedigreeReconstructed));
  assert.ok(R.validState(s));const once=copy(s);R.upgradeState(s);assert.deepEqual(s,once);
});
