'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../public/js/race-physics.js');
const M=require('../public/js/trait-mapping.js');
const F=require('../public/js/ranch-race.js');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const traits=Object.fromEntries(Object.keys(R.PERSONALITY).map(k=>[k,100]));
function entry(id,personality={},state={},physical={}){
  const p=P.parameters({...M.toPhysics(M.generate({deviation:0})),...physical});
  return {id,name:id,p,traits:{...traits,...personality},cruise:p.criticalSpeed,
    state:{...P.createState(p),...state},ground:{traction:1}};
}
const empty={crowding:0,duel:0,leading:false,lead:Infinity,pursuerSpeed:0};
const pack={...empty,crowding:1,duel:1};

test('pack detection separates solo, gate, duel, dense field, distant birds and finishers',()=>{
  const s=(distance,speed=18)=>({distance,speed});
  assert.deepEqual(F.surroundings(0,[s(100)],1600),empty);
  const pair=F.surroundings(0,[s(100),s(100)],1600);
  assert.equal(pair.crowding,0);assert.equal(pair.duel,1);assert.equal(pair.leading,false);
  assert.equal(F.surroundings(0,Array.from({length:12},()=>s(0)),1600).crowding,0);
  assert.equal(F.surroundings(0,Array.from({length:12},()=>s(100)),1600).crowding,1);
  const distant=F.surroundings(0,[s(100),s(75)],1600);
  assert.equal(distant.crowding,0);assert.equal(distant.duel,0);assert.equal(distant.leading,true);
  const finished=F.surroundings(0,[s(1599),s(1600),s(1600),s(1500)],1600);
  assert.equal(finished.crowding,0);assert.equal(finished.duel,0);assert.equal(finished.leading,false);
});

test('crowd tolerance reduces hesitation and wasted work only inside the pack',()=>{
  const low=entry('a',{crowd:50},{distance:500,speed:18}),high=entry('b',{crowd:150},low.state);
  assert.deepEqual(F.decision(low,empty,1600),F.decision(high,empty,1600));
  const a=F.decision(low,pack,1600),b=F.decision(high,pack,1600);
  assert.ok(b.target>a.target);assert.ok(b.effortCost<a.effortCost);
  const run=crowd=>F.simulate(Array.from({length:6},(_,i)=>entry(String(i),{crowd})),{distance:1600});
  const weak=run(50),strong=run(150);
  assert.ok(strong[0].time<weak[0].time);
  assert.ok(strong.reduce((sum,r)=>sum+r.interactions.extraEnergy,0)<weak.reduce((sum,r)=>sum+r.interactions.extraEnergy,0));
});

test('wisdom reduces pack energy expenditure at equal speed without changing physical capacity',()=>{
  const low=entry('a',{wisdom:50},{distance:500,speed:18}),high=entry('b',{wisdom:150},low.state);
  low.state.aerobic=high.state.aerobic=P.criticalPower(low.p);
  const a=F.decision(low,pack,1600),b=F.decision(high,pack,1600);
  assert.equal(a.target,b.target);assert.ok(b.effortCost<a.effortCost);
  const x=P.step(low.state,low.p,.2,a.target,0,1,a.effortCost);
  const y=P.step(high.state,high.p,.2,b.target,0,1,b.effortCost);
  assert.equal(x.speed,y.speed);assert.ok(y.energyUsed<x.energyUsed);
  assert.ok(y.reserve>x.reserve);assert.ok(y.fatigue<x.fatigue);
  assert.deepEqual(low.p,high.p);
  assert.equal(F.decision(high,empty,1600).effortCost,1);
});

test('grit commits reserves under fatigue and responds to a close contest, within physical limits',()=>{
  const low=entry('a',{grit:50},{distance:1300,speed:19,fatigue:.6});
  low.state.reserve=low.p.reserveCapacity*.05;
  const high=entry('b',{grit:150},low.state);
  const a=F.decision(low,pack,1600),b=F.decision(high,pack,1600);
  assert.ok(b.target>a.target);assert.ok(b.target<=high.p.maxSpeed);
  assert.ok(F.decision(high,pack,2000).target>F.decision(high,{...pack,duel:0},2000).target);
  const exhausted=entry('c',{grit:150},{...low.state,reserve:0,fatigue:1});
  const action=F.decision(exhausted,pack,1600);
  const next=P.step(exhausted.state,exhausted.p,.2,action.target,0,1,action.effortCost);
  assert.ok(next.speed<exhausted.state.speed);assert.ok(next.reserve>=0);assert.ok(next.fatigue<=1);
});

test('fight increases competitive effort and control suppresses early overexertion',()=>{
  const calm=entry('a',{fight:50,control:50},{distance:500}),hot=entry('b',{fight:150,control:50},calm.state);
  assert.deepEqual(F.decision(calm,empty,1600),F.decision(hot,empty,1600));
  const a=F.decision(calm,pack,1600),b=F.decision(hot,pack,1600);
  assert.ok(b.target>a.target);assert.ok(b.effortCost>a.effortCost);
  const controlled=F.decision(entry('c',{fight:150,control:150},hot.state),pack,1600);
  assert.ok(controlled.target<b.target);assert.ok(controlled.effortCost<b.effortCost);
});

