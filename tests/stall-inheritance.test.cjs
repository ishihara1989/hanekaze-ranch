'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {R,founded,progress}=require('../tools/lib/ranch-fixtures.cjs');
const copy=structuredClone;

function heterozygousParents(){
  const parents=copy(R.initial().birds.filter(b=>b.kind==='root').slice(0,2));
  for(const p of parents){
    for(const loci of Object.values(p.genome.quality))for(let i=0;i<loci.length;i++)loci[i]=i%2?[1,0]:[0,1];
    for(const key of Object.keys(p.genome.traits.aptitude))p.genome.traits.aptitude[key]=key==='straight'?[1,.5]:[0,1];
    for(const key of Object.keys(p.genome.traits.development))p.genome.traits.development[key]=[1,0];
    for(const key of Object.keys(p.genome.character))p.genome.character[key]=[60,120];
    p.genome.distance=[-.8,.8];p.genome.release=[.7,-.7];
    p.genome.traits.body=['red','blue'];
  }
  parents[0].genome.traits.gold=['G','g'];
  return parents;
}
const scratch=(parents,level,seed=817)=>({week:9,rng:seed,serial:500,facilities:{stalls:level},birds:[...parents]});

test('each late stall level increases favorable inherited alleles by five percentage points',()=>{
  const parents=heterozygousParents();
  for(const level of [1,4,5,6,7,8,9]){
    const s=scratch(parents,level),counts={quality:[0,0],aptitude:[0,0],development:[0,0]};
    for(let i=0;i<600;i++){
      const child=R.createBird(s,{name:'テスト'},parents);
      for(const [group,pairs] of Object.entries({quality:Object.values(child.genome.quality).flat(),aptitude:Object.values(child.genome.traits.aptitude),development:Object.values(child.genome.traits.development)})){
        for(const allele of pairs.flat()){counts[group][0]+=Number(allele===1);counts[group][1]++;}
      }
      s.birds.pop();
    }
    const expected=.5+.05*Math.max(0,level-4);
    for(const [group,[favorable,total]] of Object.entries(counts))assert.ok(Math.abs(favorable/total-expected)<.025,`Lv${level} ${group}: ${favorable/total} vs ${expected}`);
  }
});

test('stall selection only inherits existing alleles and leaves color, personality and D/R unchanged',()=>{
  const parents=heterozygousParents();
  for(let seed=1;seed<=100;seed++){
    const ordinary=R.createBird(scratch(parents,4,seed),{name:'テスト'},parents);
    const improved=R.createBird(scratch(parents,9,seed),{name:'テスト'},parents);
    for(const key of ['character','distance','release','defects'])assert.deepEqual(improved.genome[key],ordinary.genome[key]);
    for(const key of ['body','gold','crest'])assert.deepEqual(improved.genome.traits[key],ordinary.genome.traits[key]);
    assert.equal(improved.color,ordinary.color);assert.equal(improved.crest,ordinary.crest);assert.deepEqual(improved.inborn,ordinary.inborn);
    for(const [key,loci] of Object.entries(improved.genome.quality))loci.forEach((pair,i)=>pair.forEach((a,p)=>assert.ok(parents[p].genome.quality[key][i].includes(a))));
    for(const group of ['aptitude','development'])for(const [key,pair] of Object.entries(improved.genome.traits[group]))pair.forEach((a,p)=>assert.ok(parents[p].genome.traits[group][key].includes(a)));
  }
  for(const pair of [[0,0],[1,1],[.5,.5]])for(const draw of [0,.74,.75,.99])assert.equal(R.Genetics.inheritAllele(pair,()=>draw,.75),pair[0]);
  assert.equal(R.Genetics.inheritAllele([0,1],()=>.749,.75),1);
  assert.equal(R.Genetics.inheritAllele([1,0],()=>.75,.75),0);
});

test('player stall improvements do not affect NPC offspring or sale stock',()=>{
  const parents=heterozygousParents();
  for(const options of [{owner:'npc',kind:'general'},{owner:'sale',kind:'general'},{owner:'player',kind:'general'}]){
    const ordinary=R.createBird(scratch(parents,4),{name:'テスト',...options},parents);
    const improved=R.createBird(scratch(parents,9),{name:'テスト',...options},parents);
    assert.deepEqual(improved,ordinary);
  }
});

test('level nine affects hatching and survives save/load without changing existing birds',()=>{
  const s=founded(),before=copy(s.birds);s.facilities.stalls=9;
  R.upgradeState(s);assert.deepEqual(s.birds,before);
  const ordinary=copy(s);ordinary.facilities.stalls=4;
  progress(s,4);progress(ordinary,4);
  const child=R.own(s).find(b=>b.role==='young'),baseline=R.own(ordinary).find(b=>b.role==='young');
  assert.ok(child);assert.ok(baseline);
  const alleleCount=b=>Object.values(b.genome.quality).flat(2).reduce((n,a)=>n+a,0);
  assert.ok(alleleCount(child)>alleleCount(baseline));
  assert.equal(child.color,baseline.color);assert.deepEqual(child.genome.character,baseline.genome.character);
  assert.ok(s.reports.some(r=>r.type==='birth'&&r.birdId===child.id));
  assert.ok(R.validState(s));assert.deepEqual(R.deserializeState(R.serializeState(s)),s);
});
