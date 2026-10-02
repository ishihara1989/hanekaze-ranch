'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../public/js/ranch-engine.js');
const fixture=()=>({genome:{
  quality:Object.fromEntries([...R.Mapping.ABILITIES.map(a=>a.key),...Object.keys(R.MANAGEMENT)].map(key=>[key,Array.from({length:32},()=>[0,1])])),
  character:Object.fromEntries(Object.keys(R.PERSONALITY).map(key=>[key,[90,100]])),
  distance:[-1,1],release:[-1,1],defects:{}}});

test('genetic ratings have useful boundaries independently of current status ratings',()=>{
  assert.deepEqual([50,64.99,65,79.99,80,94.99,95,109.99,110,150].map(R.geneticRating),
    ['X','X','△','△','◯','◯','◎','◎','☆','☆']);
});
test('aggregate genetics include quality, opposing body effects and every expressed penalty',()=>{
  const b=fixture(),g=b.genome;
  g.distance=[.5,1];g.release=[-.5,-1];
  const addDefect=(trait,loci)=>{
    const id=Object.keys(R.DEFECTS).find(id=>R.DEFECTS[id].trait===trait&&!g.defects[id]);
    assert.ok(id,trait);g.defects[id]=loci;
  };
  addDefect('power',[[1,1],[1,1],[0,1],[0,0]]);
  addDefect('frailty',[[1,1],[0,1],[0,0],[0,0]]);
  addDefect('temper',[[1,1],[0,0],[0,0],[0,0]]);
  const before=JSON.stringify(b),scores=R.geneticScores(b);
  assert.equal(scores.power,90-14*.75+10*(-.75)-4);
  assert.equal(scores.robustness,88);assert.equal(scores.recovery,88);
  assert.equal(scores.control,93);assert.equal(scores.crowd,93);assert.equal(scores.drive,95);
  assert.equal(JSON.stringify(b),before,'display does not change genes');
  b.potential={power:150};b.training={power:1};b.personality={drive:150};
  assert.deepEqual(R.geneticScores(b),scores,'training and the birth lottery do not alter inheritance ratings');
});

test('base inheritance and signed modifiers distinguish high quality from an equivalent body bonus',()=>{
  const strong=fixture(),boosted=fixture();
  // Different genetic routes to the same explosive power must remain visible.
  strong.genome.quality.power=Array.from({length:32},()=>[1,1]);
  boosted.genome.distance=[-1,-1];boosted.genome.release=[.85,.85];
  // Quality 107.5 + 22.5 of body effects = quality 130 + no body effects.
  boosted.genome.quality.power=Array.from({length:32},(_,i)=>i<23?[1,1]:[0,0]);
  const a=R.geneticBreakdown(strong),b=R.geneticBreakdown(boosted);
  assert.equal(a.base.power,130);assert.equal(a.effects.power,0);
  assert.equal(b.base.power,107.5);assert.equal(b.effects.power,22.5);
  assert.equal(b.total.power,a.total.power);
  assert.equal(R.geneticEffectRating(a.effects.power),'◯');assert.equal(R.geneticEffectRating(b.effects.power),'☆');
  for(const key of Object.keys(a.base))assert.equal(a.total[key],a.base[key]+a.effects[key]);
});

test('modifier rating is neutral around zero and treats rises and falls symmetrically',()=>{
  assert.deepEqual([-20,-10.01,-10,-2.01,-2,0,2,2.01,10,10.01,20].map(R.geneticEffectRating),
    ['X','X','△','△','◯','◯','◯','◎','◎','☆','☆']);
});

test('Aa already raises the genetic center; only recessive aa defects subtract after birth sampling',()=>{
  const heterozygote=fixture(),favorable=fixture(),defective=fixture();
  favorable.genome.quality.power[0]=[1,1];
  const id=Object.keys(R.DEFECTS).find(id=>R.DEFECTS[id].trait==='power');
  defective.genome.defects[id]=[[1,1],[0,1],[0,0],[0,0]];
  const birth=b=>{
    b.genome.traits=R.Genetics.legacy({growth:'normal',color:'yellow'});
    return R.createBird({week:9,rng:1234,serial:1,birds:[]},{name:'イデンテスト',genome:b.genome});
  };
  const a=birth(heterozygote),b=birth(favorable),c=birth(defective);
  assert.equal(R.quality(a.genome).power,90);
  assert.equal(R.quality(b.genome).power,91.25);
  assert.ok(Math.abs(b.potential.power-a.potential.power-1.25)<1e-10);
  assert.equal(c.potential.power,a.potential.power-2,'aa subtracts 2 after identical birth randomness; Aa is a carrier');
  for(const key of Object.keys(a.potential).filter(key=>key!=='power'))assert.equal(c.potential[key],a.potential[key]);
});
test('all research levels require a lab and depend on each monument, regardless of legacy lab upgrades',()=>{
  for(const lab of [0,1,2,3])for(const statue of [0,1])for(const museum of [0,1])
    assert.equal(R.labLevel({facilities:{lab,statue,museum}}),lab?1+statue+museum:0);
});