test('a wise leader saves energy but resumes effort when threatened or already beaten',()=>{
  const low=entry('a',{wisdom:50},{distance:1300,speed:22}),high=entry('b',{wisdom:150},low.state);
  const lead={...empty,leading:true,lead:60,pursuerSpeed:18};
  const a=F.decision(low,lead,1600),b=F.decision(high,lead,1600);
  assert.ok(b.target<a.target);assert.equal(b.mode,'余力温存');
  for(const danger of [{...lead,lead:5},{...lead,pursuerSpeed:30},{...lead,leading:false}]){
    const c=F.decision(high,danger,1600);
    assert.equal(c.saving,0);assert.ok(c.target>b.target);
  }
  const chase=F.surroundings(0,[high.state,{distance:1260,speed:16},{distance:1200,speed:25}],1600);
  assert.equal(chase.pursuerSpeed,25);
  const run=wisdom=>F.simulate([entry('leader',{wisdom},{distance:1300,speed:22}),
    entry('chaser',{}, {distance:1240,speed:18})],{distance:1600});
  const h=run(150),l=run(50);
  assert.ok(h[0].time<h[1].time);assert.ok(h[0].state.energyUsed<l[0].state.energyUsed);
  assert.ok(h[0].interactions.savingSeconds>0);
});

test('shared clock is deterministic, order independent and leaves entries untouched',()=>{
  const entries=Array.from({length:12},(_,i)=>entry(String(i),{crowd:50+i*8,fight:150-i*8},{distance:i*.17}));
  const original=JSON.stringify(entries),event={distance:1600,hill:.5};
  const a=F.simulate(entries,event,{trace:true}),b=F.simulate(entries.toReversed(),event,{trace:true}).reverse();
  assert.deepEqual(a,b);assert.equal(JSON.stringify(entries),original);
  assert.deepEqual(a,F.simulate(entries,event,{trace:true}));
  for(const r of a){
    assert.equal(r.finished,true);assert.equal(r.state.distance,event.distance);
    assert.deepEqual(r.samples.at(-1),{...r.state,mode:r.samples.at(-1).mode});
    assert.ok(r.samples.every((s,i)=>!i||s.time>r.samples[i-1].time&&s.distance>=r.samples[i-1].distance));
    assert.ok(r.samples.every(s=>s.speed<=r.parameters.maxSpeed&&s.reserve>=0&&s.fatigue>=0&&s.fatigue<=1));
    assert.ok(r.interactions.duelSeconds>0);
  }
});

test('finishing interpolates energy as well as time and does not run past the finish',()=>{
  const e=entry('a',{}, {distance:99,speed:18});
  const d=F.decision(e,empty,100),raw=P.step(e.state,e.p,.2,d.target,0,1,d.effortCost);
  const fraction=(100-e.state.distance)/(raw.distance-e.state.distance);
  const r=F.simulate([e],{distance:100},{trace:true})[0];
  assert.equal(r.time,.2*fraction);
  assert.equal(r.state.energyUsed,raw.energyUsed*fraction);
  assert.equal(r.state.reserve,e.state.reserve+(raw.reserve-e.state.reserve)*fraction);
  assert.equal(r.samples.at(-1).distance,100);
  const timeout=F.simulate([entry('b')],{distance:1000},{trace:true,maxTime:.15})[0];
  assert.equal(timeout.finished,false);assert.equal(timeout.time,.15);assert.equal(timeout.samples.at(-1).time,.15);
});

test('ranch entry points use the same field model, without changing saves or RNG during simulation',()=>{
  const s=R.initial(),bird=R.sires(s)[0],before=JSON.stringify(s);
  const event={distance:1600,hill:0,surface:'turf',trackId:'iseki'};
  assert.deepEqual(R.simulateBird(s,bird,event,true),R.simulateField(s,[bird],event,true)[0]);
  const birds=Array.from({length:6},(_,i)=>({...bird,id:`runner-${i}`}));
  const field=R.simulateField(s,birds,event,true);
  assert.ok(field.some(r=>r.interactions.crowdedSeconds>0));
  assert.ok(field.every(r=>r.interactions.duelSeconds>0));
  assert.notEqual(field[0].time,R.simulateBird(s,bird,event).time);
  assert.equal(JSON.stringify(s),before);
});

test('effort overhead is optional, bounded and never changes aerobic capacity',()=>{
  const e=entry('a');
  assert.deepEqual(P.step(e.state,e.p,.2,18),P.step(e.state,e.p,.2,18,0,1,1));
  for(const cost of [NaN,Infinity,0,.99,1.51])assert.throws(()=>P.step(e.state,e.p,.2,18,0,1,cost),RangeError);
  for(const options of [{dt:0},{dt:1},{maxTime:0}])assert.throws(()=>F.simulate([e],{distance:1600},options),RangeError);
  assert.throws(()=>F.simulate([e,e],{distance:1600}),RangeError);
  assert.throws(()=>F.simulate([entry('a',{grit:NaN})],{distance:1600}),RangeError);
});

