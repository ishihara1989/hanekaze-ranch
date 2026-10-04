'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {R,ABILITIES,score,expectationCalculator,selectSire,auditBreeding}=require('../tools/lib/breeding-balance.cjs');
const {prepareWorld}=require('../tools/lib/ranch-fixtures.cjs');
const Physics=require('../public/js/race-physics.js');
const Race=require('../public/js/ranch-race.js');

function setup(cross=false){
  const s={week:9,rng:731,serial:1,birds:[],facilities:{stalls:9}};
  R.refreshRoots(s);
  const source=s.birds[0],sire=structuredClone(s.birds[1]),dam=structuredClone(s.birds[2]);
  Object.assign(sire,{id:'bird-900',name:'テストチチ',kind:'home',parents:cross?[source.id,null]:[]});
  Object.assign(dam,{id:'bird-901',name:'テストハハ',kind:'home',sex:'F',parents:cross?['bird-902',null]:[]});
  const bridge={...structuredClone(source),id:'bird-902',kind:'home',parents:[source.id,null]};
  for(const b of [sire,dam]){
    for(const key of Object.keys(b.genome.quality))b.genome.quality[key]=Array.from({length:32},(_,i)=>i%4===0?[1,1]:i%4===1?[0,0]:[0,1]);
    b.genome.distance=[-.8,.6];b.genome.release=[-.6,.8];
    b.genome.traits.gold=['g','g'];
    b.genome.defects={[`${source.lineage}-weak`]:Array.from({length:4},()=>[0,1])};
  }
  s.birds.push(sire,dam,bridge);
  return {s,sire,dam};
}

test('exact expected genetic scores match production offspring with stall bias, defects and a legal 2x3 cross',()=>{
  for(const cross of [false,true])for(const level of [4,9]){
    const {s,sire,dam}=setup(cross);s.facilities.stalls=level;
    assert.equal(R.crossRisk(s,sire,dam),null);
    if(cross)assert.ok(R.crossPlan(s,sire,dam).some(p=>p.group==='quality'));
    const before=structuredClone(s),expected=expectationCalculator(level)(s,sire,dam);
    assert.deepEqual(s,before,'expectation does not consume RNG or mutate ancestry');
    const sums=Object.fromEntries(ABILITIES.map(key=>[key,0])),n=3000;
    for(let i=0;i<n;i++){
      const child=R.createBird(s,{sex:'F',name:'テスト'},[sire,dam]);
      assert.ok(child);const values=R.geneticScores(child);
      for(const key of ABILITIES)sums[key]+=values[key];
      s.birds.pop();
    }
    for(const key of ABILITIES)assert.ok(Math.abs(sums[key]/n-expected[key])<.35,`${cross}/${level}/${key}: ${sums[key]/n} vs ${expected[key]}`);
  }
});

test('sire policy maximizes expected child ability and excludes prohibited crosses',()=>{
  const {s,sire,dam}=setup(true),expected=expectationCalculator(9);
  const candidates=s.birds.filter(b=>b.sex==='M');
  const checkedExpectation=(state,father,mother,plan)=>{
    const indexed=expected(state,father,mother,plan);
    assert.deepEqual(indexed,expected(state,father,mother),'indexed pedigree uses the same mutation plan as production');
    return indexed;
  };
  const before=structuredClone(s),chosen=selectSire(s,dam,candidates,checkedExpectation);
  assert.equal(R.crossRisk(s,chosen.sire,dam),null);
  for(const b of candidates.filter(b=>!R.crossRisk(s,b,dam)))assert.ok(chosen.expected>=Object.values(expected(s,b,dam)).reduce((n,x)=>n+x,0)/8);
  assert.deepEqual(s,before);
  // A near relative with perfect genes must still be excluded.
  const forbidden=structuredClone(sire);forbidden.id='bird-903';dam.parents=[forbidden.id,null];s.birds.push(forbidden);
  for(const loci of Object.values(forbidden.genome.quality))loci.forEach(p=>p.fill(1));
  const next=selectSire(s,dam,[forbidden,s.birds[5]],expected);
  assert.notEqual(next.sire.id,forbidden.id);
});

test('genetic-only audit runs without racing, preserves input and exceeds the G1 baseline at maximum stalls',()=>{
  const base=R.initial(20260930,{},prepareWorld()),before=JSON.stringify(base);
  const saved={simulate:Race.simulate,step:Physics.step};
  Race.simulate=Physics.step=()=>{throw Error('Racing forbidden in genetic audit');};
  let audit;
  try{audit=auditBreeding(base,{trials:4,generations:3,levels:[9]});}
  finally{Race.simulate=saved.simulate;Physics.step=saved.step;}
  assert.equal(JSON.stringify(base),before);
  assert.equal(audit.reference.events.length,37);
  assert.ok(audit.reference.events.every(e=>e.fieldSize===6));
  assert.equal(audit.scenarios.length,3);
  for(const scenario of audit.scenarios){
    assert.ok(scenario.firstAboveReference!==null&&scenario.firstAboveReference<=2);
    assert.ok(scenario.rows[2].mean>audit.reference.strongestFieldMean);
    for(const row of scenario.rows.slice(1))assert.equal(row.sires.reduce((n,s)=>n+s.count,0),4);
  }
  assert.equal(audit.scenarios[0].rows[0].mean,score(R.bird(base,base.sale[0])));
});
