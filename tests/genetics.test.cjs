'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../public/js/ranch-genetics.js');
const Ground=require('../public/js/ranch-ground.js');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const P=require('../public/js/race-physics.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const read=s=>{while(s.reports.length)R.acknowledge(s);};

test('body color follows the specified black > white dominance with gray and purple co-expression',()=>{
  const order=['yellow','red','blue','green','rose','white','black'];
  const expected=[
    ['yellow','red','blue','green','rose','white','black'],
    ['red','red','purple','green','rose','white','black'],
    ['blue','purple','blue','green','rose','white','black'],
    ['green','green','green','green','gray','white','black'],
    ['rose','rose','rose','gray','rose','white','black'],
    ['white','white','white','white','white','white','black'],
    ['black','black','black','black','black','black','black'],
  ];
  order.forEach((a,i)=>order.forEach((b,j)=>assert.equal(G.expressColor([a,b],['g','g']),expected[i][j],`${a}/${b}`)));
  assert.equal(G.expressColor(['black','white'],['G','g']),'golden');
  assert.equal(G.expressColor(['black','white'],['G','G']),null);
});

test('surface, growth, body and forehead are inherited from parents without phenotype averaging',()=>{
  const a=G.source(0),b=G.source(31),rng=R.Mapping.seededRandom(52);
  a.body=['red','blue'];b.body=['green','rose'];a.crest='rainbow';b.crest='white';
  const crests=new Set(),bodies=new Set();
  for(let i=0;i<2000;i++){
    const child=G.generate(rng,[a,b]);assert.ok(G.valid(child));
    for(const group of ['aptitude','development'])for(const key in child[group]){
      assert.ok(a[group][key].includes(child[group][key][0]));assert.ok(b[group][key].includes(child[group][key][1]));
    }
    assert.ok(a.body.includes(child.body[0]));assert.ok(b.body.includes(child.body[1]));
    assert.ok([a.crest,b.crest].includes(child.crest));crests.add(child.crest);bodies.add(child.body.join('/'));
  }
  assert.equal(crests.size,2);assert.equal(bodies.size,4);
});

test('gold is dominant, single-copy transmission is one half, and double gold does not hatch',()=>{
  const gold=G.source(20),plain=G.source(0),rng=R.Mapping.seededRandom(18),trials=16000;
  let single=0,lethal=0,doubleGolden=0;
  for(let i=0;i<trials;i++){
    const singleChild=G.generate(rng,[gold,plain]);if(G.expressColor(singleChild.body,singleChild.gold)==='golden')single++;
    const child=G.generate(rng,[gold,gold]),color=G.expressColor(child.body,child.gold);
    if(color===null){lethal++;assert.equal(G.valid(child),false);assert.equal(G.valid(child,{allowLethal:true}),true);}
    if(color==='golden')doubleGolden++;
  }
  assert.ok(Math.abs(single/trials-.5)<.02);
  assert.ok(Math.abs(lethal/trials-.25)<.02);
  assert.ok(Math.abs(doubleGolden/trials-.5)<.02);
});

test('non-gold parents can have a rare de novo gold allele that subsequently breeds true as an allele',()=>{
  const rng=R.Mapping.seededRandom(314),a=G.source(0),b=G.source(1),trials=20000;
  const mutants=[];
  for(let i=0;i<trials;i++){
    const child=G.generate(rng,[a,b]);if(child.gold.includes('G'))mutants.push(child);
  }
  assert.ok(mutants.length>=2&&mutants.length<=25,`mutations: ${mutants.length}`);
  assert.ok(mutants.every(g=>G.expressColor(g.body,g.gold)==='golden'&&g.gold.filter(a=>a==='G').length===1));
  let golden=0;for(let i=0;i<2000;i++)if(G.generate(rng,[mutants[0],a]).gold.includes('G'))golden++;
  assert.ok(golden>900&&golden<1100);
});

test('non-hatching pregnancy releases its stall and cannot produce a phantom child or duplicate event',()=>{
  const s=R.initial(3),mother=R.bird(s,s.sale[0]),father=s.birds.find(b=>b.kind==='root'&&b.color==='golden');
  mother.genome.traits.gold=['G','g'];mother.color='golden';
  R.buy(s,mother.id);read(s);R.breed(s,mother.id,father.id);
  for(let i=0;i<3;i++){read(s);R.advance(s);}read(s);
  // Select the lethal draw at hatch time, independently of earlier race outcomes.
  const countBeforeHatch=R.own(s).length;
  let lethalSeed=null;
  for(let seed=1;seed<=64;seed++){
    const probe=copy(s);probe.rng=seed;R.advance(probe);
    if(R.own(probe).length===countBeforeHatch){lethalSeed=seed;break;}
  }
  assert.notEqual(lethalSeed,null);s.rng=lethalSeed;
  const restored=copy(s),count=R.own(s).length;
  R.advance(s);R.advance(restored);assert.deepEqual(s,restored);
  assert.equal(R.own(s).length,count);assert.equal(mother.pregnancy,null);assert.equal(R.racingCount(s),1);
  assert.equal(R.own(s).filter(b=>b.role==='young').length,0);assert.equal(s.milestones.birth,undefined);
  assert.equal(s.reports.filter(r=>r.title==='卵は、かえりませんでした').length,1);
  assert.match(R.breedingReason(s,mother,father),/今年/);assert.ok(R.validState(s));
  read(s);R.advance(s);assert.equal(s.journal.filter(r=>r.title==='卵は、かえりませんでした').length,1);
});

test('birth derives body and forehead from inherited genes and saves them unchanged on reload',()=>{
  const s=R.initial(1),mother=R.bird(s,s.sale[0]),father=s.birds.find(b=>b.kind==='root'&&b.color==='golden');
  // One golden parent tests inheritance without depending on a non-lethal double-gold draw.
  R.buy(s,mother.id);read(s);R.breed(s,mother.id,father.id);
  for(let i=0;i<4;i++){read(s);R.advance(s);}
  const child=R.own(s).find(b=>b.role==='young');assert.ok(child);
  assert.ok(father.genome.traits.gold.includes(child.genome.traits.gold[0]));
  assert.ok(mother.genome.traits.gold.includes(child.genome.traits.gold[1]));
  assert.equal(child.color,G.expressColor(child.genome.traits.body,child.genome.traits.gold));
  assert.ok([father.crest,mother.crest].includes(child.crest));assert.ok(R.validState(copy(s)));
  const before=copy(child);R.upgradeState(s);assert.deepEqual(child,before);
});

test('three growth genes independently control maturity, decline onset and decline slope',()=>{
  const s=R.initial(),b=copy(s.birds[0]);b.kind='home';b.role='racing';b.birthYear=1;b.bornWeek=1;
  for(const k in b.potential){b.potential[k]=120;b.training[k]=1;}
  const scores=(years,key,value)=>{const c=copy(b);c.genome.traits.development[key]=[value,value];s.week=1+years*48;return R.currentAbilities(s,c);};
  assert.ok(scores(1,'earlyGrowth',1).speed>scores(1,'earlyGrowth',0).speed);
  assert.deepEqual(scores(5,'earlyGrowth',1),scores(5,'earlyGrowth',0));
  assert.deepEqual(scores(4,'lateDecline',1),scores(4,'lateDecline',0));
  assert.ok(scores(7,'lateDecline',1).speed>scores(7,'lateDecline',0).speed);
  assert.deepEqual(scores(4,'slowDecline',1),scores(4,'slowDecline',0));
  assert.ok(scores(9,'slowDecline',1).speed>scores(9,'slowDecline',0).speed);
  s.week=97;b.role='young';const young=R.currentAbilities(s,b);b.role='racing';assert.deepEqual(R.currentAbilities(s,b),young);
  for(const value of Object.values(scores(40,'slowDecline',0)))assert.ok(value>=50&&value<=120);
});

test('all new breeding options and feather factors are supplied by the 32 source birds',()=>{
  const sources=R.initial().birds.filter(b=>b.kind==='root');
  assert.equal(sources.length,32);
  for(const key of Object.keys(G.SURFACE_APTITUDES))assert.equal(sources.filter(b=>G.mean(b.genome.traits.aptitude[key])===1).length,16);
  for(const key of Object.keys(G.DEVELOPMENT))assert.equal(sources.filter(b=>G.mean(b.genome.traits.development[key])===1).length,8);
  for(const surface of ['turf','dirt'])for(const cushion of ['lowCushion','highCushion'])assert.equal(sources.filter(b=>G.mean(b.genome.traits.aptitude[surface])===1&&G.mean(b.genome.traits.aptitude[cushion])===1).length,8);
  for(const color of Object.keys(G.DOMINANCE))assert.ok(sources.some(b=>b.genome.traits.body.includes(color)));
  for(const crest of Object.keys(G.CRESTS))assert.ok(sources.some(b=>b.crest===crest));
  for(const color of Object.keys(G.COLORS))assert.ok(sources.some(b=>b.color===color),color);
  assert.equal(sources.filter(b=>b.genome.traits.gold.includes('G')).length,1);
});

test('course and going determine cushioning, independently of inherited aptitude',()=>{
  const turf={trackId:'tenku',surface:'turf',going:'good'},dirt={trackId:'sunahama',surface:'dirt',going:'good'};
  assert.notEqual(Ground.conditions(turf).cushion,Ground.conditions({...turf,trackId:'mitsurin'}).cushion);
  assert.ok(Ground.conditions({...turf,going:'heavy'}).cushion<Ground.conditions(turf).cushion);
  assert.ok(Ground.conditions({...dirt,going:'heavy'}).cushion>Ground.conditions(dirt).cushion);
  for(const trackId in Ground.TRACK_CUSHION)for(const surface of ['turf','dirt'])for(const going in Ground.GOING){
    const g=Ground.conditions({trackId,surface,going});assert.ok(g.cushion>=0&&g.cushion<=1);
  }
});

test('ground fit affects delivered thrust and muscle cost without changing innate speed or aerobic power',()=>{
  const p=P.parameters(),state={...P.createState(p),speed:12};
  const efficient=P.step(state,p,.1,12,0,1),slippery=P.step(state,p,.1,12,0,.8);
  assert.ok(slippery.energyUsed>efficient.energyUsed);assert.ok(slippery.reserveSpent>efficient.reserveSpent);
  const fast=P.step(P.createState(p),p,.1,23,0,1),slow=P.step(P.createState(p),p,.1,23,0,.8);
  assert.ok(fast.acceleration>slow.acceleration);assert.ok(fast.force>slow.force);
  assert.throws(()=>P.step(state,p,.1,12,0,1.1));assert.throws(()=>P.step(state,p,.1,12,0,NaN));
});

test('identical birds exchange racing advantage with turf/dirt and low/high cushion',()=>{
  const s=R.initial(),base=copy(s.birds[0]);base.kind='home';base.role='racing';base.birthYear=-3;
  for(const k in base.potential){base.potential[k]=100;base.training[k]=1;}
  const a=copy(base),b=copy(base);a.genome.traits.aptitude={turf:[1,1],dirt:[0,0],lowCushion:[.5,.5],highCushion:[.5,.5]};
  b.genome.traits.aptitude={turf:[0,0],dirt:[1,1],lowCushion:[.5,.5],highCushion:[.5,.5]};
  const event={distance:1600,hill:0,trackId:'iseki',going:'good'};
  for(const surface of ['turf','dirt']){
    const ra=R.simulateBird(s,a,{...event,surface}),rb=R.simulateBird(s,b,{...event,surface});
    assert.ok(ra.finished&&rb.finished);assert.deepEqual(ra.parameters,rb.parameters);
    assert.ok(surface==='turf'?ra.time<rb.time:rb.time<ra.time,`${surface}: ${ra.time}/${rb.time}`);
  }
  a.genome.traits.aptitude={turf:[1,1],dirt:[1,1],lowCushion:[1,1],highCushion:[0,0]};
  b.genome.traits.aptitude={turf:[1,1],dirt:[1,1],lowCushion:[0,0],highCushion:[1,1]};
  for(const trackId of ['sunahama','haikou']){
    const e={...event,trackId,surface:'dirt'},ra=R.simulateBird(s,a,e),rb=R.simulateBird(s,b,e);
    assert.ok(trackId==='sunahama'?ra.time<rb.time:rb.time<ra.time,`${trackId}: ${ra.time}/${rb.time}`);
  }
});

test('pre-genetics v4 saves gain consistent genes without rerolling owned qualities, colors or finances',()=>{
  const s=R.initial();R.buy(s,s.sale[0]);read(s);R.breed(s,R.own(s)[0].id,R.sires(s)[0].id);
  delete s.geneticsVersion;s.rootCatalogVersion=1;
  for(const b of s.birds){delete b.genome.traits;delete b.crest;}
  const before=copy(s);assert.ok(R.validState(s));R.upgradeState(s);assert.ok(R.validState(s));
  assert.equal(s.rng,before.rng);assert.equal(s.money,before.money);assert.equal(s.week,before.week);
  assert.deepEqual(s.reports,before.reports);
  const mother=R.own(s)[0],old=R.own(before)[0];
  assert.equal(mother.color,old.color);assert.equal(mother.growth,old.growth);assert.deepEqual(mother.genome.quality,old.genome.quality);
  assert.deepEqual(mother.potential,old.potential);assert.deepEqual(mother.training,old.training);assert.deepEqual(mother.pregnancy,old.pregnancy);
  const once=copy(s);R.upgradeState(s);assert.deepEqual(s,once);
  for(const mutate of [g=>g.body=['purple','blue'],g=>g.gold=['G','G'],g=>g.crest='green',g=>g.aptitude.turf=[NaN,1],g=>g.development.earlyGrowth=[2,1]]){
    const bad=copy(s);mutate(bad.birds[0].genome.traits);assert.equal(R.validState(bad),false);
  }
  const missing=copy(s);delete missing.birds[0].genome.traits;assert.equal(R.validState(missing),false);
});