test('halving the field timestep preserves personality effects and close finish times',()=>{
  for(const crowd of [50,150]){
    const entries=Array.from({length:6},(_,i)=>entry(String(i),{crowd}));
    const coarse=F.simulate(entries,{distance:2400})[0];
    const fine=F.simulate(entries,{distance:2400},{dt:.1})[0];
    assert.ok(Math.abs(coarse.time-fine.time)<.3);
    assert.ok(Math.abs(coarse.state.energyUsed-fine.state.energyUsed)/fine.state.energyUsed<.01);
  }
});

test('browser script order loads the field engine and runs a real race simulation',()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const root=path.join(__dirname,'../public'),ctx=vm.createContext({console,worldHistory:require('../tools/lib/ranch-fixtures.cjs').prepareWorld()});
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const [,src]of html.matchAll(/<script src="([^"]+)"/g)){
    if(src==='js/ranch-ui.js')break;
    vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),ctx,{filename:src});
  }
  assert.equal(vm.runInContext(`(()=>{const s=Ranch.initial(undefined,{},worldHistory);return Ranch.simulateField(s,Ranch.sires(s).slice(0,12),{distance:1600,surface:'turf'}).every(r=>r.finished)})()`,ctx),true);
});

test('race-local opponents cannot collide with persistent IDs in a long-running save',()=>{
  const W=require('../public/js/world.js'),s=R.initial(),b=R.bird(s,s.sale[0]);
  Object.assign(b,{id:'bird-10000',owner:'player',role:'racing',registered:true,birthYear:1});
  s.week=97;
  const event=W.calendar(s.week).find(e=>R.eligible(s,b,e));
  assert.ok(event);
  const result=R.race(s,b,event);
  assert.equal(new Set(result.field.map(r=>r.id)).size,12);
  assert.ok(result.interactions.duelSeconds>0);
});

test('ordinary and graded races draw varied gates and preserve them in saved replays',()=>{
  const W=require('../public/js/world.js'),Replay=require('../public/js/race-replay.js');
  for(const graded of [false,true]){
    const base=R.initial(),bird=R.bird(base,base.sale[0]);
    Object.assign(bird,{owner:'player',role:'racing',registered:true,birthYear:graded?0:1,races:graded?2:0,wins:graded?2:0});
    base.week=graded?117:97;base.money=1000000;
    const event=W.calendar(base.week).find(e=>R.eligible(base,bird,e)&&/^G/.test(e.level)===graded);
    assert.ok(event);R.worldRoster(base,event);
    const gates=new Set();
    for(let seed=1;seed<=16;seed++){
      const s=structuredClone(base);s.rng=seed;
      const loaded=R.deserializeState(R.serializeState(s)),b=R.bird(s,bird.id);
      const result=R.race(s,b,event);
      const player=result.replay.runners.find(r=>r.id===b.id);
      gates.add(player.lane);
      assert.equal(player.player,true);
      assert.equal(player.samples[0][4],player.lane);
      assert.deepEqual(result.replay.runners.map(r=>r.lane).sort((a,b)=>a-b),Array.from({length:result.field.length},(_,i)=>i));
      assert.equal(Replay.valid(result.replay,result),true);
      const saved=R.deserializeState(R.serializeState(s));
      assert.deepEqual(R.bird(saved,b.id).records.at(-1).replay,result.replay);
      if(seed===1){
        assert.deepEqual(R.race(loaded,R.bird(loaded,b.id),event),result);
        assert.equal(loaded.rng,s.rng);
      }
    }
    assert.ok(gates.size>=5,`${graded?'graded':'ordinary'} races must vary the player's gate`);
    assert.ok([...gates].some(lane=>lane>=Math.floor((R.worldRoster(base,event).length+1)/2)),'the player can draw an outer gate');
  }
});

test('multiple player entrants share one gate draw in the same graded race',()=>{
  const s=R.initial(),first=R.own(s)[0];
  Object.assign(s,{stage:'running',week:21,money:1000000,reports:[]});
  Object.assign(first,{birthYear:-2,sex:'M',wins:2,races:2,policy:'challenge',lastRace:-100});
  first.genome.distance=[.5,.5];
  first.genome.traits.aptitude.turf=[1,1];first.genome.traits.aptitude.dirt=[0,0];
  const second={...structuredClone(first),id:`bird-${s.serial++}`,name:'ハネカゼノツバサ'};s.birds.push(second);
  R.advance(s);
  const a=first.records.at(-1),b=second.records.at(-1);
  assert.equal(a.name,'チョコボダービー');assert.equal(b.name,a.name);
  assert.deepEqual(a.replay,b.replay);
  const players=a.replay.runners.filter(r=>r.player);
  assert.equal(players.length,2);assert.notEqual(players[0].lane,players[1].lane);
  assert.ok(players.every(r=>r.samples[0][4]===r.lane));
});
