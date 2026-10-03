'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../public/js/ranch-genetics.js');
const R=require('../public/js/ranch-engine.js');
const F=require('../public/js/ranch-race.js');
const P=require('../public/js/race-physics.js');
const C=require('../public/js/race-course.js');
const Observation=require('../public/js/ranch-observation.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const traits=Object.fromEntries(Object.keys(R.PERSONALITY).map(k=>[k,100]));
function entry(aptitude={},physical={},state={}){
  const p=P.parameters(physical);
  return {id:'a',name:'a',lane:0,p,traits,aptitude,cruise:p.criticalSpeed,
    ground:{traction:1},state:{...P.createState(p),lateral:0,...state}};
}

test('32 sources favor intelligent stayers on bends and a minority of sprinters/closers on straights',()=>{
  const sources=R.ROOTS.map((root,i)=>({root,aptitude:G.source(i).aptitude}));
  for(const key of ['rightTurn','leftTurn']){
    const counts=[0,.5,1].map(value=>sources.filter(s=>G.mean(s.aptitude[key])===value).length);
    assert.deepEqual(counts,[4,20,8]);
    const specialists=sources.filter(s=>G.mean(s.aptitude[key])===1);
    assert.ok(specialists.every(s=>s.root.distance>0||['wisdom','control'].includes(s.root.primary)||s.root.secondary==='control'));
    assert.ok(sources.filter(s=>G.mean(s.aptitude[key])===0).every(s=>['speed','reserve','grit','drive','fight'].includes(s.root.primary)));
  }
  assert.equal(sources.filter(s=>G.mean(s.aptitude.rightTurn)===1&&G.mean(s.aptitude.leftTurn)===1).length,4);
  assert.equal(sources.filter(s=>G.mean(s.aptitude.straight)===.5).length,24);
  const straight=sources.filter(s=>G.mean(s.aptitude.straight)===1);
  assert.equal(straight.length,8);
  assert.ok(straight.every(s=>s.root.distance<0||s.root.release>0));
  assert.equal(straight.filter(s=>s.root.distance<0).length,7);
  assert.equal(straight.filter(s=>s.root.release>0).length,5);
});

test('course alleles segregate independently and straight inheritance never produces a disadvantage',()=>{
  const a=G.source(13),b=G.source(31),random=R.Mapping.seededRandom(20261003);
  a.aptitude.rightTurn=[0,1];a.aptitude.leftTurn=[1,0];a.aptitude.straight=[.5,1];
  b.aptitude.rightTurn=[1,0];b.aptitude.leftTurn=[0,1];b.aptitude.straight=[1,.5];
  const combinations=new Set();
  for(let i=0;i<2000;i++){
    const child=G.generate(random,[a,b]);assert.ok(G.valid(child));
    for(const key of Object.keys(G.COURSE_APTITUDES)){
      assert.ok(a.aptitude[key].includes(child.aptitude[key][0]));
      assert.ok(b.aptitude[key].includes(child.aptitude[key][1]));
    }
    assert.ok(G.mean(child.aptitude.straight)>=.5);
    combinations.add(Object.keys(G.COURSE_APTITUDES).map(k=>G.mean(child.aptitude[k])).join('/'));
  }
  assert.equal(combinations.size,27);
  let ordinary=0;
  for(let i=0;i<2000;i++){
    const g=G.generate(random);assert.ok(G.valid(g));
    if(G.mean(g.aptitude.straight)===.5)ordinary++;
  }
  assert.ok(ordinary>1400&&ordinary<1650,ordinary);
  const bad=copy(a);bad.aptitude.straight=[0,1];assert.equal(G.valid(bad),false);
});

test('turn direction exchanges the advantage, and a smaller radius increases slowing for every aptitude',()=>{
  const event={distance:2400},runner=entry({rightTurn:1,leftTurn:0});
  for(const theme of ['右回り','左回り']){
    const track={lap:1800,straight:400,theme},c=C.course(event,track);
    const first=F.simulate([runner],event,{track})[0];
    const opposite=F.simulate([entry({rightTurn:0,leftTurn:1})],event,{track})[0];
    assert.ok(first.finished&&opposite.finished);
    assert.ok(theme==='右回り'?first.time<opposite.time:first.time>opposite.time);
    assert.deepEqual(first.parameters,opposite.parameters);
    for(const fit of [0,.5,1]){
      const r=entry({rightTurn:fit,leftTurn:fit},{},{distance:1000});
      assert.equal(C.section(r.state.distance,event.distance,c).corner,true);
      const effect=F.courseEffect(r,event.distance,c);
      assert.ok(effect.speedFactor<1);
      assert.ok(F.courseEffect(r,event.distance,{...c,radius:c.radius*.7}).speedFactor<effect.speedFactor);
    }
  }
});

test('corner skill saves muscle work at equal speed without granting aerobic power',()=>{
  const event={distance:2400},c=C.course(event),weak=entry({leftTurn:0},{},{distance:1000,speed:17});
  weak.state.aerobic=P.criticalPower(weak.p);
  const strong={...weak,aptitude:{leftTurn:1}};
  const low=F.courseEffect(weak,event.distance,c),high=F.courseEffect(strong,event.distance,c);
  assert.ok(high.speedFactor>low.speedFactor);assert.ok(high.effortCost<low.effortCost);
  const a=P.step(weak.state,weak.p,.1,17,0,1,low.effortCost),b=P.step(strong.state,strong.p,.1,17,0,1,high.effortCost);
  assert.equal(a.speed,b.speed);assert.ok(b.energyUsed<a.energyUsed);assert.ok(b.reserve>a.reserve);
  const runs=[0,.5,1].map(fit=>F.simulate([entry({leftTurn:fit})],event)[0]);
  assert.ok(runs[2].time<runs[1].time&&runs[1].time<runs[0].time);
  assert.ok(runs[2].state.reserve>runs[1].state.reserve&&runs[1].state.reserve>runs[0].state.reserve);
});

test('straight specialists exceed ordinary straight speed and gain a fading, repeatable exit thrust',()=>{
  const event={distance:1600},c=C.course(event),exit=event.distance-c.finalStraight;
  const physical={criticalSpeed:22,maxSpeed:23,reserveCapacity:10000,anaerobicPower:100,legEndurance:1000};
  const normal=F.simulate([entry({straight:.5},physical)],event,{trace:true})[0],
    good=F.simulate([entry({straight:1},physical)],event,{trace:true})[0];
  assert.ok(good.time<normal.time);
  assert.ok(Math.max(...good.samples.map(s=>s.speed))>good.parameters.maxSpeed);
  assert.deepEqual(normal.parameters,good.parameters);
  for(const lap of [0,1])for(const [offset,factor] of [[0,1.04],[30,1.02],[60,1],[100,1]]){
    const distance=event.distance+lap*c.lap,r=entry({straight:1},{},{distance:exit+lap*c.lap+offset,speed:12});
    const effect=F.courseEffect(r,distance,c);
    assert.ok(Math.abs(effect.forceFactor-factor)<1e-12);
    assert.equal(effect.speedFactor,1.02);
  }
  const r=entry({straight:1},{maxForce:4.2},{distance:exit+1,speed:12}),effect=F.courseEffect(r,event.distance,c);
  const boosted={...r.p,maxForce:r.p.maxForce*effect.forceFactor,maxSpeed:r.p.maxSpeed*effect.speedFactor};
  assert.equal(P.criticalPower(boosted),P.criticalPower(r.p));
  assert.ok(P.step(r.state,boosted,.1,23).acceleration>P.step(r.state,r.p,.1,23).acceleration);
  // Starting within 60 m of a geometric exit does not imply a corner was run.
  const gateEvent={distance:c.finalStraight+20};
  assert.equal(F.courseEffect(entry({straight:1}),gateEvent.distance,c).forceFactor,1);
  assert.equal(F.courseEffect(entry({straight:.5},{},{distance:exit+1}),event.distance,c).forceFactor,1);
  assert.equal(F.courseEffect(entry({straight:1},{},{distance:exit-1}),event.distance,c).forceFactor,1);
});

test('section changes brake smoothly and course runs remain deterministic, bounded and read only',()=>{
  const event={distance:2400},r=entry({leftTurn:0,straight:1},
    {criticalSpeed:22,maxSpeed:23,reserveCapacity:10000,anaerobicPower:100,legEndurance:1000}),before=copy(r);
  const run=F.simulate([r],event,{trace:true,dt:.1,sampleEvery:.1})[0];
  assert.deepEqual(r,before);assert.deepEqual(run,F.simulate([r],event,{trace:true,dt:.1,sampleEvery:.1})[0]);
  assert.ok(run.finished);
  for(let i=1;i<run.samples.length;i++){
    const a=run.samples[i-1],b=run.samples[i];
    assert.ok(b.speed<=r.p.maxSpeed*1.02+1e-9);
    assert.ok((b.speed-a.speed)/(b.time-a.time)>=-4-1e-8);
    assert.ok(b.reserve>=0&&b.reserve<=r.p.reserveCapacity&&b.fatigue>=0&&b.fatigue<=1);
  }
  const fine=F.simulate([r],event,{dt:.05})[0];assert.ok(Math.abs(run.time-fine.time)<.3);
  for(const aptitude of [{straight:0},{rightTurn:NaN},{leftTurn:1.1}])
    assert.throws(()=>F.simulate([entry(aptitude)],event),/Invalid course aptitude/);
});

test('ranch races use inherited course aptitude and honor the supplied track direction',()=>{
  const s=R.initial(),a=copy(R.sires(s)[0]),b=copy(a);
  a.genome.traits.aptitude.rightTurn=[1,1];a.genome.traits.aptitude.leftTurn=[0,0];
  b.genome.traits.aptitude.rightTurn=[0,0];b.genome.traits.aptitude.leftTurn=[1,1];
  a.genome.traits.aptitude.straight=b.genome.traits.aptitude.straight=[.5,.5];
  const before=JSON.stringify(s);
  for(const theme of ['右回り','左回り']){
    const event={distance:1600,surface:'turf',hill:0,trackId:'iseki',track:{lap:1800,straight:400,theme}};
    const first=R.simulateBird(s,a,event),second=R.simulateBird(s,b,event);
    assert.ok(theme==='右回り'?first.time<second.time:first.time>second.time);
  }
  assert.equal(JSON.stringify(s),before);
});

test('version 1 saves gain neutral course genes while preserving birds, RNG and historical hatch snapshots',()=>{
  const s=R.initial();s.geneticsVersion=1;s.rootCatalogVersion=3;
  const dam=R.bird(s,s.sale[0]);R.buy(s,dam.id);while(s.reports.length)R.acknowledge(s);
  R.breed(s,dam.id,R.sires(s)[0].id);
  for(const b of s.birds)for(const key of Object.keys(G.COURSE_APTITUDES))delete b.genome.traits.aptitude[key];
  const lotteryKeys=[...R.Mapping.ABILITIES.map(a=>a.key),...Object.keys(R.MANAGEMENT),...Object.keys(R.PERSONALITY),
    ...Object.keys(G.SURFACE_APTITUDES),...Object.keys(G.DEVELOPMENT)];
  const report={id:`report-${s.serial++}`,week:s.week,type:'birth',title:'誕生',text:'誕生',expression:'happy',birdId:dam.id,
    geneticLottery:Object.fromEntries(lotteryKeys.map(k=>[k,{min:100,max:100,value:100}]))};
  s.reports.push(report);s.journal.push(copy(report));
  assert.ok(R.validState(s));
  const before=copy(s),restored=R.deserializeState(R.serializeState(s));R.upgradeState(restored);
  assert.ok(R.validState(restored));assert.equal(restored.geneticsVersion,2);assert.equal(restored.rootCatalogVersion,4);
  assert.equal(restored.rng,before.rng);assert.equal(restored.money,before.money);
  assert.deepEqual(restored.reports,before.reports);assert.deepEqual(restored.journal,before.journal);
  assert.deepEqual(restored.birds.filter(b=>b.kind==='root').map(b=>b.id),before.birds.filter(b=>b.kind==='root').map(b=>b.id));
  for(const old of before.birds.filter(b=>b.kind!=='root')){
    const expected=copy(old);for(const key of Object.keys(G.COURSE_APTITUDES))expected.genome.traits.aptitude[key]=[.5,.5];
    assert.deepEqual(R.bird(restored,old.id),expected);
  }
  restored.facilities.lab=1;
  assert.doesNotThrow(()=>Observation.birthGenetics(restored,report));
  assert.doesNotMatch(Observation.birthGenetics(restored,report),/data-birth-trait="(?:rightTurn|leftTurn|straight)"/);
  const once=copy(restored);R.upgradeState(restored);assert.deepEqual(restored,once);
  for(const mutate of [g=>delete g.aptitude.rightTurn,g=>g.aptitude.straight=[0,1],g=>g.aptitude.leftTurn=[NaN,.5]]){
    const bad=copy(restored);mutate(bad.birds[0].genome.traits);assert.equal(R.validState(bad),false);
  }
});

test('new course observations, forecasts and hatch results follow the existing research gates',()=>{
  assert.deepEqual([50,75,100,125,150].map(G.courseRating),['X','△','◯','◎','☆']);
  const s=R.initial(),a=R.sires(s)[0],b=R.bird(s,s.sale[0]),ranges=R.breedingPreview(s,a,b);
  for(const key of Object.keys(G.COURSE_APTITUDES))assert.ok(ranges[key]);
  const report={type:'birth',geneticLottery:Object.fromEntries(Object.entries(ranges).map(([k,v])=>[k,{...v,value:v.min}]))};
  for(const lab of [0,1]){
    s.facilities.lab=lab;
    const html=Observation.genetics(s,a)+Observation.status(s,a)+Observation.birthGenetics(s,report);
    for(const label of Object.values(G.COURSE_APTITUDES))assert.equal(html.includes(label),!!lab);
    assert.doesNotMatch(html,/data-score|data-birth-score/);
  }
  s.facilities.museum=1;
  const html=Observation.genetics(s,a);assert.match(html,/data-score="rightTurn"/);assert.match(html,/直線適性 <small>1座位/);
  assert.match(html,/data-trait="leftTurn"><span>左回り適性<\/span><b>◯/);
  assert.match(Observation.birthGenetics(s,report),new RegExp(`data-birth-trait="straight"[\\s\\S]*?結果 ${G.courseRating(ranges.straight.min)}`));
});
