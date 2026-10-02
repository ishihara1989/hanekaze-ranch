'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../public/js/ranch-engine.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const roots=s=>R.sires(s).filter(b=>b.kind==='root');

test('32 distinct sources cover every inherited strength twice as primary and twice as support',()=>{
  const traits=[...R.Mapping.ABILITIES.map(a=>a.key),...Object.keys(R.MANAGEMENT),...Object.keys(R.PERSONALITY)];
  assert.equal(R.ROOTS.length,32);
  assert.equal(new Set(R.ROOTS.map(p=>p.name)).size,32);
  assert.equal(new Set(R.ROOTS.map(p=>p.lineage)).size,32);
  for(const key of traits){
    assert.equal(R.ROOTS.filter(p=>p.primary===key).length,2,key);
    assert.equal(R.ROOTS.filter(p=>p.secondary===key).length,2,key);
  }
  for(const p of R.ROOTS){assert.ok(traits.includes(p.primary));assert.ok(traits.includes(p.secondary));assert.notEqual(p.primary,p.secondary);}
  for(const style of new Set(R.ROOTS.map(p=>p.tendency)))assert.equal(R.ROOTS.filter(p=>p.tendency===style).length,8);
});

test('catalog strengths exist in actual heritable genes, with no missing favorable loci',()=>{
  const s=R.initial(),sources=roots(s);
  for(const b of sources){
    const p=R.ROOTS.find(p=>p.lineage===b.lineage),q=R.quality(b.genome);
    for(const key in q)assert.equal(q[key],key===p.primary?100:key===p.secondary?85:70,`${b.name}/${key}`);
    const penalty=R.Breeding.penalties(b.genome,R.DEFECTS);
    for(const key in b.inborn)assert.equal(b.inborn[key],(key===p.primary?112:key===p.secondary?98:80)-(penalty[key]||0));
    assert.deepEqual(b.personality,b.inborn);
    assert.deepEqual(b.management,{robustness:q.robustness-(penalty.robustness||0),recovery:q.recovery-(penalty.recovery||0)});
    assert.deepEqual(b.genome.distance,[p.distance,p.distance]);
    assert.deepEqual(b.genome.release,[p.release,p.release]);
    assert.equal(R.breedFee(b),600);
  }
  for(const key of Object.keys(sources[0].genome.quality))for(let locus=0;locus<32;locus++){
    assert.ok(sources.filter(b=>b.genome.quality[key][locus].includes(1)).length>=2,`${key}/${locus} has alternative donors`);
    assert.ok(sources.filter(b=>R.ROOTS.find(p=>p.lineage===b.lineage).primary===key).some(b=>b.genome.quality[key][locus].includes(1)),`${key}/${locus} covered by primary donors`);
  }
  assert.deepEqual(roots(R.initial(999)).map(b=>[b.genome,b.inborn,b.potential]),sources.map(b=>[b.genome,b.inborn,b.potential]));
});

test('every source passes its actual alleles and inborn personality to offspring',()=>{
  for(const profile of R.ROOTS){
    const s=R.initial(),father=roots(s).find(b=>b.lineage===profile.lineage),mother=R.bird(s,s.sale[0]);
    mother.parents=[]; // Isolate Mendelian transmission from the separately tested cross mutations.
    R.buy(s,mother.id);while(s.reports.length)R.acknowledge(s);R.breed(s,mother.id,father.id);
    for(let week=0;week<4;week++){while(s.reports.length)R.acknowledge(s);R.advance(s);}
    const child=R.own(s).find(b=>b.role==='young');
    assert.equal(child.lineage,profile.lineage);
    for(const [key,loci] of Object.entries(child.genome.quality))loci.forEach((pair,i)=>{
      assert.ok(father.genome.quality[key][i].includes(pair[0]));
      assert.ok(mother.genome.quality[key][i].includes(pair[1]));
    });
    const penalty=R.Breeding.penalties(child.genome,R.DEFECTS);
    for(const key in child.inborn){
      assert.ok(father.genome.character[key].includes(child.genome.character[key][0]));
      assert.ok(mother.genome.character[key].includes(child.genome.character[key][1]));
      assert.ok(Math.abs(child.inborn[key]+(penalty[key]||0)-R.Genetics.mean(child.genome.character[key]))<=7);
    }
    assert.ok(R.validState(s));
  }
});

test('upgrading a four-source v4 save preserves IDs, owned birds, pregnancy and random stream',()=>{
  const s=R.initial();
  delete s.rootCatalogVersion;
  s.birds=s.birds.filter(b=>b.kind!=='root'||Number(b.lineage.split('-')[1])<4);
  for(const b of s.birds)b.parents=b.parents.map(id=>R.bird(s,id)?id:null);
  const father=roots(s)[0],mother=R.bird(s,s.sale[0]);father.name='源流・アカツキ';
  R.buy(s,mother.id);while(s.reports.length)R.acknowledge(s);R.breed(s,mother.id,father.id);
  const child={...copy(mother),id:`bird-${s.serial++}`,name:'育てている子',sex:'M',role:'stud',kind:'home',lineage:father.lineage,parents:[father.id,mother.id],pregnancy:null};
  s.birds.push(child);
  const before=copy(s),ids=roots(s).map(b=>b.id);
  assert.ok(R.validState(s));R.refreshRoots(s);
  assert.equal(roots(s).length,32);assert.deepEqual(roots(s).slice(0,4).map(b=>b.id),ids);
  assert.deepEqual(R.own(s),R.own(before));assert.equal(s.rng,before.rng);assert.equal(s.money,before.money);assert.equal(s.week,before.week);
  assert.deepEqual(s.reports,before.reports);assert.deepEqual(s.ledger,before.ledger);
  assert.equal(R.bird(s,mother.pregnancy.sireId).name,R.ROOTS[0].name);assert.ok(R.validState(s));
  const once=copy(s);R.refreshRoots(s);assert.deepEqual(s,once);
});

test('a descendant of the 32nd lineage can become a founder with the correct source name',()=>{
  const s=R.initial(),source=roots(s).at(-1),stud={...copy(source),id:`bird-${s.serial++}`,owner:'player',kind:'home',name:'継ぐ羽'};
  s.birds.push(stud);
  for(let i=0;i<3;i++)s.birds.push({...copy(stud),id:`bird-${s.serial++}`,role:'retired',parents:[stud.id],g1:i===0?5:1});
  s.founderOffers.push(stud.id);R.promote(s,stud.id);
  assert.equal(stud.kind,'founder');assert.match(s.reports.at(-1).text,new RegExp(R.ROOTS.at(-1).name));
});
