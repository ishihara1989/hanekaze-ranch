const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/js/model.js');

function bird(sex='M', random=()=>.5) {
  return M.initialize({id:`bird-${sex}`,name:'テスト',sex,gen:1,age:2,parents:[],races:0,wins:0,condition:100,released:false,trainedWeek:-1,genes:{distance:['S','L'],color:['B','b']}},[1,1,1],random);
}
function racer(values={}) {
  const r=M.runner(bird(),0,()=>.5);
  r.stats=Object.fromEntries(M.KEYS.map(k=>[k,50]));
  Object.assign(r.stats,values);
  r.distance=400;r.gate=0;r.form=1;r.phaseSeed=.7;
  return r;
}
function factors(r, course=M.COURSES.short, packed=false) {
  return M.factors(r,packed?[r,{...r,index:1,distance:r.distance+5},{...r,index:2,distance:r.distance-5}]:[r],course,10);
}
test('30 named traits and every trait has a training route',()=>{
  assert.equal(M.KEYS.length,30);
  assert.equal(new Set(M.KEYS).size,30);
  for(const key of M.KEYS)assert.ok(M.MENUS.some(m=>m.key!=='balanced'&&m.traits.includes(key)));
});
test('male and female variation includes exact requested integer endpoints',()=>{
  for(const [sex,max] of [['M',7],['F',3]]){
    for(const [random,offset] of [[()=>0,-3],[()=>.999999,max]]){
      const b=bird(sex,random),cap=M.potential(b),base=M.baseStats(b);
      for(const k of M.KEYS){assert.equal(b.talent[k],offset);assert.equal(cap[k],base[k]+offset);}
    }
  }
});
test('all thirty genes inherit from parents; training and parent variation are not inherited',()=>{
  const father=bird('M',()=>0),mother=bird('F',()=>.999),child=bird('M');
  const first=M.inherit(structuredClone(child),father,mother,()=>.3);
  for(const k of M.KEYS){father.training[k]=0;father.talent[k]=7;mother.training[k]=30;mother.talent[k]=-3;}
  const second=M.inherit(structuredClone(child),father,mother,()=>.3);
  assert.deepEqual(first.genes,second.genes);
  assert.deepEqual(first.talent,second.talent);
  for(const k of M.KEYS){assert.equal(first.genes[k][0],father.genes[k][0]);assert.equal(first.genes[k][1],mother.genes[k][0]);assert.equal(first.training[k],0);}
});
test('training can reach every fixed potential but can never exceed it',()=>{
  const b=bird(),cap=M.potential(b),genes=structuredClone(b.genes),talent={...b.talent};
  for(const k of M.KEYS)b.training[k]=0;
  for(let week=1;week<90;week++){
    b.condition=100;b.strain=0;
    M.train(b,'balanced',week);
    for(const k of M.KEYS)assert.ok(M.stats(b)[k]<=cap[k]);
  }
  assert.deepEqual(M.stats(b),cap);
  assert.deepEqual(M.potential(b),cap);
  assert.deepEqual(b.genes,genes);assert.deepEqual(b.talent,talent);
  assert.equal(M.train(b,'balanced',100),null);
});
test('growth, learning, health, legs, recovery and longevity affect development',()=>{
  const low=bird('M',()=>0),high=bird('M',()=>.999);
  assert.ok(M.trainingGain(high)>M.trainingGain(low));
  assert.ok(M.trainingCost(high,M.MENUS[0])<M.trainingCost(low,M.MENUS[0]));
  assert.ok(M.peakUntil(high)>M.peakUntil(low));
  M.train(low,'sprint',1);M.train(high,'sprint',1);
  assert.ok(high.strain<low.strain);
  low.condition=high.condition=20;low.strain=high.strain=50;
  M.nextWeek(low);M.nextWeek(high);
  assert.ok(high.condition>low.condition);assert.ok(high.strain<low.strain);
  const aging=bird();aging.age=1000;const cap=M.potential(aging),before=M.stats(aging);
  for(let i=0;i<8;i++)M.nextWeek(aging);
  assert.equal(M.stats(aging).speed,before.speed-1);assert.deepEqual(M.potential(aging),cap);
});
test('gate, focus and courage reduce starting delay; acceleration changes speed ramp',()=>{
  const r=racer();
  for(const key of ['gate','focus','courage'])assert.ok(M.gateDelay({...r.stats,[key]:90},()=>0)<M.gateDelay({...r.stats,[key]:10},()=>0));
  const low=racer({acceleration:10}),high=racer({acceleration:90});
  M.stepRace([low],M.COURSES.short,1,.1);M.stepRace([high],M.COURSES.short,1,.1);
  assert.ok(high.velocity>low.velocity);
});
test('race stat effects cover cruise, sprint, pace, surfaces, weather and pack behavior',()=>{
  assert.ok(factors(racer({speed:90})).target>factors(racer({speed:10})).target);
  for(const key of ['stamina','economy'])assert.ok(factors(racer({[key]:90})).drain<factors(racer({[key]:10})).drain);
  const burstLow=racer({burst:10}),burstHigh=racer({burst:90});burstLow.distance=burstHigh.distance=1050;
  assert.ok(factors(burstHigh).target>factors(burstLow).target);
  const sustainLow=racer({sustain:10}),sustainHigh=racer({sustain:90});
  sustainLow.distance=sustainHigh.distance=1050;sustainLow.spurtTime=sustainHigh.spurtTime=10;
  assert.equal(factors(sustainLow).spurt,false);assert.equal(factors(sustainHigh).spurt,true);
  assert.ok(factors(racer({versatility:90,leader:0})).paceStress<factors(racer({versatility:0,leader:0})).paceStress);
  assert.ok(factors(racer({temper:90,leader:0}),M.COURSES.short).pace>factors(racer({temper:10,leader:0}),M.COURSES.short).pace);
  assert.ok(factors(racer({leader:90})).pace>factors(racer({leader:10})).pace);
  for(const [key,course] of [['turf',M.COURSES.short],['dirt',M.COURSES.dirt],['mud',M.COURSES.rain],['balance',M.COURSES.rain],['corner',M.COURSES.short],['hill',M.COURSES.long],['wind',M.COURSES.long],['focus',M.COURSES.short]]){
    assert.ok(factors(racer({[key]:90}),course).target>factors(racer({[key]:10}),course).target,key);
  }
  assert.ok(factors(racer({heat:90}),M.COURSES.dirt).drain<factors(racer({heat:10}),M.COURSES.dirt).drain);
  const adaptableLow=racer({adaptability:10}),adaptableHigh=racer({adaptability:90});
  adaptableLow.bird.genes.distance=adaptableHigh.bird.genes.distance=['L','L'];
  assert.ok(factors(adaptableHigh).target>factors(adaptableLow).target);
  for(const key of ['crowd','courage','grit','competitive'])assert.ok(factors(racer({[key]:90}),M.COURSES.short,true).target>factors(racer({[key]:10}),M.COURSES.short,true).target,key);
  assert.ok(factors(racer({competitive:90}),M.COURSES.short,true).drain>factors(racer({competitive:10}),M.COURSES.short,true).drain);
});
test('every course completes with finite ordered finish times even when exhausted',()=>{
  for(const course of Object.values(M.COURSES)){
    const rs=Array.from({length:6},(_,i)=>{const b=bird(i%2?'F':'M');b.condition=i?100:0;b.strain=i?0:69;return M.runner(b,i,()=>.4);});
    let time=0;
    while(rs.some(r=>r.finishedAt===null)&&time<400){time+=.1;M.stepRace(rs,course,time,.1);}
    assert.ok(rs.every(r=>Number.isFinite(r.finishedAt)&&r.finishedAt>0),course.name);
    assert.ok(rs.every(r=>r.energy>=0&&r.energy<=100));
  }
});
test('every entrant uses its own temperament regardless of its position in the field array',()=>{
  const runners=[racer({leader:90,temper:20}),racer({leader:10,temper:80})];
  const reversed=structuredClone(runners).reverse();
  M.stepRace(runners,M.COURSES.short,10,.1);
  M.stepRace(reversed,M.COURSES.short,10,.1);
  assert.deepEqual(runners,reversed.reverse());
  assert.notEqual(runners[0].energy,runners[1].energy);
});
function legacySave(){
  const birds=[bird('M'),bird('F')];
  for(const b of birds){
    b.genes=Object.fromEntries(['speed','stamina','temper','distance','color'].map(k=>[k,b.genes[k]]));
    b.talent={speed:1,stamina:-2,temper:0};b.training={speed:6,stamina:3,temper:0};delete b.strain;
  }
  return {version:1,week:7,money:1234,births:0,history:[{week:4,name:'テスト',course:'若葉スプリント',rank:2,reward:240}],birds};
}
test('v1 save migrates deterministically without changing identities, ancestry, funds or records',()=>{
  const old=legacySave(),raw=JSON.stringify(old),a=M.migrate(old),b=M.migrate(JSON.parse(raw));
  assert.equal(JSON.stringify(old),raw);assert.deepEqual(a,b);assert.equal(a.version,2);assert.ok(M.validState(a));
  assert.equal(a.week,old.week);assert.equal(a.money,old.money);assert.deepEqual(a.history,old.history);
  for(let i=0;i<2;i++){
    assert.equal(a.birds[i].id,old.birds[i].id);assert.equal(a.birds[i].name,old.birds[i].name);
    for(const k of ['speed','stamina','temper'])assert.deepEqual(a.birds[i].genes[k],old.birds[i].genes[k]);
  }
  assert.deepEqual(M.migrate(a),a);
  const bad=structuredClone(a);bad.birds[1].talent.speed=7;assert.equal(M.validState(bad),false);
  bad.birds[1].talent.speed=0;bad.birds[1].training.speed=1000;assert.equal(M.validState(bad),false);
});
